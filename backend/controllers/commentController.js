const db = require("../config/db");
const { taskReadableSql } = require("../services/taskAccess");
const { createNotification } = require("./notificationController");

const MAX_COMMENT_LENGTH = 4000;
const TERMINAL_STATUSES = new Set(["Tamamlandi", "Iptal Edildi"]);

const TASK_READABLE_SQL = taskReadableSql({
  alias: "g",
  systemManagerParam: "$3",
  managedGroupIdsParam: "$5",
});

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendError = (res, error, fallbackMessage) => {
  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({ error: fallbackMessage });
};

const parsePositiveId = (value, message) => {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw createHttpError(400, message);
  }

  return id;
};

const parseVersion = (value) => {
  const version = Number(value);

  if (!Number.isInteger(version) || version < 1) {
    throw createHttpError(400, "Geçerli yorum sürümü gönderilmelidir");
  }

  return version;
};

const validateCommentText = (value) => {
  if (typeof value !== "string") {
    throw createHttpError(400, "Yorum metni zorunludur");
  }

  const text = value.trim();

  if (!text) {
    throw createHttpError(400, "Yorum metni zorunludur");
  }

  if (text.length > MAX_COMMENT_LENGTH) {
    throw createHttpError(
      400,
      `Yorum en fazla ${MAX_COMMENT_LENGTH} karakter olabilir`,
    );
  }

  return text;
};

const isSystemManager = (user) =>
  ["admin", "yonetici"].includes(user?.rol);

const groupIdsFor = (user, role = null) => [
  ...new Set(
    (user?.groups || [])
      .filter((group) => !role || group.grupRolu === role)
      .map((group) => Number(group.grupId))
      .filter((groupId) => Number.isInteger(groupId) && groupId > 0),
  ),
];

const findVisibleTask = async (query, actor, taskId) => {
  const userId = Number(actor.id);
  const systemManager = isSystemManager(actor);
  const groupIds = groupIdsFor(actor);
  const managedGroupIds = groupIdsFor(actor, "grup_yoneticisi");

  const result = await query(
    `SELECT g.gorevid AS "id",
            g.baslik AS "title",
            g.durum AS "status",
            g.arsivlendimi AS "archived",
            g.olusturankullaniciid AS "creatorId",
            g.atanankullaniciid AS "assignedUserId",
            (
              (
                $3::boolean
                OR g.olusturankullaniciid = $2
                OR g.atanankullaniciid = $2
                OR g.gorunurlukkullaniciid = $2
                OR g.atanangrupid = ANY($4::int[])
                OR g.gorunurlukgrupid = ANY($4::int[])
                OR (
                  cardinality($5::int[]) > 0
                  AND (
                    EXISTS (
                      SELECT 1
                      FROM grupuyelikleri assigned_membership
                      WHERE assigned_membership.kullaniciid = g.atanankullaniciid
                        AND assigned_membership.grupid = ANY($5::int[])
                    )
                    OR (
                      g.atanankullaniciid IS NULL
                      AND g.atanangrupid IS NULL
                      AND EXISTS (
                        SELECT 1
                        FROM grupuyelikleri creator_membership
                        WHERE creator_membership.kullaniciid = g.olusturankullaniciid
                          AND creator_membership.grupid = ANY($5::int[])
                      )
                    )
                  )
                )
              )
              AND ${TASK_READABLE_SQL}
            ) AS "canView",
            CASE
              WHEN $3::boolean THEN TRUE
              WHEN cardinality($5::int[]) > 0 AND (
                g.atanangrupid = ANY($5::int[])
                OR g.gorunurlukgrupid = ANY($5::int[])
                OR EXISTS (
                  SELECT 1
                  FROM grupuyelikleri managed_assignment
                  WHERE managed_assignment.kullaniciid = g.atanankullaniciid
                    AND managed_assignment.grupid = ANY($5::int[])
                )
                OR (
                  g.atanankullaniciid IS NULL
                  AND g.atanangrupid IS NULL
                  AND EXISTS (
                    SELECT 1
                    FROM grupuyelikleri managed_creator
                    WHERE managed_creator.kullaniciid = g.olusturankullaniciid
                      AND managed_creator.grupid = ANY($5::int[])
                  )
                )
              ) THEN TRUE
              ELSE FALSE
            END AS "canManage"
     FROM gorevler g
     WHERE g.gorevid = $1`,
    [
      taskId,
      userId,
      systemManager,
      groupIds,
      managedGroupIds,
    ],
  );

  const task = result.rows[0];

  if (!task || task.canView !== true) {
    throw createHttpError(404, "Görev bulunamadı");
  }

  return task;
};

const taskAcceptsComments = (task) =>
  !task.archived && !TERMINAL_STATUSES.has(task.status);

const assertTaskAcceptsCommentChanges = (task) => {
  if (task.archived) {
    throw createHttpError(409, "Arşivlenmiş görevde yorum işlemi yapılamaz");
  }

  if (TERMINAL_STATUSES.has(task.status)) {
    throw createHttpError(
      409,
      "Tamamlanmış veya iptal edilmiş görevde yorum işlemi yapılamaz",
    );
  }
};

const canManageComment = (actor, task, comment) =>
  Number(comment.authorId) === Number(actor.id) || task.canManage === true;

const commentResponse = (comment, actor, task) => {
  const mutableTask = taskAcceptsComments(task);
  const archived = comment.archived === true;
  const isAuthor = Number(comment.authorId) === Number(actor.id);

  return {
    ...comment,
    version: Number(comment.version),
    canEdit: mutableTask && !archived && isAuthor,
    canArchive:
      mutableTask && !archived && canManageComment(actor, task, comment),
    canRestore:
      mutableTask && archived && canManageComment(actor, task, comment),
    canViewHistory: comment.edited === true,
  };
};

const recordActivity = async (
  query,
  { actor, taskId, action, detail },
) => {
  await query(
    `INSERT INTO aktiviteloglari
       (kullaniciid, gorevid, islem, detay)
     VALUES ($1, $2, $3, $4)`,
    [actor.id, taskId, action, detail],
  );
};

const selectCommentForUpdate = async (
  query,
  taskId,
  commentId,
  archived,
) => {
  const result = await query(
    `SELECT y.yorumid AS "id",
            y.yorummetni AS "text",
            y.kullaniciid AS "authorId",
            author.adsoyad AS "authorName",
            y.olusturmatarihi AS "createdAt",
            y.guncellemetarihi AS "updatedAt",
            y.duzenlendimi AS "edited",
            y.versiyon AS "version",
            y.silindimi AS "archived",
            y.silinmetarihi AS "archivedAt"
     FROM yorumlar y
     JOIN kullanicilar author
       ON author.kullaniciid = y.kullaniciid
     WHERE y.yorumid = $1
       AND y.gorevid = $2
       AND y.silindimi = $3::boolean
     FOR UPDATE OF y`,
    [commentId, taskId, archived],
  );

  return result.rows[0] || null;
};

exports.listTaskComments = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const archived = req.query?.archived === "true";
    const task = await findVisibleTask(db.query, req.user, taskId);
    const result = await db.query(
      `SELECT y.yorumid AS "id",
              y.yorummetni AS "text",
              y.kullaniciid AS "authorId",
              author.adsoyad AS "authorName",
              y.olusturmatarihi AS "createdAt",
              y.guncellemetarihi AS "updatedAt",
              y.duzenlendimi AS "edited",
              y.versiyon AS "version",
              y.silindimi AS "archived",
              y.silinmetarihi AS "archivedAt"
       FROM yorumlar y
       JOIN kullanicilar author
         ON author.kullaniciid = y.kullaniciid
       WHERE y.gorevid = $1
         AND y.silindimi = $2::boolean
       ORDER BY y.olusturmatarihi ASC, y.yorumid ASC`,
      [taskId, archived],
    );

    return res.json({
      comments: result.rows.map((comment) =>
        commentResponse(comment, req.user, task),
      ),
      archived,
      canComment: taskAcceptsComments(task),
      limits: { maxCommentLength: MAX_COMMENT_LENGTH },
    });
  } catch (error) {
    return sendError(res, error, "Görev yorumları getirilemedi");
  }
};

exports.createTaskComment = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const text = validateCommentText(req.body?.yorumMetni);

    const result = await db.withTransaction(async (transactionQuery) => {
      const task = await findVisibleTask(
        transactionQuery,
        req.user,
        taskId,
      );
      assertTaskAcceptsCommentChanges(task);

      const insertResult = await transactionQuery(
        `INSERT INTO yorumlar
           (gorevid, kullaniciid, yorummetni)
         VALUES ($1, $2, $3)
         RETURNING yorumid AS "id",
                   yorummetni AS "text",
                   kullaniciid AS "authorId",
                   olusturmatarihi AS "createdAt",
                   guncellemetarihi AS "updatedAt",
                   duzenlendimi AS "edited",
                   versiyon AS "version",
                   silindimi AS "archived",
                   silinmetarihi AS "archivedAt"`,
        [taskId, req.user.id, text],
      );

      await recordActivity(transactionQuery, {
        actor: req.user,
        taskId,
        action: "YorumEkleme",
        detail: `${req.user.adSoyad}, "${task.title}" görevine yorum ekledi.`,
      });

      const notifiedUserIds = new Set([Number(req.user.id)]);

      if (
        task.assignedUserId &&
        !notifiedUserIds.has(Number(task.assignedUserId))
      ) {
        notifiedUserIds.add(Number(task.assignedUserId));
        await createNotification(transactionQuery, {
          userId: task.assignedUserId,
          taskId,
          type: "Guncelleme",
          message: `"${task.title}" görevine yeni bir yorum eklendi.`,
        });
      }

      if (
        task.creatorId &&
        !notifiedUserIds.has(Number(task.creatorId))
      ) {
        notifiedUserIds.add(Number(task.creatorId));
        await createNotification(transactionQuery, {
          userId: task.creatorId,
          taskId,
          type: "Guncelleme",
          message: `Oluşturduğunuz "${task.title}" görevine yeni bir yorum eklendi.`,
        });
      }

      return {
        comment: insertResult.rows[0],
        task,
      };
    });

    return res.status(201).json({
      comment: commentResponse(
        {
          ...result.comment,
          authorName: req.user.adSoyad,
        },
        req.user,
        result.task,
      ),
      message: "Yorum eklendi",
    });
  } catch (error) {
    return sendError(res, error, "Yorum eklenemedi");
  }
};

exports.updateTaskComment = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const commentId = parsePositiveId(
      req.params?.commentId,
      "Geçersiz yorum id",
    );
    const text = validateCommentText(req.body?.yorumMetni);
    const expectedVersion = parseVersion(req.body?.version);

    const result = await db.withTransaction(async (transactionQuery) => {
      const task = await findVisibleTask(
        transactionQuery,
        req.user,
        taskId,
      );
      assertTaskAcceptsCommentChanges(task);

      const comment = await selectCommentForUpdate(
        transactionQuery,
        taskId,
        commentId,
        false,
      );

      if (!comment) {
        throw createHttpError(404, "Düzenlenecek yorum bulunamadı");
      }

      if (Number(comment.authorId) !== Number(req.user.id)) {
        throw createHttpError(403, "Yalnızca kendi yorumunuzu düzenleyebilirsiniz");
      }

      if (Number(comment.version) !== expectedVersion) {
        throw createHttpError(
          409,
          "Yorum başka bir oturumda güncellendi. Güncel metni yeniden açınız",
        );
      }

      if (comment.text === text) {
        throw createHttpError(409, "Yorum metninde değişiklik yapılmadı");
      }

      await transactionQuery(
        `INSERT INTO yorumgecmisi
           (yorumid, oncekimetin, oncekiversiyon, duzenleyenkullaniciid)
         VALUES ($1, $2, $3, $4)`,
        [commentId, comment.text, expectedVersion, req.user.id],
      );

      const updateResult = await transactionQuery(
        `UPDATE yorumlar
         SET yorummetni = $1,
             duzenlendimi = TRUE,
             guncellemetarihi = NOW(),
             versiyon = versiyon + 1
         WHERE yorumid = $2
           AND gorevid = $3
           AND versiyon = $4
           AND silindimi = FALSE
         RETURNING yorumid AS "id",
                   yorummetni AS "text",
                   kullaniciid AS "authorId",
                   olusturmatarihi AS "createdAt",
                   guncellemetarihi AS "updatedAt",
                   duzenlendimi AS "edited",
                   versiyon AS "version",
                   silindimi AS "archived",
                   silinmetarihi AS "archivedAt"`,
        [text, commentId, taskId, expectedVersion],
      );

      const updatedComment = updateResult.rows[0];

      if (!updatedComment) {
        throw createHttpError(
          409,
          "Yorum başka bir oturumda güncellendi. Güncel metni yeniden açınız",
        );
      }

      await recordActivity(transactionQuery, {
        actor: req.user,
        taskId,
        action: "YorumDuzenleme",
        detail: `${req.user.adSoyad}, "${task.title}" görevindeki yorumunu düzenledi.`,
      });

      return {
        comment: {
          ...updatedComment,
          authorName: comment.authorName,
        },
        task,
      };
    });

    return res.json({
      comment: commentResponse(result.comment, req.user, result.task),
      message: "Yorum güncellendi",
    });
  } catch (error) {
    return sendError(res, error, "Yorum güncellenemedi");
  }
};

exports.listTaskCommentHistory = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const commentId = parsePositiveId(
      req.params?.commentId,
      "Geçersiz yorum id",
    );

    await findVisibleTask(db.query, req.user, taskId);

    const commentResult = await db.query(
      `SELECT yorumid AS "id"
       FROM yorumlar
       WHERE yorumid = $1
         AND gorevid = $2`,
      [commentId, taskId],
    );

    if (!commentResult.rows[0]) {
      throw createHttpError(404, "Yorum bulunamadı");
    }

    const historyResult = await db.query(
      `SELECT history.gecmisid AS "id",
              history.oncekimetin AS "text",
              history.oncekiversiyon AS "version",
              history.degisikliktarihi AS "changedAt",
              editor.kullaniciid AS "editorId",
              editor.adsoyad AS "editorName"
       FROM yorumgecmisi history
       LEFT JOIN kullanicilar editor
         ON editor.kullaniciid = history.duzenleyenkullaniciid
       WHERE history.yorumid = $1
       ORDER BY history.oncekiversiyon DESC, history.gecmisid DESC`,
      [commentId],
    );

    return res.json({
      history: historyResult.rows.map((entry) => ({
        ...entry,
        version: Number(entry.version),
      })),
    });
  } catch (error) {
    return sendError(res, error, "Yorum geçmişi getirilemedi");
  }
};

exports.archiveTaskComment = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const commentId = parsePositiveId(
      req.params?.commentId,
      "Geçersiz yorum id",
    );

    await db.withTransaction(async (transactionQuery) => {
      const task = await findVisibleTask(
        transactionQuery,
        req.user,
        taskId,
      );
      assertTaskAcceptsCommentChanges(task);

      const comment = await selectCommentForUpdate(
        transactionQuery,
        taskId,
        commentId,
        false,
      );

      if (!comment) {
        throw createHttpError(404, "Arşivlenecek yorum bulunamadı");
      }

      if (!canManageComment(req.user, task, comment)) {
        throw createHttpError(403, "Bu yorumu arşivleme yetkiniz bulunmuyor");
      }

      const updateResult = await transactionQuery(
        `UPDATE yorumlar
         SET silindimi = TRUE,
             silinmetarihi = NOW(),
             silenkullaniciid = $3
         WHERE yorumid = $1
           AND gorevid = $2
           AND silindimi = FALSE`,
        [commentId, taskId, req.user.id],
      );

      if (updateResult.rowCount !== 1) {
        throw createHttpError(404, "Arşivlenecek yorum bulunamadı");
      }

      await recordActivity(transactionQuery, {
        actor: req.user,
        taskId,
        action: "YorumArsivleme",
        detail: `${req.user.adSoyad}, "${task.title}" görevindeki bir yorumu arşivledi.`,
      });
    });

    return res.json({ message: "Yorum arşivlendi" });
  } catch (error) {
    return sendError(res, error, "Yorum arşivlenemedi");
  }
};

exports.restoreTaskComment = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const commentId = parsePositiveId(
      req.params?.commentId,
      "Geçersiz yorum id",
    );

    await db.withTransaction(async (transactionQuery) => {
      const task = await findVisibleTask(
        transactionQuery,
        req.user,
        taskId,
      );
      assertTaskAcceptsCommentChanges(task);

      const comment = await selectCommentForUpdate(
        transactionQuery,
        taskId,
        commentId,
        true,
      );

      if (!comment) {
        throw createHttpError(404, "Geri yüklenecek yorum bulunamadı");
      }

      if (!canManageComment(req.user, task, comment)) {
        throw createHttpError(
          403,
          "Bu yorumu geri yükleme yetkiniz bulunmuyor",
        );
      }

      const updateResult = await transactionQuery(
        `UPDATE yorumlar
         SET silindimi = FALSE,
             silinmetarihi = NULL,
             silenkullaniciid = NULL
         WHERE yorumid = $1
           AND gorevid = $2
           AND silindimi = TRUE`,
        [commentId, taskId],
      );

      if (updateResult.rowCount !== 1) {
        throw createHttpError(404, "Geri yüklenecek yorum bulunamadı");
      }

      await recordActivity(transactionQuery, {
        actor: req.user,
        taskId,
        action: "YorumGeriYukleme",
        detail: `${req.user.adSoyad}, "${task.title}" görevindeki bir yorumu geri yükledi.`,
      });
    });

    return res.json({ message: "Yorum geri yüklendi" });
  } catch (error) {
    return sendError(res, error, "Yorum geri yüklenemedi");
  }
};
