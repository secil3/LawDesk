const fs = require("node:fs/promises");

const db = require("../config/db");
const { taskReadableSql } = require("../services/taskAccess");
const {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_MB,
  normalizeOriginalName,
  removeStoredFile,
  resolveStoredFile,
  verifyStoredFileSignature,
} = require("../middleware/taskAttachmentUpload");

const MAX_ATTACHMENTS_PER_TASK = 10;
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

const assertTaskAcceptsChanges = (task) => {
  if (task.archived) {
    throw createHttpError(409, "Arşivlenmiş görevde ek işlemi yapılamaz");
  }

  if (TERMINAL_STATUSES.has(task.status)) {
    throw createHttpError(
      409,
      "Tamamlanmış veya iptal edilmiş görevde ek işlemi yapılamaz",
    );
  }
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

const canManageAttachment = (actor, task, attachment) =>
  (
    Number(attachment.uploaderId) === Number(actor.id) ||
    Number(task.creatorId) === Number(actor.id) ||
    task.canManage === true
  );

const canDeleteAttachment = (actor, task, attachment) =>
  !task.archived &&
  !TERMINAL_STATUSES.has(task.status) &&
  attachment.removed !== true &&
  canManageAttachment(actor, task, attachment);

const canRestoreAttachment = (actor, task, attachment) =>
  !task.archived &&
  !TERMINAL_STATUSES.has(task.status) &&
  attachment.removed === true &&
  canManageAttachment(actor, task, attachment);

const attachmentResponse = (attachment, actor, task) => ({
  ...attachment,
  size: Number(attachment.size),
  canDelete: canDeleteAttachment(actor, task, attachment),
  canRestore: canRestoreAttachment(actor, task, attachment),
});

exports.authorizeAttachmentUpload = async (req, res, next) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const task = await findVisibleTask(db.query, req.user, taskId);
    assertTaskAcceptsChanges(task);
    req.attachmentTask = task;
    next();
  } catch (error) {
    sendError(res, error, "Ek yükleme yetkisi kontrol edilemedi");
  }
};

exports.listTaskAttachments = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const removed = req.query?.removed === "true";
    const task = await findVisibleTask(db.query, req.user, taskId);
    const result = await db.query(
      `SELECT e.ekid AS "id",
              e.dosyaadi AS "fileName",
              e.dosyaboyutubyte AS "size",
              NULL::text AS "mimeType",
              e.yukleyenkullaniciid AS "uploaderId",
              uploader.adsoyad AS "uploaderName",
              e.yuklenmetarihi AS "uploadedAt",
              e.silindimi AS "removed",
              e.silinmetarihi AS "removedAt"
       FROM ekler e
       JOIN kullanicilar uploader
         ON uploader.kullaniciid = e.yukleyenkullaniciid
       WHERE e.gorevid = $1
         AND e.silindimi = $2::boolean
       ORDER BY e.yuklenmetarihi DESC, e.ekid DESC`,
      [taskId, removed],
    );

    return res.json({
      attachments: result.rows.map((attachment) =>
        attachmentResponse(attachment, req.user, task),
      ),
      canUpload:
        !task.archived && !TERMINAL_STATUSES.has(task.status),
      removed,
      limits: {
        allowedExtensions: ALLOWED_EXTENSIONS,
        maxFileSizeMb: MAX_FILE_SIZE_MB,
        maxFilesPerTask: MAX_ATTACHMENTS_PER_TASK,
      },
    });
  } catch (error) {
    return sendError(res, error, "Görev ekleri getirilemedi");
  }
};

exports.createTaskAttachment = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Yüklenecek dosyayı seçiniz" });
  }

  const cleanupUpload = () => removeStoredFile(req.file.path);

  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const signatureValid = await verifyStoredFileSignature(
      req.file.path,
      req.file.originalname,
    );

    if (!signatureValid) {
      throw createHttpError(
        400,
        "Dosya içeriği seçilen dosya türüyle eşleşmiyor",
      );
    }

    const originalName = normalizeOriginalName(req.file.originalname);
    const fileBytes = await fs.readFile(req.file.path);

    const result = await db.withTransaction(async (transactionQuery) => {
      const task = await findVisibleTask(
        transactionQuery,
        req.user,
        taskId,
        { lock: true },
      );
      assertTaskAcceptsChanges(task);

      const countResult = await transactionQuery(
        `SELECT COUNT(*) AS "count"
         FROM ekler
         WHERE gorevid = $1
           AND silindimi = FALSE`,
        [taskId],
      );

      if (Number(countResult.rows[0]?.count || 0) >= MAX_ATTACHMENTS_PER_TASK) {
        throw createHttpError(
          409,
          `Bir görevde en fazla ${MAX_ATTACHMENTS_PER_TASK} aktif ek bulunabilir`,
        );
      }

      const insertResult = await transactionQuery(
        `INSERT INTO ekler
           (gorevid,
            dosyaadi,
            dosyayolu,
            dosyaverisi,
            dosyaboyutubyte,
            yukleyenkullaniciid)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ekid AS "id",
                   dosyaadi AS "fileName",
                   dosyaboyutubyte AS "size",
                   NULL::text AS "mimeType",
                   yukleyenkullaniciid AS "uploaderId",
                   yuklenmetarihi AS "uploadedAt",
                   silindimi AS "removed",
                   silinmetarihi AS "removedAt"`,
        [
          taskId,
          originalName,
          req.file.filename,
          fileBytes,
          req.file.size,
          req.user.id,
        ],
      );

      await recordActivity(transactionQuery, {
        actor: req.user,
        taskId,
        action: "EkYukleme",
        detail: `${req.user.adSoyad}, "${task.title}" görevine "${originalName}" dosyasını yükledi.`,
      });

      return {
        attachment: insertResult.rows[0],
        task,
      };
    });

    return res.status(201).json({
      attachment: attachmentResponse(
        {
          ...result.attachment,
          uploaderName: req.user.adSoyad,
        },
        req.user,
        result.task,
      ),
      message: "Dosya göreve eklendi",
    });
  } catch (error) {
    try {
      await cleanupUpload();
    } catch (cleanupError) {
      console.error("Başarısız ek dosyası temizlenemedi", cleanupError);
    }

    return sendError(res, error, "Dosya göreve eklenemedi");
  }
};

exports.downloadTaskAttachment = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const attachmentId = parsePositiveId(
      req.params?.attachmentId,
      "Geçersiz ek id",
    );

    await findVisibleTask(db.query, req.user, taskId);

    const result = await db.query(
      `SELECT ekid AS "id",
              dosyaadi AS "fileName",
              dosyayolu AS "storedName",
              dosyaverisi AS "fileBytes"
       FROM ekler
       WHERE ekid = $1
         AND gorevid = $2
         AND silindimi = FALSE`,
      [attachmentId, taskId],
    );

    const attachment = result.rows[0];

    if (!attachment) {
      throw createHttpError(404, "Ek dosyası bulunamadı");
    }

    if (attachment.storedName) {
      try {
        const filePath = resolveStoredFile(attachment.storedName);

        try {
          await fs.access(filePath);
        } catch (_error) {
          if (!attachment.fileBytes) {
            throw createHttpError(404, "Ek dosyası bulunamadı");
          }
        }

        return res.download(
          filePath,
          attachment.fileName,
          {
            headers: {
              "Cache-Control": "private, no-store",
              "Content-Type": "application/octet-stream",
              "X-Content-Type-Options": "nosniff",
            },
          },
          (error) => {
            if (error && !res.headersSent) {
              sendError(res, error, "Ek dosyası indirilemedi");
            }
          },
        );
      } catch (_error) {
        if (!attachment.fileBytes) {
          throw createHttpError(404, "Ek dosyası bulunamadı");
        }
      }
    }

    if (!attachment.fileBytes) {
      throw createHttpError(404, "Ek dosyası bulunamadı");
    }

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.attachment(attachment.fileName);
    return res.send(attachment.fileBytes);
  } catch (error) {
    return sendError(res, error, "Ek dosyası indirilemedi");
  }
};

exports.removeTaskAttachment = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const attachmentId = parsePositiveId(
      req.params?.attachmentId,
      "Geçersiz ek id",
    );

    await db.withTransaction(async (transactionQuery) => {
      const task = await findVisibleTask(
        transactionQuery,
        req.user,
        taskId,
      );
      assertTaskAcceptsChanges(task);

      const attachmentResult = await transactionQuery(
        `SELECT ekid AS "id",
                dosyaadi AS "fileName",
                dosyayolu AS "storedName",
                yukleyenkullaniciid AS "uploaderId",
                silindimi AS "removed"
         FROM ekler
         WHERE ekid = $1
           AND gorevid = $2
           AND silindimi = FALSE
         FOR UPDATE`,
        [attachmentId, taskId],
      );

      const attachment = attachmentResult.rows[0];

      if (!attachment) {
        throw createHttpError(404, "Ek dosyası bulunamadı");
      }

      if (!canDeleteAttachment(req.user, task, attachment)) {
        throw createHttpError(
          403,
          "Bu eki kaldırma yetkiniz bulunmuyor",
        );
      }

      const updateResult = await transactionQuery(
        `UPDATE ekler
         SET silindimi = TRUE,
             silinmetarihi = NOW(),
             silenkullaniciid = $3
         WHERE ekid = $1
           AND gorevid = $2
           AND silindimi = FALSE
         RETURNING ekid`,
        [attachmentId, taskId, req.user.id],
      );

      if (updateResult.rowCount !== 1) {
        throw createHttpError(404, "Ek dosyası bulunamadı");
      }

      await recordActivity(transactionQuery, {
        actor: req.user,
        taskId,
        action: "EkKaldirma",
        detail: `${req.user.adSoyad}, "${task.title}" görevindeki "${attachment.fileName}" ekini kaldırdı.`,
      });

      return { id: attachmentId };
    });

    return res.json({ message: "Ek görevden kaldırıldı" });
  } catch (error) {
    return sendError(res, error, "Ek görevden kaldırılamadı");
  }
};

exports.restoreTaskAttachment = async (req, res) => {
  try {
    const taskId = parsePositiveId(req.params?.id, "Geçersiz görev id");
    const attachmentId = parsePositiveId(
      req.params?.attachmentId,
      "Geçersiz ek id",
    );

    await db.withTransaction(async (transactionQuery) => {
      const task = await findVisibleTask(
        transactionQuery,
        req.user,
        taskId,
        { lock: true },
      );
      assertTaskAcceptsChanges(task);

      const attachmentResult = await transactionQuery(
        `SELECT ekid AS "id",
                dosyaadi AS "fileName",
                yukleyenkullaniciid AS "uploaderId",
                silindimi AS "removed"
         FROM ekler
         WHERE ekid = $1
           AND gorevid = $2
           AND silindimi = TRUE
         FOR UPDATE`,
        [attachmentId, taskId],
      );

      const attachment = attachmentResult.rows[0];

      if (!attachment) {
        throw createHttpError(404, "Geri yüklenecek ek bulunamadı");
      }

      if (!canRestoreAttachment(req.user, task, attachment)) {
        throw createHttpError(
          403,
          "Bu eki geri yükleme yetkiniz bulunmuyor",
        );
      }

      const countResult = await transactionQuery(
        `SELECT COUNT(*) AS "count"
         FROM ekler
         WHERE gorevid = $1
           AND silindimi = FALSE`,
        [taskId],
      );

      if (Number(countResult.rows[0]?.count || 0) >= MAX_ATTACHMENTS_PER_TASK) {
        throw createHttpError(
          409,
          `Bir görevde en fazla ${MAX_ATTACHMENTS_PER_TASK} aktif ek bulunabilir`,
        );
      }

      const restoreResult = await transactionQuery(
        `UPDATE ekler
         SET silindimi = FALSE,
             silinmetarihi = NULL,
             silenkullaniciid = NULL
         WHERE ekid = $1
           AND gorevid = $2
           AND silindimi = TRUE`,
        [attachmentId, taskId],
      );

      if (restoreResult.rowCount !== 1) {
        throw createHttpError(404, "Geri yüklenecek ek bulunamadı");
      }

      await recordActivity(transactionQuery, {
        actor: req.user,
        taskId,
        action: "EkGeriYukleme",
        detail: `${req.user.adSoyad}, "${task.title}" görevindeki "${attachment.fileName}" ekini geri yükledi.`,
      });
    });

    return res.json({ message: "Ek göreve geri yüklendi" });
  } catch (error) {
    return sendError(res, error, "Ek göreve geri yüklenemedi");
  }
};
