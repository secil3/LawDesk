const db = require("../config/db");
const { taskReadableSql } = require("../services/taskAccess");

const MAX_TAG_NAME_LENGTH = 50;
const MAX_TAGS_PER_TASK = 10;
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
  if (error?.code === "23505") {
    return res.status(409).json({
      error: "Bu etiket adı zaten kullanılıyor",
    });
  }

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

const normalizeTagName = (value) => {
  if (typeof value !== "string") {
    throw createHttpError(400, "Etiket adı zorunludur");
  }

  const name = value.trim().replace(/\s+/g, " ");

  if (!name) {
    throw createHttpError(400, "Etiket adı zorunludur");
  }

  if (name.length > MAX_TAG_NAME_LENGTH) {
    throw createHttpError(
      400,
      `Etiket adı en fazla ${MAX_TAG_NAME_LENGTH} karakter olabilir`,
    );
  }

  return name;
};

const parseTagIds = (value) => {
  if (!Array.isArray(value)) {
    throw createHttpError(400, "Etiket listesi gönderilmelidir");
  }

  if (value.length > MAX_TAGS_PER_TASK) {
    throw createHttpError(
      400,
      `Bir göreve en fazla ${MAX_TAGS_PER_TASK} etiket eklenebilir`,
    );
  }

  const tagIds = value.map((tagId) => Number(tagId));

  if (
    tagIds.some(
      (tagId) => !Number.isInteger(tagId) || tagId < 1,
    )
  ) {
    throw createHttpError(400, "Geçerli etiketler seçilmelidir");
  }

  if (new Set(tagIds).size !== tagIds.length) {
    throw createHttpError(400, "Aynı etiket birden fazla seçilemez");
  }

  return tagIds;
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

const findVisibleTask = async (
  query,
  actor,
  taskId,
  { lock = false } = {},
) => {
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
     WHERE g.gorevid = $1
     ${lock ? "FOR UPDATE OF g" : ""}`,
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

const canManageTaskTags = (actor, task) => {
  const terminal = TERMINAL_STATUSES.has(task.status);

  return (
    !task.archived &&
    !terminal &&
    (
      Number(task.creatorId) === Number(actor.id) ||
      task.canManage === true
    )
  );
};

const assertCanManageTaskTags = (actor, task) => {
  if (task.archived) {
    throw createHttpError(409, "Arşivlenmiş görevin etiketleri değiştirilemez");
  }

  if (TERMINAL_STATUSES.has(task.status)) {
    throw createHttpError(
      409,
      "Tamamlanmış veya iptal edilmiş görevin etiketleri değiştirilemez",
    );
  }

  if (!canManageTaskTags(actor, task)) {
    throw createHttpError(
      403,
      "Bu görevin etiketlerini değiştirme yetkiniz bulunmuyor",
    );
  }
};

const recordActivity = async (
  query,
  { actor, taskId = null, action, detail },
) => {
  await query(
    `INSERT INTO aktiviteloglari
       (kullaniciid, gorevid, islem, detay)
     VALUES ($1, $2, $3, $4)`,
    [actor.id, taskId, action, detail],
  );
};

const listTagsByArchiveState = async (query, archived) => {
  const result = await query(
    `SELECT etiketid AS "id",
            etiketadi AS "name",
            aktifmi AS "active",
            olusturmatarihi AS "createdAt",
            guncellemetarihi AS "updatedAt",
            arsivlenmetarihi AS "archivedAt"
     FROM etiketler
     WHERE aktifmi = $1::boolean
     ORDER BY LOWER(etiketadi) ASC, etiketid ASC`,
    [!archived],
  );

  return result.rows;
};

const listAssignedTags = async (query, taskId) => {
  const result = await query(
    `SELECT e.etiketid AS "id",
            e.etiketadi AS "name",
            e.aktifmi AS "active"
     FROM gorevetiketleri ge
     JOIN etiketler e
       ON e.etiketid = ge.etiketid
     WHERE ge.gorevid = $1
     ORDER BY e.aktifmi DESC, LOWER(e.etiketadi) ASC, e.etiketid ASC`,
    [taskId],
  );

  return result.rows;
};

const selectTagForUpdate = async (query, tagId, active) => {
  const result = await query(
    `SELECT etiketid AS "id",
            etiketadi AS "name",
            aktifmi AS "active"
     FROM etiketler
     WHERE etiketid = $1
       AND aktifmi = $2::boolean
     FOR UPDATE`,
    [tagId, active],
  );

  return result.rows[0] || null;
};

exports.listTags = async (req, res) => {
  const archived = req.query?.archived === "true";

  if (archived && !isSystemManager(req.user)) {
    return res.status(403).json({
      error: "Etiket arşivini görüntüleme yetkiniz bulunmuyor",
    });
  }

  try {
    const tags = await listTagsByArchiveState(db.query, archived);

    return res.json({
      tags,
      archived,
      canManageTags: isSystemManager(req.user),
      limits: {
        maxNameLength: MAX_TAG_NAME_LENGTH,
        maxTagsPerTask: MAX_TAGS_PER_TASK,
      },
    });
  } catch (error) {
    return sendError(res, error, "Etiketler getirilemedi");
  }
};

exports.createTag = async (req, res) => {
  try {
    const name = normalizeTagName(req.body?.etiketAdi);

    const tag = await db.withTransaction(async (transactionQuery) => {
      const result = await transactionQuery(
        `INSERT INTO etiketler
           (etiketadi, olusturankullaniciid)
         VALUES ($1, $2)
         RETURNING etiketid AS "id",
                   etiketadi AS "name",
                   aktifmi AS "active",
                   olusturmatarihi AS "createdAt",
                   guncellemetarihi AS "updatedAt",
                   arsivlenmetarihi AS "archivedAt"`,
        [name, req.user.id],
      );

      await recordActivity(transactionQuery, {
        actor: req.user,
        action: "EtiketOlusturma",
        detail: `${req.user.adSoyad}, "${name}" etiketini oluşturdu.`,
      });

      return result.rows[0];
    });

    return res.status(201).json({
      tag,
      message: "Etiket oluşturuldu",
    });
  } catch (error) {
    return sendError(res, error, "Etiket oluşturulamadı");
  }
};

exports.updateTag = async (req, res) => {
  try {
    const tagId = parsePositiveId(req.params?.tagId, "Geçersiz etiket id");
    const name = normalizeTagName(req.body?.etiketAdi);

    const tag = await db.withTransaction(async (transactionQuery) => {
      const currentTag = await selectTagForUpdate(
        transactionQuery,
        tagId,
        true,
      );

      if (!currentTag) {
        throw createHttpError(404, "Düzenlenecek aktif etiket bulunamadı");
      }

      if (currentTag.name === name) {
        throw createHttpError(409, "Etiket adında değişiklik yapılmadı");
      }

      const result = await transactionQuery(
        `UPDATE etiketler
         SET etiketadi = $1,
             guncellemetarihi = NOW()
         WHERE etiketid = $2
           AND aktifmi = TRUE
         RETURNING etiketid AS "id",
                   etiketadi AS "name",
                   aktifmi AS "active",
                   olusturmatarihi AS "createdAt",
                   guncellemetarihi AS "updatedAt",
                   arsivlenmetarihi AS "archivedAt"`,
        [name, tagId],
      );

      if (!result.rows[0]) {
        throw createHttpError(404, "Düzenlenecek aktif etiket bulunamadı");
      }

      await recordActivity(transactionQuery, {
        actor: req.user,
        action: "EtiketGuncelleme",
        detail: `${req.user.adSoyad}, "${currentTag.name}" etiketini "${name}" olarak güncelledi.`,
      });

      return result.rows[0];
    });

    return res.json({ tag, message: "Etiket güncellendi" });
  } catch (error) {
    return sendError(res, error, "Etiket güncellenemedi");
  }
};

exports.archiveTag = async (req, res) => {
  try {
    const tagId = parsePositiveId(req.params?.tagId, "Geçersiz etiket id");

    await db.withTransaction(async (transactionQuery) => {
      const tag = await selectTagForUpdate(
        transactionQuery,
        tagId,
        true,
      );

      if (!tag) {
        throw createHttpError(404, "Arşivlenecek aktif etiket bulunamadı");
      }

      const result = await transactionQuery(
        `UPDATE etiketler
         SET aktifmi = FALSE,
             arsivlenmetarihi = NOW(),
             arsivleyenkullaniciid = $2,
             guncellemetarihi = NOW()
         WHERE etiketid = $1
           AND aktifmi = TRUE`,
        [tagId, req.user.id],
      );

      if (result.rowCount !== 1) {
        throw createHttpError(404, "Arşivlenecek aktif etiket bulunamadı");
      }

      await recordActivity(transactionQuery, {
        actor: req.user,
        action: "EtiketArsivleme",
        detail: `${req.user.adSoyad}, "${tag.name}" etiketini arşivledi.`,
      });
    });

    return res.json({ message: "Etiket arşivlendi" });
  } catch (error) {
    return sendError(res, error, "Etiket arşivlenemedi");
  }
};

exports.restoreTag = async (req, res) => {
  try {
    const tagId = parsePositiveId(req.params?.tagId, "Geçersiz etiket id");

    const tag = await db.withTransaction(async (transactionQuery) => {
      const archivedTag = await selectTagForUpdate(
        transactionQuery,
        tagId,
        false,
      );

      if (!archivedTag) {
        throw createHttpError(404, "Geri yüklenecek etiket bulunamadı");
      }

      const result = await transactionQuery(
        `UPDATE etiketler
         SET aktifmi = TRUE,
             arsivlenmetarihi = NULL,
             arsivleyenkullaniciid = NULL,
             guncellemetarihi = NOW()
         WHERE etiketid = $1
           AND aktifmi = FALSE
         RETURNING etiketid AS "id",
                   etiketadi AS "name",
                   aktifmi AS "active",
                   olusturmatarihi AS "createdAt",
                   guncellemetarihi AS "updatedAt",
                   arsivlenmetarihi AS "archivedAt"`,
        [tagId],
      );

      if (!result.rows[0]) {
        throw createHttpError(404, "Geri yüklenecek etiket bulunamadı");
      }

      await recordActivity(transactionQuery, {
        actor: req.user,
        action: "EtiketGeriYukleme",
        detail: `${req.user.adSoyad}, "${archivedTag.name}" etiketini geri yükledi.`,
      });

      return result.rows[0];
    });

    return res.json({ tag, message: "Etiket geri yüklendi" });
  } catch (error) {
    return sendError(res, error, "Etiket geri yüklenemedi");
  }
};

exports.listTaskTags = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const task = await findVisibleTask(db.query, req.user, taskId);
    const [tags, availableTags] = await Promise.all([
      listAssignedTags(db.query, taskId),
      listTagsByArchiveState(db.query, false),
    ]);

    return res.json({
      tags,
      availableTags,
      canManage: canManageTaskTags(req.user, task),
      limits: { maxTagsPerTask: MAX_TAGS_PER_TASK },
    });
  } catch (error) {
    return sendError(res, error, "Görev etiketleri getirilemedi");
  }
};

exports.replaceTaskTags = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const tagIds = parseTagIds(req.body?.etiketIds);

    const result = await db.withTransaction(async (transactionQuery) => {
      const task = await findVisibleTask(
        transactionQuery,
        req.user,
        taskId,
        { lock: true },
      );
      assertCanManageTaskTags(req.user, task);

      const currentResult = await transactionQuery(
        `SELECT e.etiketid AS "id", e.etiketadi AS "name"
         FROM gorevetiketleri ge
         JOIN etiketler e
           ON e.etiketid = ge.etiketid
         WHERE ge.gorevid = $1
           AND e.aktifmi = TRUE
         ORDER BY e.etiketid ASC`,
        [taskId],
      );

      const selectedResult = tagIds.length === 0
        ? { rows: [] }
        : await transactionQuery(
            `SELECT etiketid AS "id", etiketadi AS "name"
             FROM etiketler
             WHERE etiketid = ANY($1::int[])
               AND aktifmi = TRUE
             ORDER BY etiketid ASC`,
            [tagIds],
          );

      if (selectedResult.rows.length !== tagIds.length) {
        throw createHttpError(
          400,
          "Seçilen etiketlerden biri bulunamadı veya arşivlenmiş",
        );
      }

      const currentIds = currentResult.rows
        .map((tag) => Number(tag.id))
        .sort((left, right) => left - right);
      const nextIds = [...tagIds].sort((left, right) => left - right);

      if (
        currentIds.length === nextIds.length &&
        currentIds.every((tagId, index) => tagId === nextIds[index])
      ) {
        throw createHttpError(409, "Görev etiketlerinde değişiklik yapılmadı");
      }

      await transactionQuery(
        `DELETE FROM gorevetiketleri ge
         USING etiketler e
         WHERE ge.gorevid = $1
           AND e.etiketid = ge.etiketid
           AND e.aktifmi = TRUE
           AND NOT (ge.etiketid = ANY($2::int[]))`,
        [taskId, nextIds],
      );

      if (nextIds.length > 0) {
        await transactionQuery(
          `INSERT INTO gorevetiketleri (gorevid, etiketid)
           SELECT $1, selected_tag_id
           FROM unnest($2::int[]) AS selected_tag_id
           ON CONFLICT (gorevid, etiketid) DO NOTHING`,
          [taskId, nextIds],
        );
      }

      const previousNames = currentResult.rows
        .map((tag) => tag.name)
        .join(", ") || "etiket yok";
      const nextNames = selectedResult.rows
        .map((tag) => tag.name)
        .join(", ") || "etiket yok";

      await recordActivity(transactionQuery, {
        actor: req.user,
        taskId,
        action: "GorevEtiketDegisikligi",
        detail: `${req.user.adSoyad}, "${task.title}" görevinin etiketlerini güncelledi (${previousNames} → ${nextNames}).`,
      });

      return {
        tags: await listAssignedTags(transactionQuery, taskId),
        task,
      };
    });

    return res.json({
      tags: result.tags,
      canManage: canManageTaskTags(req.user, result.task),
      message: "Görev etiketleri güncellendi",
    });
  } catch (error) {
    return sendError(res, error, "Görev etiketleri güncellenemedi");
  }
};
