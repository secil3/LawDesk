const db = require("../config/db");
const { taskReadableSql } = require("../services/taskAccess");

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_SUBTASKS_PER_PARENT = 50;
const ALLOWED_PRIORITIES = new Set([
  "Kritik",
  "Yuksek",
  "Orta",
  "Dusuk",
]);
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

const normalizeText = (value, maxLength) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed.length > maxLength
    ? trimmed.slice(0, maxLength)
    : trimmed;
};

const parsePositiveId = (value, message) => {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw createHttpError(400, message);
  }

  return id;
};

const parseOptionalId = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return parsePositiveId(value, "Geçerli bir görev tipi seçiniz");
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

const validateTaskType = async (query, typeId) => {
  if (!typeId) {
    return null;
  }

  const result = await query(
    `SELECT tipid AS "id", tipadi AS "name"
     FROM gorevtipleri
     WHERE tipid = $1
       AND aktifmi = TRUE`,
    [typeId],
  );

  if (!result.rows[0]) {
    throw createHttpError(400, "Seçilen görev tipi bulunamadı");
  }

  return result.rows[0];
};

const findVisibleParent = async (
  query,
  actor,
  parentTaskId,
  { lock = false } = {},
) => {
  const userId = Number(actor.id);
  const systemManager = isSystemManager(actor);
  const groupIds = groupIdsFor(actor);
  const managedGroupIds = groupIdsFor(actor, "grup_yoneticisi");

  const result = await query(
    `SELECT g.gorevid AS "id",
            g.ustgorevid AS "parentTaskId",
            g.baslik AS "title",
            g.oncelik AS "priority",
            g.durum AS "status",
            g.bitistarihi AS "dueDate",
            g.tipid AS "typeId",
            g.atanankullaniciid AS "assignedUserId",
            assigned_user.adsoyad AS "assignedUserName",
            g.atanangrupid AS "assignedGroupId",
            assigned_group.grupadi AS "assignedGroupName",
            g.gorunurluktipi AS "visibilityType",
            g.gorunurlukkullaniciid AS "visibilityUserId",
            g.gorunurlukgrupid AS "visibilityGroupId",
            g.olusturankullaniciid AS "creatorId",
            creator.adsoyad AS "creatorName",
            g.arsivlendimi AS "archived",
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
     JOIN kullanicilar creator
       ON creator.kullaniciid = g.olusturankullaniciid
     LEFT JOIN kullanicilar assigned_user
       ON assigned_user.kullaniciid = g.atanankullaniciid
     LEFT JOIN gruplar assigned_group
       ON assigned_group.grupid = g.atanangrupid
     WHERE g.gorevid = $1
     ${lock ? "FOR UPDATE OF g" : ""}`,
    [
      parentTaskId,
      userId,
      systemManager,
      groupIds,
      managedGroupIds,
    ],
  );

  const parent = result.rows[0];

  if (!parent || parent.canView !== true) {
    throw createHttpError(404, "Ana görev bulunamadı");
  }

  return parent;
};

const canCreateSubtask = (actor, parent) =>
  !parent.parentTaskId &&
  !parent.archived &&
  !TERMINAL_STATUSES.has(parent.status) &&
  (
    Number(parent.creatorId) === Number(actor.id) ||
    parent.canManage === true
  );

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

exports.listSubtasks = async (req, res) => {
  try {
    const parentTaskId = parsePositiveId(
      req.params?.id,
      "Geçersiz ana görev id",
    );
    const archived = req.query?.archived === "true";
    const parent = await findVisibleParent(db.query, req.user, parentTaskId);

    if (parent.parentTaskId) {
      throw createHttpError(
        409,
        "Alt görevlerin altında yeni bir görev katmanı oluşturulamaz",
      );
    }

    if (archived && parent.canManage !== true) {
      throw createHttpError(
        403,
        "Alt görev arşivini görüntüleme yetkiniz bulunmuyor",
      );
    }

    const result = await db.query(
      `SELECT child.gorevid AS "id",
              child.ustgorevid AS "parentTaskId",
              child.baslik AS "title",
              child.aciklama AS "description",
              child.oncelik AS "priority",
              child.durum AS "status",
              child.bitistarihi AS "dueDate",
              child.olusturmatarihi AS "createdAt",
              child.arsivlendimi AS "archived",
              gt.tipid AS "typeId",
              gt.tipadi AS "typeName",
              assigned_user.kullaniciid AS "assignedUserId",
              assigned_user.adsoyad AS "assignedUserName",
              assigned_group.grupid AS "assignedGroupId",
              assigned_group.grupadi AS "assignedGroupName"
       FROM gorevler child
       LEFT JOIN gorevtipleri gt
         ON gt.tipid = child.tipid
       LEFT JOIN kullanicilar assigned_user
         ON assigned_user.kullaniciid = child.atanankullaniciid
       LEFT JOIN gruplar assigned_group
         ON assigned_group.grupid = child.atanangrupid
       WHERE child.ustgorevid = $1
         AND child.arsivlendimi = $2::boolean
       ORDER BY
         CASE child.durum
           WHEN 'Devam Ediyor' THEN 1
           WHEN 'Yeni Atandi' THEN 2
           WHEN 'Beklemede' THEN 3
           WHEN 'Tamamlandi' THEN 4
           ELSE 5
         END,
         child.bitistarihi ASC NULLS LAST,
         child.gorevid ASC`,
      [parentTaskId, archived],
    );

    return res.json({
      subtasks: result.rows,
      archived,
      canCreate: canCreateSubtask(req.user, parent),
      canViewArchive: parent.canManage === true,
      limits: { maxSubtasksPerParent: MAX_SUBTASKS_PER_PARENT },
    });
  } catch (error) {
    return sendError(res, error, "Alt görevler getirilemedi");
  }
};

exports.createSubtask = async (req, res) => {
  const title = normalizeText(req.body?.baslik, MAX_TITLE_LENGTH);
  const description = normalizeText(
    req.body?.aciklama,
    MAX_DESCRIPTION_LENGTH,
  );
  const requestedPriority = normalizeText(req.body?.oncelik, 20);

  if (!title) {
    return res.status(400).json({ error: "Alt görev başlığı zorunludur" });
  }

  if (requestedPriority && !ALLOWED_PRIORITIES.has(requestedPriority)) {
    return res.status(400).json({ error: "Geçerli bir öncelik seçiniz" });
  }

  let requestedTypeId = null;

  try {
    requestedTypeId = parseOptionalId(req.body?.tipId);
  } catch (error) {
    return sendError(res, error, "Alt görev oluşturulamadı");
  }

  let dueDate = null;

  if (req.body?.bitisTarihi) {
    dueDate = new Date(req.body.bitisTarihi);

    if (Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({
        error: "Geçerli bir bitiş tarihi giriniz",
      });
    }

    if (dueDate.getTime() <= Date.now()) {
      return res.status(400).json({
        error: "Bitiş tarihi geçmiş bir zaman olamaz",
      });
    }
  }

  try {
    const parentTaskId = parsePositiveId(
      req.params?.id,
      "Geçersiz ana görev id",
    );

    const result = await db.withTransaction(async (transactionQuery) => {
      const parent = await findVisibleParent(
        transactionQuery,
        req.user,
        parentTaskId,
        { lock: true },
      );

      if (parent.parentTaskId) {
        throw createHttpError(
          409,
          "Alt görevlerin altında yeni bir görev katmanı oluşturulamaz",
        );
      }

      if (parent.archived) {
        throw createHttpError(
          409,
          "Arşivlenmiş ana göreve alt görev eklenemez",
        );
      }

      if (TERMINAL_STATUSES.has(parent.status)) {
        throw createHttpError(
          409,
          "Tamamlanmış veya iptal edilmiş ana göreve alt görev eklenemez",
        );
      }

      if (!canCreateSubtask(req.user, parent)) {
        throw createHttpError(
          403,
          "Bu ana göreve alt görev ekleme yetkiniz bulunmuyor",
        );
      }

      if (
        dueDate &&
        parent.dueDate &&
        dueDate.getTime() > new Date(parent.dueDate).getTime()
      ) {
        throw createHttpError(
          400,
          "Alt görevin bitiş tarihi ana görevin bitiş tarihini geçemez",
        );
      }

      const countResult = await transactionQuery(
        `SELECT COUNT(*)::int AS "total"
         FROM gorevler
         WHERE ustgorevid = $1
           AND arsivlendimi = FALSE`,
        [parentTaskId],
      );

      if (Number(countResult.rows[0]?.total) >= MAX_SUBTASKS_PER_PARENT) {
        throw createHttpError(
          409,
          `Bir ana görevde en fazla ${MAX_SUBTASKS_PER_PARENT} aktif alt görev olabilir`,
        );
      }

      const typeId = requestedTypeId ?? (
        parent.typeId === null ? null : Number(parent.typeId)
      );
      const taskType = await validateTaskType(transactionQuery, typeId);
      const priority = requestedPriority || parent.priority || "Orta";

      const insertResult = await transactionQuery(
        `INSERT INTO gorevler
           (ustgorevid,
            baslik,
            aciklama,
            tipid,
            oncelik,
            bitistarihi,
            atanankullaniciid,
            atanangrupid,
            gorunurluktipi,
            gorunurlukkullaniciid,
            gorunurlukgrupid,
            olusturankullaniciid)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING gorevid AS "id",
                   ustgorevid AS "parentTaskId",
                   baslik AS "title",
                   aciklama AS "description",
                   oncelik AS "priority",
                   durum AS "status",
                   bitistarihi AS "dueDate",
                   olusturmatarihi AS "createdAt",
                   arsivlendimi AS "archived"`,
        [
          parentTaskId,
          title,
          description || null,
          typeId,
          priority,
          dueDate,
          parent.assignedUserId,
          parent.assignedGroupId,
          parent.visibilityType,
          parent.visibilityUserId,
          parent.visibilityGroupId,
          parent.creatorId,
        ],
      );

      const subtask = insertResult.rows[0];

      if (!subtask) {
        throw new Error("Subtask insert did not return a created row");
      }

      if (parent.assignedUserId || parent.assignedGroupId) {
        await transactionQuery(
          `INSERT INTO gorevatamagecmisi
             (gorevid, atanankullaniciid, atanangrupid, atayankullaniciid)
           VALUES ($1, $2, $3, $4)`,
          [
            subtask.id,
            parent.assignedUserId,
            parent.assignedGroupId,
            req.user.id,
          ],
        );
      }

      await recordActivity(transactionQuery, {
        actor: req.user,
        taskId: subtask.id,
        action: "AltGorevOlusturma",
        detail:
          `${req.user.adSoyad}, "${parent.title}" ana görevi altında ` +
          `"${title}" alt görevini oluşturdu.`,
      });

      return {
        parent,
        subtask,
        taskType,
      };
    });

    return res.status(201).json({
      subtask: {
        ...result.subtask,
        typeId: result.taskType?.id || null,
        typeName: result.taskType?.name || null,
        creatorId: result.parent.creatorId,
        creatorName: result.parent.creatorName,
        assignedUserId: result.parent.assignedUserId,
        assignedUserName: result.parent.assignedUserName,
        assignedGroupId: result.parent.assignedGroupId,
        assignedGroupName: result.parent.assignedGroupName,
        canManageAssignment: false,
        canManageLifecycle: result.parent.canManage === true,
        canEditTask:
          Number(result.parent.creatorId) === Number(req.user.id) ||
          result.parent.canManage === true,
        canEditDueDate:
          Number(result.parent.creatorId) === Number(req.user.id) ||
          result.parent.canManage === true,
        canRestore: false,
      },
      message: "Alt görev oluşturuldu",
    });
  } catch (error) {
    return sendError(res, error, "Alt görev oluşturulamadı");
  }
};
