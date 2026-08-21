const db = require("../config/db");

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 300;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendError = (res, error, fallbackMessage) => {
  if (error?.code === "23505") {
    return res.status(409).json({
      error: "Bu görev tipi adı zaten kullanılıyor",
    });
  }

  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({ error: fallbackMessage });
};

const parsePositiveId = (value) => {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw createHttpError(400, "Geçersiz görev tipi id");
  }

  return id;
};

const parseGroupId = (value) => {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw createHttpError(400, "Görev tipi için sorumlu grup seçilmelidir");
  }

  return id;
};

const findGroup = async (query, groupId) => {
  const result = await query(
    `SELECT grupid AS "id", grupadi AS "name"
     FROM gruplar
     WHERE grupid = $1`,
    [groupId],
  );

  const group = result.rows[0];

  if (!group) {
    throw createHttpError(400, "Seçilen sorumlu grup bulunamadı");
  }

  return group;
};

const normalizeName = (value) => {
  if (typeof value !== "string") {
    throw createHttpError(400, "Görev tipi adı zorunludur");
  }

  const name = value.trim().replace(/\s+/g, " ");

  if (!name) {
    throw createHttpError(400, "Görev tipi adı zorunludur");
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw createHttpError(
      400,
      `Görev tipi adı en fazla ${MAX_NAME_LENGTH} karakter olabilir`,
    );
  }

  return name;
};

const normalizeDescription = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, "Görev tipi açıklaması metin olmalıdır");
  }

  const description = value.trim().replace(/\s+/g, " ");

  if (!description) {
    return null;
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw createHttpError(
      400,
      `Görev tipi açıklaması en fazla ${MAX_DESCRIPTION_LENGTH} karakter olabilir`,
    );
  }

  return description;
};

const recordActivity = async (query, { actor, action, detail }) => {
  await query(
    `INSERT INTO aktiviteloglari
       (kullaniciid, gorevid, islem, detay)
     VALUES ($1, NULL, $2, $3)`,
    [actor.id, action, detail],
  );
};

const listByArchiveState = async (query, archived) => {
  const result = await query(
     `SELECT gt.tipid AS "id",
             gt.tipadi AS "name",
             gt.aciklama AS "description",
             gt.grupid AS "groupId",
             responsible_group.grupadi AS "groupName",
             gt.aktifmi AS "active",
            gt.olusturmatarihi AS "createdAt",
            gt.guncellemetarihi AS "updatedAt",
            gt.arsivlenmetarihi AS "archivedAt",
            COUNT(g.gorevid)::int AS "taskCount",
            COUNT(g.gorevid) FILTER (
              WHERE g.arsivlendimi = FALSE
            )::int AS "activeTaskCount"
      FROM gorevtipleri gt
      LEFT JOIN gruplar responsible_group
        ON responsible_group.grupid = gt.grupid
      LEFT JOIN gorevler g
       ON g.tipid = gt.tipid
     WHERE gt.aktifmi = $1::boolean
     GROUP BY gt.tipid,
               gt.tipadi,
               gt.aciklama,
               gt.grupid,
               responsible_group.grupadi,
               gt.aktifmi,
              gt.olusturmatarihi,
              gt.guncellemetarihi,
              gt.arsivlenmetarihi
     ORDER BY LOWER(gt.tipadi) ASC, gt.tipid ASC`,
    [!archived],
  );

  return result.rows;
};

const selectForUpdate = async (query, typeId, active) => {
  const result = await query(
     `SELECT gt.tipid AS "id",
             gt.tipadi AS "name",
             gt.aciklama AS "description",
             gt.grupid AS "groupId",
             responsible_group.grupadi AS "groupName",
             gt.aktifmi AS "active",
            (
              SELECT COUNT(*)::int
              FROM gorevler g
              WHERE g.tipid = gt.tipid
            ) AS "taskCount"
      FROM gorevtipleri gt
      LEFT JOIN gruplar responsible_group
        ON responsible_group.grupid = gt.grupid
      WHERE gt.tipid = $1
       AND gt.aktifmi = $2::boolean
     FOR UPDATE OF gt`,
    [typeId, active],
  );

  return result.rows[0] || null;
};

exports.listTaskTypes = async (req, res) => {
  const archived = req.query?.archived === "true";

  try {
    const taskTypes = await listByArchiveState(db.query, archived);
    const groupsResult = await db.query(
      `SELECT grupid AS "id", grupadi AS "name"
       FROM gruplar
       ORDER BY grupadi ASC, grupid ASC`,
    );

    return res.json({
      taskTypes,
      groups: groupsResult.rows,
      archived,
      limits: {
        maxNameLength: MAX_NAME_LENGTH,
        maxDescriptionLength: MAX_DESCRIPTION_LENGTH,
      },
    });
  } catch (error) {
    return sendError(res, error, "Görev tipleri getirilemedi");
  }
};

exports.createTaskType = async (req, res) => {
  try {
    const name = normalizeName(req.body?.tipAdi);
    const description = normalizeDescription(req.body?.aciklama);
    const groupId = parseGroupId(req.body?.grupId);

    const taskType = await db.withTransaction(
      async (transactionQuery) => {
        const group = await findGroup(transactionQuery, groupId);
        const result = await transactionQuery(
          `INSERT INTO gorevtipleri
             (tipadi, aciklama, grupid, olusturankullaniciid)
           VALUES ($1, $2, $3, $4)
           RETURNING tipid AS "id",
                     tipadi AS "name",
                     aciklama AS "description",
                     grupid AS "groupId",
                     aktifmi AS "active",
                     olusturmatarihi AS "createdAt",
                     guncellemetarihi AS "updatedAt",
                     arsivlenmetarihi AS "archivedAt"`,
          [name, description, groupId, req.user.id],
        );

        await recordActivity(transactionQuery, {
          actor: req.user,
          action: "GorevTipiOlusturma",
          detail:
            `${req.user.adSoyad}, "${name}" görev tipini ` +
            `"${group.name}" grubuna bağlı olarak oluşturdu.`,
        });

        return {
          ...result.rows[0],
          groupName: group.name,
          taskCount: 0,
          activeTaskCount: 0,
        };
      },
    );

    return res.status(201).json({
      taskType,
      message: "Görev tipi oluşturuldu",
    });
  } catch (error) {
    return sendError(res, error, "Görev tipi oluşturulamadı");
  }
};

exports.updateTaskType = async (req, res) => {
  try {
    const typeId = parsePositiveId(req.params?.typeId);
    const hasName = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "tipAdi",
    );
    const hasDescription = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "aciklama",
    );
    const hasGroupId = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "grupId",
    );

    if (!hasName && !hasDescription && !hasGroupId) {
      throw createHttpError(
        400,
        "Güncellenecek görev tipi bilgisi gönderilmelidir",
      );
    }

    const requestedName = hasName
      ? normalizeName(req.body.tipAdi)
      : null;
    const requestedDescription = hasDescription
      ? normalizeDescription(req.body.aciklama)
      : null;
    const requestedGroupId = hasGroupId
      ? parseGroupId(req.body.grupId)
      : null;

    const taskType = await db.withTransaction(
      async (transactionQuery) => {
        const current = await selectForUpdate(
          transactionQuery,
          typeId,
          true,
        );

        if (!current) {
          throw createHttpError(
            404,
            "Düzenlenecek aktif görev tipi bulunamadı",
          );
        }

        const nextName = hasName ? requestedName : current.name;
        const nextDescription = hasDescription
          ? requestedDescription
          : current.description || null;
        const nextGroupId = hasGroupId
          ? requestedGroupId
          : Number(current.groupId) || null;
        const nextGroup = await findGroup(transactionQuery, nextGroupId);

        if (
          current.name === nextName &&
          (current.description || null) === nextDescription &&
          Number(current.groupId) === Number(nextGroupId)
        ) {
          throw createHttpError(
            409,
            "Görev tipi bilgilerinde değişiklik yapılmadı",
          );
        }

        const result = await transactionQuery(
          `UPDATE gorevtipleri
           SET tipadi = $1,
               aciklama = $2,
               grupid = $3,
               guncellemetarihi = NOW()
           WHERE tipid = $4
             AND aktifmi = TRUE
           RETURNING tipid AS "id",
                     tipadi AS "name",
                     aciklama AS "description",
                     grupid AS "groupId",
                     aktifmi AS "active",
                     olusturmatarihi AS "createdAt",
                     guncellemetarihi AS "updatedAt",
                     arsivlenmetarihi AS "archivedAt"`,
          [nextName, nextDescription, nextGroupId, typeId],
        );

        if (!result.rows[0]) {
          throw createHttpError(
            404,
            "Düzenlenecek aktif görev tipi bulunamadı",
          );
        }

        const changes = [];

        if (current.name !== nextName) {
          changes.push(`ad ("${current.name}" → "${nextName}")`);
        }

        if ((current.description || null) !== nextDescription) {
          changes.push("açıklama");
        }

        if (Number(current.groupId) !== Number(nextGroupId)) {
          changes.push(
            `sorumlu grup ("${current.groupName || "Atanmamış"}" → ` +
            `"${nextGroup.name}")`,
          );
        }

        await recordActivity(transactionQuery, {
          actor: req.user,
          action: "GorevTipiGuncelleme",
          detail:
            `${req.user.adSoyad}, "${current.name}" görev tipini ` +
            `güncelledi (${changes.join(", ")}).`,
        });

        return {
          ...result.rows[0],
          groupName: nextGroup.name,
          taskCount: Number(current.taskCount || 0),
        };
      },
    );

    return res.json({
      taskType,
      message: "Görev tipi güncellendi",
    });
  } catch (error) {
    return sendError(res, error, "Görev tipi güncellenemedi");
  }
};

exports.archiveTaskType = async (req, res) => {
  try {
    const typeId = parsePositiveId(req.params?.typeId);

    const taskCount = await db.withTransaction(
      async (transactionQuery) => {
        const taskType = await selectForUpdate(
          transactionQuery,
          typeId,
          true,
        );

        if (!taskType) {
          throw createHttpError(
            404,
            "Arşivlenecek aktif görev tipi bulunamadı",
          );
        }

        const result = await transactionQuery(
          `UPDATE gorevtipleri
           SET aktifmi = FALSE,
               arsivlenmetarihi = NOW(),
               arsivleyenkullaniciid = $2,
               guncellemetarihi = NOW()
           WHERE tipid = $1
             AND aktifmi = TRUE`,
          [typeId, req.user.id],
        );

        if (result.rowCount !== 1) {
          throw createHttpError(
            404,
            "Arşivlenecek aktif görev tipi bulunamadı",
          );
        }

        await recordActivity(transactionQuery, {
          actor: req.user,
          action: "GorevTipiArsivleme",
          detail:
            `${req.user.adSoyad}, "${taskType.name}" görev tipini ` +
            `arşivledi. Bu tipe bağlı ${taskType.taskCount} görev korundu.`,
        });

        return Number(taskType.taskCount || 0);
      },
    );

    return res.json({
      taskCount,
      message:
        taskCount > 0
          ? `Görev tipi arşivlendi; bu tipi kullanan ${taskCount} görev korundu`
          : "Görev tipi arşivlendi",
    });
  } catch (error) {
    return sendError(res, error, "Görev tipi arşivlenemedi");
  }
};

exports.restoreTaskType = async (req, res) => {
  try {
    const typeId = parsePositiveId(req.params?.typeId);

    const taskType = await db.withTransaction(
      async (transactionQuery) => {
        const archived = await selectForUpdate(
          transactionQuery,
          typeId,
          false,
        );

        if (!archived) {
          throw createHttpError(
            404,
            "Geri yüklenecek görev tipi bulunamadı",
          );
        }

        const result = await transactionQuery(
          `UPDATE gorevtipleri
           SET aktifmi = TRUE,
               arsivlenmetarihi = NULL,
               arsivleyenkullaniciid = NULL,
               guncellemetarihi = NOW()
           WHERE tipid = $1
             AND aktifmi = FALSE
           RETURNING tipid AS "id",
                     tipadi AS "name",
                     aciklama AS "description",
                     grupid AS "groupId",
                     aktifmi AS "active",
                     olusturmatarihi AS "createdAt",
                     guncellemetarihi AS "updatedAt",
                     arsivlenmetarihi AS "archivedAt"`,
          [typeId],
        );

        if (!result.rows[0]) {
          throw createHttpError(
            404,
            "Geri yüklenecek görev tipi bulunamadı",
          );
        }

        await recordActivity(transactionQuery, {
          actor: req.user,
          action: "GorevTipiGeriYukleme",
          detail:
            `${req.user.adSoyad}, "${archived.name}" görev tipini geri yükledi.`,
        });

        return {
          ...result.rows[0],
          groupName: archived.groupName || null,
          taskCount: Number(archived.taskCount || 0),
        };
      },
    );

    return res.json({
      taskType,
      message: "Görev tipi geri yüklendi",
    });
  } catch (error) {
    return sendError(res, error, "Görev tipi geri yüklenemedi");
  }
};
