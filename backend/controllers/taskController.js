const db = require("../config/db");

const ALLOWED_PRIORITIES = new Set([
  "Kritik",
  "Yuksek",
  "Orta",
  "Dusuk",
]);

const ALLOWED_STATUSES = new Set([
  "Yeni Atandi",
  "Devam Ediyor",
  "Beklemede",
  "Tamamlandi",
  "Iptal Edildi",
]);

const TASK_TAGS_SELECT = `COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', task_tag.etiketid,
        'name', task_tag.etiketadi,
        'active', task_tag.aktifmi
      )
      ORDER BY LOWER(task_tag.etiketadi) ASC, task_tag.etiketid ASC
    )
    FROM gorevetiketleri task_tag_link
    JOIN etiketler task_tag
      ON task_tag.etiketid = task_tag_link.etiketid
    WHERE task_tag_link.gorevid = g.gorevid
  ),
  '[]'::jsonb
) AS "tags"`;

const normalizeText = (value, maxLength) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed.length > maxLength
    ? trimmed.slice(0, maxLength)
    : trimmed;
};

const parseOptionalId = (value) => {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: null };
  }

  if (typeof value === "boolean") {
    return { valid: false, value: null };
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return { valid: false, value: null };
  }

  return { valid: true, value: parsed };
};

const normalizeTaskTags = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((tag) => ({
    ...tag,
    id: Number(tag.id),
    active: tag.active === true,
  }));
};

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isSystemAssigner = (user) => {
  return ["admin", "yonetici"].includes(user?.rol);
};

const managedGroupIdsFor = (user) => {
  const ids = (user?.groups || [])
    .filter((group) => group.grupRolu === "grup_yoneticisi")
    .map((group) => Number(group.grupId))
    .filter((groupId) => Number.isInteger(groupId) && groupId > 0);

  return [...new Set(ids)];
};

const allGroupIdsFor = (user) => {
  const ids = (user?.groups || [])
    .map((group) => Number(group.grupId))
    .filter((groupId) => Number.isInteger(groupId) && groupId > 0);

  return [...new Set(ids)];
};

const canAssignTasks = (user) => {
  return isSystemAssigner(user) || managedGroupIdsFor(user).length > 0;
};

const parseAssignment = (body) => {
  const userId = parseOptionalId(body?.atananKullaniciId);
  const groupId = parseOptionalId(body?.atananGrupId);

  if (!userId.valid || !groupId.valid) {
    throw createHttpError(400, "Geçerli bir atama hedefi seçiniz");
  }

  if (userId.value && groupId.value) {
    throw createHttpError(
      400,
      "Görev aynı anda hem kullanıcıya hem gruba atanamaz",
    );
  }

  return {
    userId: userId.value,
    groupId: groupId.value,
  };
};

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

const validateAssignmentTarget = async (
  query,
  actor,
  assignment,
) => {
  if (!assignment.userId && !assignment.groupId) {
    return null;
  }

  if (!canAssignTasks(actor)) {
    throw createHttpError(
      403,
      "Görev atamak için grup yöneticisi veya üstü olmalısınız",
    );
  }

  const managedGroupIds = managedGroupIdsFor(actor);

  if (assignment.groupId) {
    const result = await query(
      `SELECT grupid AS "id", grupadi AS "name"
       FROM gruplar
       WHERE grupid = $1`,
      [assignment.groupId],
    );

    const group = result.rows[0];

    if (!group) {
      throw createHttpError(400, "Atanacak grup bulunamadı");
    }

    if (
      !isSystemAssigner(actor) &&
      !managedGroupIds.includes(Number(group.id))
    ) {
      throw createHttpError(
        403,
        "Yalnızca yönettiğiniz gruplara görev atayabilirsiniz",
      );
    }

    return {
      type: "group",
      id: Number(group.id),
      name: group.name,
    };
  }

  const result = await query(
    `SELECT k.kullaniciid AS "id",
            k.adsoyad AS "name",
            COALESCE(
              array_agg(gu.grupid) FILTER (WHERE gu.grupid IS NOT NULL),
              ARRAY[]::int[]
            ) AS "groupIds"
     FROM kullanicilar k
     LEFT JOIN grupuyelikleri gu
       ON gu.kullaniciid = k.kullaniciid
     WHERE k.kullaniciid = $1
       AND k.aktifmi = TRUE
       AND k.silindimi = FALSE
     GROUP BY k.kullaniciid, k.adsoyad`,
    [assignment.userId],
  );

  const targetUser = result.rows[0];

  if (!targetUser) {
    throw createHttpError(400, "Atanacak aktif kullanıcı bulunamadı");
  }

  const targetGroupIds = Array.isArray(targetUser.groupIds)
    ? targetUser.groupIds.map(Number)
    : [];

  if (
    !isSystemAssigner(actor) &&
    !targetGroupIds.some((groupId) => managedGroupIds.includes(groupId))
  ) {
    throw createHttpError(
      403,
      "Yalnızca yönettiğiniz grupların üyelerine görev atayabilirsiniz",
    );
  }

  return {
    type: "user",
    id: Number(targetUser.id),
    name: targetUser.name,
  };
};

const assignmentVisibility = (actorId, target) => {
  if (target?.type === "user") {
    return {
      type: "Kisi",
      userId: target.id,
      groupId: null,
    };
  }

  if (target?.type === "group") {
    return {
      type: "Grup",
      userId: null,
      groupId: target.id,
    };
  }

  return {
    type: "Kisi",
    userId: actorId,
    groupId: null,
  };
};

const assignmentDescription = (target) => {
  if (target?.type === "user") {
    return `${target.name} kullanıcısına`;
  }

  if (target?.type === "group") {
    return `${target.name} grubuna`;
  }

  return "atamasız";
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

const findTaskWithManagement = async (
  query,
  actor,
  taskId,
  archived,
) => {
  const systemManager = isSystemAssigner(actor);
  const managedGroupIds = managedGroupIdsFor(actor);

  const result = await query(
    `SELECT g.gorevid AS "id",
            g.baslik AS "title",
            g.aciklama AS "description",
            g.oncelik AS "priority",
            g.durum AS "status",
            g.bitisTarihi AS "dueDate",
            g.tipid AS "typeId",
            current_type.tipadi AS "typeName",
            g.olusturankullaniciid AS "creatorId",
            g.arsivlendimi AS "archived",
            CASE
              WHEN $2::boolean THEN TRUE
              WHEN cardinality($3::int[]) > 0 AND (
                g.atanangrupid = ANY($3::int[])
                OR g.gorunurlukgrupid = ANY($3::int[])
                OR EXISTS (
                  SELECT 1
                  FROM grupuyelikleri assigned_membership
                  WHERE assigned_membership.kullaniciid = g.atanankullaniciid
                    AND assigned_membership.grupid = ANY($3::int[])
                )
                OR (
                  g.atanankullaniciid IS NULL
                  AND g.atanangrupid IS NULL
                  AND EXISTS (
                    SELECT 1
                    FROM grupuyelikleri creator_membership
                    WHERE creator_membership.kullaniciid = g.olusturankullaniciid
                      AND creator_membership.grupid = ANY($3::int[])
                  )
                )
              ) THEN TRUE
              ELSE FALSE
            END AS "canManage"
     FROM gorevler g
     LEFT JOIN gorevtipleri current_type
       ON current_type.tipid = g.tipid
     WHERE g.gorevid = $1
       AND g.arsivlendimi = $4::boolean
     FOR UPDATE OF g`,
    [taskId, systemManager, managedGroupIds, archived],
  );

  const task = result.rows[0];

  if (!task) {
    throw createHttpError(404, "Görev bulunamadı");
  }

  return task;
};

const findManageableTask = async (
  query,
  actor,
  taskId,
  archived = false,
) => {
  const task = await findTaskWithManagement(
    query,
    actor,
    taskId,
    archived,
  );

  if (!task.canManage) {
    throw createHttpError(
      403,
      "Bu görev için işlem yapma yetkiniz bulunmuyor",
    );
  }

  return task;
};

const sendError = (res, error, fallbackMessage) => {
  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({
      error: error.message,
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({
    error: fallbackMessage,
  });
};

const describeDueDate = (value) => {
  if (!value) {
    return "belirtilmemiş";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "belirtilmemiş";
  }

  return date.toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const normalizeTaskStatusFilter = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim();

  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();

  if (["open", "active", "acik"].includes(lower)) {
    return ["Yeni Atandi", "Devam Ediyor", "Beklemede"];
  }

  if (["closed", "done", "kapali", "tamamlandi"].includes(lower)) {
    return ["Tamamlandi", "Iptal Edildi"];
  }

  const directMatch = [...ALLOWED_STATUSES].find(
    (status) => status.toLowerCase() === lower,
  );

  if (directMatch) {
    return [directMatch];
  }

  return null;
};

const normalizeTaskPriorityFilter = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim();

  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();

  const aliasMap = {
    critical: "Kritik",
    kritik: "Kritik",
    high: "Yuksek",
    yuksek: "Yuksek",
    medium: "Orta",
    orta: "Orta",
    low: "Dusuk",
    dusuk: "Dusuk",
  };

  if (aliasMap[lower]) {
    return aliasMap[lower];
  }

  const directMatch = [...ALLOWED_PRIORITIES].find(
    (priority) => priority.toLowerCase() === lower,
  );

  return directMatch || null;
};

const normalizeTaskTypeFilter = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim();

  if (!normalized) {
    return null;
  }

  return `%${normalized}%`;
};

const normalizeTaskSort = (sortBy, sortOrder) => {
  if (typeof sortBy !== "string") {
    return null;
  }

  const allowedSortFields = {
    due_date: "g.bitisTarihi",
    priority: "g.oncelik",
    created_at: "g.olusturmaTarihi",
    title: "LOWER(g.baslik)",
  };

  const field = sortBy.trim();
  if (!allowedSortFields[field]) {
    return null;
  }

  const direction = typeof sortOrder === "string"
    ? sortOrder.trim().toLowerCase()
    : "";

  if (direction !== "asc" && direction !== "desc") {
    return null;
  }

  return {
    field: allowedSortFields[field],
    direction,
  };
};

const normalizePagination = (value, fallback) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

exports.getTaskOptions = async (req, res) => {
  const systemAssigner = isSystemAssigner(req.user);
  const managedGroupIds = managedGroupIdsFor(req.user);
  const canAssign = systemAssigner || managedGroupIds.length > 0;

  try {
    const typesResult = await db.query(
      `SELECT tipid AS "id", tipadi AS "name"
       FROM gorevtipleri
       WHERE aktifmi = TRUE
       ORDER BY tipadi ASC`,
    );

    if (!canAssign) {
      return res.json({
        canAssign: false,
        canManageLifecycle: false,
        canViewActivity: false,
        types: typesResult.rows,
        groups: [],
        users: [],
      });
    }

    const groupsResult = systemAssigner
      ? await db.query(
          `SELECT grupid AS "id", grupadi AS "name"
           FROM gruplar
           ORDER BY grupadi ASC`,
        )
      : await db.query(
          `SELECT grupid AS "id", grupadi AS "name"
           FROM gruplar
           WHERE grupid = ANY($1::int[])
           ORDER BY grupadi ASC`,
          [managedGroupIds],
        );

    const usersResult = systemAssigner
      ? await db.query(
          `SELECT kullaniciid AS "id", adsoyad AS "name"
           FROM kullanicilar
           WHERE aktifmi = TRUE
             AND silindimi = FALSE
           ORDER BY adsoyad ASC`,
        )
      : await db.query(
          `SELECT DISTINCT k.kullaniciid AS "id", k.adsoyad AS "name"
           FROM kullanicilar k
           JOIN grupuyelikleri gu
             ON gu.kullaniciid = k.kullaniciid
           WHERE k.aktifmi = TRUE
             AND k.silindimi = FALSE
             AND gu.grupid = ANY($1::int[])
           ORDER BY k.adsoyad ASC`,
          [managedGroupIds],
        );

    return res.json({
      canAssign: true,
      canManageLifecycle: true,
      canViewActivity: systemAssigner,
      types: typesResult.rows,
      groups: groupsResult.rows,
      users: usersResult.rows,
    });
  } catch (error) {
    return sendError(res, error, "Görev seçenekleri getirilemedi");
  }
};

exports.getTaskById = async (req, res) => {
  const taskId = Number(req.params?.id);
  const userId = Number(req.user.id);
  const systemViewer = isSystemAssigner(req.user);
  const groupIds = allGroupIdsFor(req.user);
  const managedGroupIds = managedGroupIdsFor(req.user);
  const privilegedViewer = systemViewer || managedGroupIds.length > 0;

  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({ error: "Geçersiz görev id" });
  }

  try {
    const result = await db.query(
      `SELECT g.gorevid AS "id",
              g.baslik AS "title",
              g.aciklama AS "description",
              g.oncelik AS "priority",
              g.durum AS "status",
              g.bitisTarihi AS "dueDate",
              g.olusturmaTarihi AS "createdAt",
              g.arsivlendimi AS "archived",
              g.arsivlenmetarihi AS "archivedAt",
              gt.tipid AS "typeId",
              gt.tipadi AS "typeName",
              creator.kullaniciid AS "creatorId",
              creator.adsoyad AS "creatorName",
              assigned_user.kullaniciid AS "assignedUserId",
              assigned_user.adsoyad AS "assignedUserName",
              assigned_group.grupid AS "assignedGroupId",
              assigned_group.grupadi AS "assignedGroupName",
              CASE
                WHEN $2::boolean THEN TRUE
                WHEN cardinality($4::int[]) > 0 AND (
                  g.atanangrupid = ANY($4::int[])
                  OR g.gorunurlukgrupid = ANY($4::int[])
                  OR EXISTS (
                    SELECT 1
                    FROM grupuyelikleri assigned_membership
                    WHERE assigned_membership.kullaniciid = g.atanankullaniciid
                      AND assigned_membership.grupid = ANY($4::int[])
                  )
                  OR (
                    g.atanankullaniciid IS NULL
                    AND g.atanangrupid IS NULL
                    AND EXISTS (
                      SELECT 1
                      FROM grupuyelikleri creator_membership
                      WHERE creator_membership.kullaniciid = g.olusturankullaniciid
                        AND creator_membership.grupid = ANY($4::int[])
                    )
                  )
                ) THEN TRUE
                ELSE FALSE
              END AS "canManageAssignment"
       FROM gorevler g
       LEFT JOIN gorevtipleri gt
         ON gt.tipid = g.tipid
       JOIN kullanicilar creator
         ON creator.kullaniciid = g.olusturankullaniciid
       LEFT JOIN kullanicilar assigned_user
         ON assigned_user.kullaniciid = g.atanankullaniciid
       LEFT JOIN gruplar assigned_group
         ON assigned_group.grupid = g.atanangrupid
       WHERE g.gorevid = $1
         AND (
           $2::boolean
           OR g.olusturankullaniciid = $3
           OR g.atanankullaniciid = $3
           OR g.gorunurlukkullaniciid = $3
           OR g.atanangrupid = ANY($5::int[])
           OR g.gorunurlukgrupid = ANY($5::int[])
           OR (
             cardinality($4::int[]) > 0
             AND (
               EXISTS (
                 SELECT 1
                 FROM grupuyelikleri assigned_membership
                 WHERE assigned_membership.kullaniciid = g.atanankullaniciid
                   AND assigned_membership.grupid = ANY($4::int[])
               )
               OR (
                 g.atanankullaniciid IS NULL
                 AND g.atanangrupid IS NULL
                 AND EXISTS (
                   SELECT 1
                   FROM grupuyelikleri creator_membership
                   WHERE creator_membership.kullaniciid = g.olusturankullaniciid
                     AND creator_membership.grupid = ANY($4::int[])
                 )
               )
             )
           )
         )
         AND (
           g.arsivlendimi = FALSE
           OR $6::boolean
         )
       LIMIT 1`,
      [
        taskId,
        systemViewer,
        userId,
        managedGroupIds,
        groupIds,
        privilegedViewer,
      ],
    );

    const task = result.rows[0];

    if (!task) {
      throw createHttpError(404, "Görev bulunamadı");
    }

    const canManage = task.canManageAssignment === true;
    const terminal = ["Tamamlandi", "Iptal Edildi"].includes(task.status);

    return res.json({
      task: {
        ...task,
        canManage: canManage,
        canManageAssignment: canManage,
        canManageLifecycle: canManage && !task.archived,
        canRestore: canManage && task.archived === true,
        canEditTask:
          !task.archived &&
          !terminal &&
          (Number(task.creatorId) === userId || canManage),
        canEditDueDate:
          !task.archived &&
          !terminal &&
          (Number(task.creatorId) === userId || canManage),
      },
    });
  } catch (error) {
    return sendError(res, error, "Görev detay bilgisi getirilemedi");
  }
};

exports.listTasks = async (req, res) => {
  const userId = Number(req.user.id);
  const systemViewer = isSystemAssigner(req.user);
  const groupIds = allGroupIdsFor(req.user);
  const managedGroupIds = managedGroupIdsFor(req.user);
  const privilegedViewer = systemViewer || managedGroupIds.length > 0;
  const archived = req.query?.archived === "true";

  const searchTerm = typeof req.query?.search === "string"
    ? req.query.search.trim()
    : "";
  const searchPattern = searchTerm ? `%${searchTerm}%` : null;

  const statusFilter = normalizeTaskStatusFilter(req.query?.status);
  const priorityFilter = normalizeTaskPriorityFilter(req.query?.priority);
  const taskTypeFilter = normalizeTaskTypeFilter(req.query?.taskType);
  const tagIdFilter = parseOptionalId(req.query?.tagId);
  const sortSpec = normalizeTaskSort(
    req.query?.sortBy,
    req.query?.sortOrder,
  );
  const hasPagination =
    req.query?.page !== undefined || req.query?.limit !== undefined;
  const requestedPage = normalizePagination(req.query?.page, 1);
  const requestedLimit = normalizePagination(req.query?.limit, 10);
  const maxLimit = 100;
  const limit = Math.min(requestedLimit, maxLimit);
  const page = requestedPage;
  const offset = (page - 1) * limit;

  if (!tagIdFilter.valid) {
    return res.status(400).json({
      error: "Geçerli bir etiket seçiniz",
    });
  }

  if (archived && !privilegedViewer) {
    return res.status(403).json({
      error: "Görev arşivini görüntüleme yetkiniz bulunmuyor",
    });
  }

  try {
    const clauseParts = [];
    const queryParams = [
      userId,
      systemViewer,
      groupIds,
      managedGroupIds,
      privilegedViewer,
      archived,
    ];

    if (searchPattern) {
      clauseParts.push(
        `AND (
           LOWER(COALESCE(g.baslik, '')) LIKE LOWER($${queryParams.length + 1})
           OR LOWER(COALESCE(g.aciklama, '')) LIKE LOWER($${queryParams.length + 1})
         )`,
      );
      queryParams.push(searchPattern);
    }

    if (statusFilter && statusFilter.length > 0) {
      if (statusFilter.length === 1) {
        clauseParts.push(
          `AND g.durum = $${queryParams.length + 1}`,
        );
        queryParams.push(statusFilter[0]);
      } else {
        const placeholders = statusFilter
          .map((_, index) => `$${queryParams.length + index + 1}`)
          .join(", ");
        clauseParts.push(`AND g.durum IN (${placeholders})`);
        queryParams.push(...statusFilter);
      }
    }

    if (priorityFilter) {
      clauseParts.push(
        `AND g.oncelik = $${queryParams.length + 1}`,
      );
      queryParams.push(priorityFilter);
    }

    if (taskTypeFilter) {
      clauseParts.push(
        `AND LOWER(COALESCE(gt.tipadi, '')) LIKE LOWER($${queryParams.length + 1})`,
      );
      queryParams.push(taskTypeFilter);
    }

    if (tagIdFilter.value) {
      clauseParts.push(
        `AND EXISTS (
           SELECT 1
           FROM gorevetiketleri filtered_task_tag
           JOIN etiketler filtered_tag
             ON filtered_tag.etiketid = filtered_task_tag.etiketid
           WHERE filtered_task_tag.gorevid = g.gorevid
             AND filtered_task_tag.etiketid = $${queryParams.length + 1}
             AND filtered_tag.aktifmi = TRUE
         )`,
      );
      queryParams.push(tagIdFilter.value);
    }

    const whereClause = clauseParts.join(" ");

    const orderByClause = sortSpec
      ? `ORDER BY ${sortSpec.field} ${sortSpec.direction.toUpperCase()},
         CASE WHEN $6::boolean THEN g.arsivlenmetarihi END DESC NULLS LAST,
         g.olusturmaTarihi DESC,
         g.gorevid DESC`
      : `ORDER BY
         CASE WHEN $6::boolean THEN g.arsivlenmetarihi END DESC NULLS LAST,
         g.olusturmaTarihi DESC,
         g.gorevid DESC`;

    if (!hasPagination) {
      const result = await db.query(
        `SELECT g.gorevid AS "id",
                g.baslik AS "title",
                g.aciklama AS "description",
                g.oncelik AS "priority",
                g.durum AS "status",
                g.bitisTarihi AS "dueDate",
                g.olusturmaTarihi AS "createdAt",
                g.arsivlendimi AS "archived",
                g.arsivlenmetarihi AS "archivedAt",
                gt.tipid AS "typeId",
                gt.tipadi AS "typeName",
                creator.kullaniciid AS "creatorId",
                creator.adsoyad AS "creatorName",
                assigned_user.kullaniciid AS "assignedUserId",
                assigned_user.adsoyad AS "assignedUserName",
                assigned_group.grupid AS "assignedGroupId",
                assigned_group.grupadi AS "assignedGroupName",
                ${TASK_TAGS_SELECT},
                CASE
                  WHEN $2::boolean THEN TRUE
                  WHEN cardinality($4::int[]) > 0 AND (
                    g.atanangrupid = ANY($4::int[])
                    OR g.gorunurlukgrupid = ANY($4::int[])
                    OR EXISTS (
                      SELECT 1
                      FROM grupuyelikleri assigned_membership
                      WHERE assigned_membership.kullaniciid = g.atanankullaniciid
                        AND assigned_membership.grupid = ANY($4::int[])
                    )
                    OR (
                      g.atanankullaniciid IS NULL
                      AND g.atanangrupid IS NULL
                      AND EXISTS (
                        SELECT 1
                        FROM grupuyelikleri creator_membership
                        WHERE creator_membership.kullaniciid = g.olusturankullaniciid
                          AND creator_membership.grupid = ANY($4::int[])
                      )
                    )
                  ) THEN TRUE
                  ELSE FALSE
                END AS "canManageAssignment"
         FROM gorevler g
         LEFT JOIN gorevtipleri gt
           ON gt.tipid = g.tipid
         JOIN kullanicilar creator
           ON creator.kullaniciid = g.olusturankullaniciid
         LEFT JOIN kullanicilar assigned_user
           ON assigned_user.kullaniciid = g.atanankullaniciid
         LEFT JOIN gruplar assigned_group
           ON assigned_group.grupid = g.atanangrupid
         WHERE (
           $2::boolean
           OR g.olusturankullaniciid = $1
           OR g.atanankullaniciid = $1
           OR g.gorunurlukkullaniciid = $1
           OR g.atanangrupid = ANY($3::int[])
           OR g.gorunurlukgrupid = ANY($3::int[])
           OR (
             cardinality($4::int[]) > 0
             AND (
               EXISTS (
                 SELECT 1
                 FROM grupuyelikleri assigned_membership
                 WHERE assigned_membership.kullaniciid = g.atanankullaniciid
                   AND assigned_membership.grupid = ANY($4::int[])
               )
               OR (
                 g.atanankullaniciid IS NULL
                 AND g.atanangrupid IS NULL
                 AND EXISTS (
                   SELECT 1
                   FROM grupuyelikleri creator_membership
                   WHERE creator_membership.kullaniciid = g.olusturankullaniciid
                     AND creator_membership.grupid = ANY($4::int[])
                 )
               )
             )
           )
         )
         AND ($5::boolean OR g.durum <> 'Tamamlandi')
         AND g.arsivlendimi = $6::boolean
         ${whereClause}
         ${orderByClause}`,
        queryParams,
      );

      return res.json({
        tasks: result.rows.map((task) => {
          const canManage = task.canManageAssignment === true;
          const terminal = ["Tamamlandi", "Iptal Edildi"].includes(
            task.status,
          );

          return {
            ...task,
            tags: normalizeTaskTags(task.tags),
            canManageLifecycle: canManage && !task.archived,
            canRestore: canManage && task.archived === true,
            canEditTask:
              !task.archived &&
              !terminal &&
              (Number(task.creatorId) === userId || canManage),
            canEditDueDate:
              !task.archived &&
              !terminal &&
              (Number(task.creatorId) === userId || canManage),
          };
        }),
      });
    }

    const countQuery = `SELECT COUNT(*) AS "total"
       FROM gorevler g
       LEFT JOIN gorevtipleri gt
         ON gt.tipid = g.tipid
       WHERE (
         $2::boolean
         OR g.olusturankullaniciid = $1
         OR g.atanankullaniciid = $1
         OR g.gorunurlukkullaniciid = $1
         OR g.atanangrupid = ANY($3::int[])
         OR g.gorunurlukgrupid = ANY($3::int[])
         OR (
           cardinality($4::int[]) > 0
           AND (
             EXISTS (
               SELECT 1
               FROM grupuyelikleri assigned_membership
               WHERE assigned_membership.kullaniciid = g.atanankullaniciid
                 AND assigned_membership.grupid = ANY($4::int[])
             )
             OR (
               g.atanankullaniciid IS NULL
               AND g.atanangrupid IS NULL
               AND EXISTS (
                 SELECT 1
                 FROM grupuyelikleri creator_membership
                 WHERE creator_membership.kullaniciid = g.olusturankullaniciid
                   AND creator_membership.grupid = ANY($4::int[])
               )
             )
           )
         )
       )
       AND ($5::boolean OR g.durum <> 'Tamamlandi')
       AND g.arsivlendimi = $6::boolean
       ${whereClause}`;

    const countResult = await db.query(countQuery, queryParams);
    const total = Number(countResult.rows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const result = await db.query(
      `SELECT g.gorevid AS "id",
              g.baslik AS "title",
              g.aciklama AS "description",
              g.oncelik AS "priority",
              g.durum AS "status",
              g.bitisTarihi AS "dueDate",
              g.olusturmaTarihi AS "createdAt",
              g.arsivlendimi AS "archived",
              g.arsivlenmetarihi AS "archivedAt",
              gt.tipid AS "typeId",
              gt.tipadi AS "typeName",
              creator.kullaniciid AS "creatorId",
              creator.adsoyad AS "creatorName",
              assigned_user.kullaniciid AS "assignedUserId",
              assigned_user.adsoyad AS "assignedUserName",
              assigned_group.grupid AS "assignedGroupId",
              assigned_group.grupadi AS "assignedGroupName",
              ${TASK_TAGS_SELECT},
              CASE
                WHEN $2::boolean THEN TRUE
                WHEN cardinality($4::int[]) > 0 AND (
                  g.atanangrupid = ANY($4::int[])
                  OR g.gorunurlukgrupid = ANY($4::int[])
                  OR EXISTS (
                    SELECT 1
                    FROM grupuyelikleri assigned_membership
                    WHERE assigned_membership.kullaniciid = g.atanankullaniciid
                      AND assigned_membership.grupid = ANY($4::int[])
                  )
                  OR (
                    g.atanankullaniciid IS NULL
                    AND g.atanangrupid IS NULL
                    AND EXISTS (
                      SELECT 1
                      FROM grupuyelikleri creator_membership
                      WHERE creator_membership.kullaniciid = g.olusturankullaniciid
                        AND creator_membership.grupid = ANY($4::int[])
                    )
                  )
                ) THEN TRUE
                ELSE FALSE
              END AS "canManageAssignment"
       FROM gorevler g
       LEFT JOIN gorevtipleri gt
         ON gt.tipid = g.tipid
       JOIN kullanicilar creator
         ON creator.kullaniciid = g.olusturankullaniciid
       LEFT JOIN kullanicilar assigned_user
         ON assigned_user.kullaniciid = g.atanankullaniciid
       LEFT JOIN gruplar assigned_group
         ON assigned_group.grupid = g.atanangrupid
       WHERE (
         $2::boolean
         OR g.olusturankullaniciid = $1
         OR g.atanankullaniciid = $1
         OR g.gorunurlukkullaniciid = $1
         OR g.atanangrupid = ANY($3::int[])
         OR g.gorunurlukgrupid = ANY($3::int[])
         OR (
           cardinality($4::int[]) > 0
           AND (
             EXISTS (
               SELECT 1
               FROM grupuyelikleri assigned_membership
               WHERE assigned_membership.kullaniciid = g.atanankullaniciid
                 AND assigned_membership.grupid = ANY($4::int[])
             )
             OR (
               g.atanankullaniciid IS NULL
               AND g.atanangrupid IS NULL
               AND EXISTS (
                 SELECT 1
                 FROM grupuyelikleri creator_membership
                 WHERE creator_membership.kullaniciid = g.olusturankullaniciid
                   AND creator_membership.grupid = ANY($4::int[])
               )
             )
           )
         )
       )
       AND ($5::boolean OR g.durum <> 'Tamamlandi')
       AND g.arsivlendimi = $6::boolean
       ${whereClause}
       ${orderByClause}
       LIMIT $${queryParams.length + 1}
       OFFSET $${queryParams.length + 2}`,
      [...queryParams, limit, offset],
    );

    return res.json({
      tasks: result.rows.map((task) => {
        const canManage = task.canManageAssignment === true;
        const terminal = ["Tamamlandi", "Iptal Edildi"].includes(
          task.status,
        );

        return {
          ...task,
          tags: normalizeTaskTags(task.tags),
          canManageLifecycle: canManage && !task.archived,
          canRestore: canManage && task.archived === true,
          canEditTask:
            !task.archived &&
            !terminal &&
            (Number(task.creatorId) === userId || canManage),
          canEditDueDate:
            !task.archived &&
            !terminal &&
            (Number(task.creatorId) === userId || canManage),
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return sendError(res, error, "Görev listesi getirilemedi");
  }
};

exports.createTask = async (req, res) => {
  const title = normalizeText(req.body?.baslik, 200);
  const description = normalizeText(req.body?.aciklama, 5000);
  const priority = normalizeText(req.body?.oncelik, 20) || "Orta";
  const typeId = parseOptionalId(req.body?.tipId);

  if (!title) {
    return res.status(400).json({
      error: "Görev başlığı zorunludur",
    });
  }

  if (!ALLOWED_PRIORITIES.has(priority)) {
    return res.status(400).json({
      error: "Geçerli bir öncelik seçiniz",
    });
  }

  if (!typeId.valid) {
    return res.status(400).json({
      error: "Geçerli bir görev tipi seçiniz",
    });
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
    const assignment = parseAssignment(req.body);

    const transactionResult = await db.withTransaction(
      async (transactionQuery) => {
        const taskType = await validateTaskType(
          transactionQuery,
          typeId.value,
        );
        const target = await validateAssignmentTarget(
          transactionQuery,
          req.user,
          assignment,
        );
        const visibility = assignmentVisibility(req.user.id, target);

        const insertResult = await transactionQuery(
          `INSERT INTO gorevler
             (baslik,
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
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING gorevid AS "id",
                     baslik AS "title",
                     aciklama AS "description",
                     oncelik AS "priority",
                     durum AS "status",
                     bitistarihi AS "dueDate",
                     olusturmatarihi AS "createdAt"`,
          [
            title,
            description || null,
            typeId.value,
            priority,
            dueDate,
            target?.type === "user" ? target.id : null,
            target?.type === "group" ? target.id : null,
            visibility.type,
            visibility.userId,
            visibility.groupId,
            req.user.id,
          ],
        );

        const task = insertResult.rows[0];

        if (!task) {
          throw new Error("Task insert did not return a created row");
        }

        if (target) {
          await transactionQuery(
            `INSERT INTO gorevatamagecmisi
               (gorevid, atanankullaniciid, atanangrupid, atayankullaniciid)
             VALUES ($1, $2, $3, $4)`,
            [
              task.id,
              target.type === "user" ? target.id : null,
              target.type === "group" ? target.id : null,
              req.user.id,
            ],
          );
        }

        await recordActivity(transactionQuery, {
          actor: req.user,
          taskId: task.id,
          action: "GorevOlusturma",
          detail: `${req.user.adSoyad}, "${title}" görevini oluşturdu.`,
        });

        return {
          task,
          taskType,
          target,
        };
      },
    );

    return res.status(201).json({
      task: {
        ...transactionResult.task,
        typeId: transactionResult.taskType?.id || null,
        typeName: transactionResult.taskType?.name || null,
        creatorId: req.user.id,
        creatorName: req.user.adSoyad,
        assignedUserId:
          transactionResult.target?.type === "user"
            ? transactionResult.target.id
            : null,
        assignedUserName:
          transactionResult.target?.type === "user"
            ? transactionResult.target.name
            : null,
        assignedGroupId:
          transactionResult.target?.type === "group"
            ? transactionResult.target.id
            : null,
        assignedGroupName:
          transactionResult.target?.type === "group"
            ? transactionResult.target.name
            : null,
        canManageAssignment: canAssignTasks(req.user),
        canManageLifecycle: canAssignTasks(req.user),
        canEditTask: true,
        canEditDueDate: true,
        canRestore: false,
        archived: false,
      },
      message: "Görev oluşturuldu",
    });
  } catch (error) {
    return sendError(res, error, "Görev oluşturulamadı");
  }
};

exports.updateTaskAssignment = async (req, res) => {
  const taskId = Number(req.params?.id);

  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({
      error: "Geçersiz görev id",
    });
  }

  if (!canAssignTasks(req.user)) {
    return res.status(403).json({
      error: "Görev atamak için grup yöneticisi veya üstü olmalısınız",
    });
  }

  try {
    const assignment = parseAssignment(req.body);

    if (!assignment.userId && !assignment.groupId) {
      throw createHttpError(400, "Bir kullanıcı veya grup seçiniz");
    }

    const transactionResult = await db.withTransaction(
      async (transactionQuery) => {
        const task = await findManageableTask(
          transactionQuery,
          req.user,
          taskId,
        );

        const target = await validateAssignmentTarget(
          transactionQuery,
          req.user,
          assignment,
        );
        const visibility = assignmentVisibility(req.user.id, target);

        await transactionQuery(
          `UPDATE gorevler
           SET atanankullaniciid = $1,
               atanangrupid = $2,
               gorunurluktipi = $3,
               gorunurlukkullaniciid = $4,
               gorunurlukgrupid = $5,
               guncellemetarihi = NOW()
           WHERE gorevid = $6`,
          [
            target.type === "user" ? target.id : null,
            target.type === "group" ? target.id : null,
            visibility.type,
            visibility.userId,
            visibility.groupId,
            taskId,
          ],
        );

        await transactionQuery(
          `INSERT INTO gorevatamagecmisi
             (gorevid, atanankullaniciid, atanangrupid, atayankullaniciid)
           VALUES ($1, $2, $3, $4)`,
          [
            taskId,
            target.type === "user" ? target.id : null,
            target.type === "group" ? target.id : null,
            req.user.id,
          ],
        );

        await recordActivity(transactionQuery, {
          actor: req.user,
          taskId,
          action: "GorevAtama",
          detail:
            `${req.user.adSoyad}, "${task.title}" görevini ` +
            `${assignmentDescription(target)} atadı.`,
        });

        return target;
      },
    );

    return res.json({
      assignment: {
        taskId,
        assignedUserId:
          transactionResult.type === "user"
            ? transactionResult.id
            : null,
        assignedUserName:
          transactionResult.type === "user"
            ? transactionResult.name
            : null,
        assignedGroupId:
          transactionResult.type === "group"
            ? transactionResult.id
            : null,
        assignedGroupName:
          transactionResult.type === "group"
            ? transactionResult.name
            : null,
      },
      message: "Görev ataması güncellendi",
    });
  } catch (error) {
    return sendError(res, error, "Görev ataması güncellenemedi");
  }
};

exports.updateTask = async (req, res) => {
  const taskId = Number(req.params?.id);
  const editableFields = [
    "baslik",
    "aciklama",
    "tipId",
    "oncelik",
    "bitisTarihi",
  ];
  const hasField = (field) =>
    Object.prototype.hasOwnProperty.call(req.body || {}, field);

  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({
      error: "Geçersiz görev id",
    });
  }

  if (!editableFields.some(hasField)) {
    return res.status(400).json({
      error: "Güncellenecek en az bir görev alanı gönderilmelidir",
    });
  }

  const requestedTitle = hasField("baslik")
    ? normalizeText(req.body.baslik, 200)
    : null;
  const requestedDescription = hasField("aciklama")
    ? normalizeText(req.body.aciklama, 5000)
    : null;
  const requestedPriority = hasField("oncelik")
    ? normalizeText(req.body.oncelik, 20)
    : null;
  const requestedTypeId = hasField("tipId")
    ? parseOptionalId(req.body.tipId)
    : null;

  if (hasField("baslik") && !requestedTitle) {
    return res.status(400).json({
      error: "Görev başlığı zorunludur",
    });
  }

  if (
    hasField("oncelik") &&
    !ALLOWED_PRIORITIES.has(requestedPriority)
  ) {
    return res.status(400).json({
      error: "Geçerli bir öncelik seçiniz",
    });
  }

  if (requestedTypeId && !requestedTypeId.valid) {
    return res.status(400).json({
      error: "Geçerli bir görev tipi seçiniz",
    });
  }

  let requestedDueDate = null;

  if (hasField("bitisTarihi") && req.body.bitisTarihi) {
    requestedDueDate = new Date(req.body.bitisTarihi);

    if (Number.isNaN(requestedDueDate.getTime())) {
      return res.status(400).json({
        error: "Geçerli bir bitiş tarihi giriniz",
      });
    }
  }

  try {
    const updatedTask = await db.withTransaction(
      async (transactionQuery) => {
        const task = await findTaskWithManagement(
          transactionQuery,
          req.user,
          taskId,
          false,
        );

        const isCreator =
          Number(task.creatorId) === Number(req.user.id);

        if (!isCreator && !task.canManage) {
          throw createHttpError(
            403,
            "Bu görevi düzenleme yetkiniz bulunmuyor",
          );
        }

        if (["Tamamlandi", "Iptal Edildi"].includes(task.status)) {
          throw createHttpError(
            409,
            "Görevi düzenlemek için önce yeniden açınız",
          );
        }

        const nextTitle = hasField("baslik")
          ? requestedTitle
          : task.title;
        const nextDescription = hasField("aciklama")
          ? requestedDescription || null
          : task.description || null;
        const nextPriority = hasField("oncelik")
          ? requestedPriority
          : task.priority;
        const nextTypeId = hasField("tipId")
          ? requestedTypeId.value
          : task.typeId === null
            ? null
            : Number(task.typeId);
        const nextDueDate = hasField("bitisTarihi")
          ? requestedDueDate
          : task.dueDate;
        const currentDueTime = task.dueDate
          ? new Date(task.dueDate).getTime()
          : null;
        const nextDueTime = nextDueDate
          ? new Date(nextDueDate).getTime()
          : null;
        const typeChanged =
          (task.typeId === null ? null : Number(task.typeId)) !==
          nextTypeId;

        if (
          currentDueTime !== nextDueTime &&
          nextDueTime !== null &&
          nextDueTime <= Date.now()
        ) {
          throw createHttpError(
            400,
            "Bitiş tarihi geçmiş bir zaman olamaz",
          );
        }

        let nextType = task.typeId
          ? { id: Number(task.typeId), name: task.typeName }
          : null;

        if (typeChanged) {
          nextType = await validateTaskType(
            transactionQuery,
            nextTypeId,
          );
        }

        const changes = [];

        if (task.title !== nextTitle) {
          changes.push(`Başlık ("${task.title}" → "${nextTitle}")`);
        }

        if ((task.description || null) !== nextDescription) {
          changes.push("Açıklama");
        }

        if (task.priority !== nextPriority) {
          changes.push(
            `Öncelik (${task.priority} → ${nextPriority})`,
          );
        }

        if (typeChanged) {
          changes.push(
            `Görev tipi (${task.typeName || "Belirtilmedi"} → ` +
              `${nextType?.name || "Belirtilmedi"})`,
          );
        }

        if (currentDueTime !== nextDueTime) {
          changes.push(
            `Bitiş tarihi (${describeDueDate(task.dueDate)} → ` +
              `${describeDueDate(nextDueDate)})`,
          );
        }

        if (changes.length === 0) {
          throw createHttpError(
            409,
            "Görev bilgilerinde değişiklik yapılmadı",
          );
        }

        const updateResult = await transactionQuery(
          `UPDATE gorevler
           SET baslik = $1,
               aciklama = $2,
               tipid = $3,
               oncelik = $4,
               bitistarihi = $5,
               guncellemetarihi = NOW()
           WHERE gorevid = $6
             AND arsivlendimi = FALSE
           RETURNING gorevid AS "id",
                     baslik AS "title",
                     aciklama AS "description",
                     tipid AS "typeId",
                     oncelik AS "priority",
                     durum AS "status",
                     bitistarihi AS "dueDate",
                     guncellemetarihi AS "updatedAt"`,
          [
            nextTitle,
            nextDescription,
            nextTypeId,
            nextPriority,
            nextDueDate,
            taskId,
          ],
        );

        const updated = updateResult.rows[0];

        if (!updated) {
          throw createHttpError(404, "Görev bulunamadı");
        }

        await recordActivity(transactionQuery, {
          actor: req.user,
          taskId,
          action: "GorevBilgileriDegisikligi",
          detail:
            `${req.user.adSoyad}, "${task.title}" görevinde şu alanları ` +
            `güncelledi: ${changes.join("; ")}.`,
        });

        return {
          ...updated,
          typeName: nextType?.name || null,
        };
      },
    );

    return res.json({
      task: updatedTask,
      message: "Görev bilgileri güncellendi",
    });
  } catch (error) {
    return sendError(res, error, "Görev bilgileri güncellenemedi");
  }
};

exports.updateTaskDueDate = async (req, res) => {
  const taskId = Number(req.params?.id);

  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({
      error: "Geçersiz görev id",
    });
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      req.body || {},
      "bitisTarihi",
    )
  ) {
    return res.status(400).json({
      error: "bitisTarihi alanı gönderilmelidir",
    });
  }

  let dueDate = null;

  if (req.body.bitisTarihi) {
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
    const updatedTask = await db.withTransaction(
      async (transactionQuery) => {
        const task = await findTaskWithManagement(
          transactionQuery,
          req.user,
          taskId,
          false,
        );

        const isCreator =
          Number(task.creatorId) === Number(req.user.id);

        if (!isCreator && !task.canManage) {
          throw createHttpError(
            403,
            "Bu görevin bitiş tarihini değiştirme yetkiniz bulunmuyor",
          );
        }

        if (["Tamamlandi", "Iptal Edildi"].includes(task.status)) {
          throw createHttpError(
            409,
            "Bitiş tarihini değiştirmek için görevi önce yeniden açınız",
          );
        }

        const currentDueTime = task.dueDate
          ? new Date(task.dueDate).getTime()
          : null;
        const nextDueTime = dueDate ? dueDate.getTime() : null;

        if (currentDueTime === nextDueTime) {
          throw createHttpError(409, "Bitiş tarihi zaten bu değerde");
        }

        const updateResult = await transactionQuery(
          `UPDATE gorevler
           SET bitistarihi = $1,
               guncellemetarihi = NOW()
           WHERE gorevid = $2
             AND arsivlendimi = FALSE
           RETURNING gorevid AS "id",
                     bitistarihi AS "dueDate",
                     guncellemetarihi AS "updatedAt"`,
          [dueDate, taskId],
        );

        const updated = updateResult.rows[0];

        if (!updated) {
          throw createHttpError(404, "Görev bulunamadı");
        }

        await recordActivity(transactionQuery, {
          actor: req.user,
          taskId,
          action: "BitisTarihiDegisikligi",
          detail:
            `${req.user.adSoyad}, "${task.title}" görevinin bitiş tarihini ` +
            `${describeDueDate(task.dueDate)} değerinden ` +
            `${describeDueDate(dueDate)} değerine değiştirdi.`,
        });

        return updated;
      },
    );

    return res.json({
      task: updatedTask,
      message: dueDate
        ? "Bitiş tarihi güncellendi"
        : "Bitiş tarihi kaldırıldı",
    });
  } catch (error) {
    return sendError(res, error, "Bitiş tarihi güncellenemedi");
  }
};

exports.updateTaskStatus = async (req, res) => {
  const taskId = Number(req.params?.id);
  const status = normalizeText(req.body?.durum, 30);

  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({
      error: "Geçersiz görev id",
    });
  }

  if (!ALLOWED_STATUSES.has(status)) {
    return res.status(400).json({
      error: "Geçerli bir görev durumu seçiniz",
    });
  }

  if (!canAssignTasks(req.user)) {
    return res.status(403).json({
      error:
        "Görev durumunu değiştirmek için grup yöneticisi veya üstü olmalısınız",
    });
  }

  try {
    const updatedTask = await db.withTransaction(
      async (transactionQuery) => {
        const task = await findManageableTask(
          transactionQuery,
          req.user,
          taskId,
        );

        if (task.status === status) {
          throw createHttpError(409, "Görev zaten seçilen durumda");
        }

        const updateResult = await transactionQuery(
          `UPDATE gorevler
           SET durum = $1,
               tamamlanmatarihi = CASE
                 WHEN $3::boolean
                   THEN COALESCE(tamamlanmatarihi, NOW())
                 ELSE NULL
               END,
               guncellemetarihi = NOW()
           WHERE gorevid = $2
             AND arsivlendimi = FALSE
           RETURNING gorevid AS "id",
                     durum AS "status",
                     tamamlanmatarihi AS "completedAt",
                     guncellemetarihi AS "updatedAt"`,
          [status, taskId, status === "Tamamlandi"],
        );

        const updated = updateResult.rows[0];

        if (!updated) {
          throw createHttpError(404, "Görev bulunamadı");
        }

        await recordActivity(transactionQuery, {
          actor: req.user,
          taskId,
          action: "DurumDegisikligi",
          detail:
            `${req.user.adSoyad}, "${task.title}" görevinin durumunu ` +
            `"${task.status}" durumundan "${status}" durumuna değiştirdi.`,
        });

        return updated;
      },
    );

    return res.json({
      task: updatedTask,
      message:
        status === "Tamamlandi"
          ? "Görev kapatıldı"
          : "Görev durumu güncellendi",
    });
  } catch (error) {
    return sendError(res, error, "Görev durumu güncellenemedi");
  }
};

exports.archiveTask = async (req, res) => {
  const taskId = Number(req.params?.id);

  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({
      error: "Geçersiz görev id",
    });
  }

  if (!canAssignTasks(req.user)) {
    return res.status(403).json({
      error:
        "Görev arşivlemek için grup yöneticisi veya üstü olmalısınız",
    });
  }

  try {
    await db.withTransaction(async (transactionQuery) => {
      const task = await findManageableTask(
        transactionQuery,
        req.user,
        taskId,
      );

      const updateResult = await transactionQuery(
        `UPDATE gorevler
         SET arsivlendimi = TRUE,
             arsivlenmetarihi = NOW(),
             arsivleyenkullaniciid = $1,
             guncellemetarihi = NOW()
         WHERE gorevid = $2
           AND arsivlendimi = FALSE`,
        [req.user.id, taskId],
      );

      if (updateResult.rowCount !== 1) {
        throw createHttpError(404, "Görev bulunamadı");
      }

      await recordActivity(transactionQuery, {
        actor: req.user,
        taskId,
        action: "GorevArsivleme",
        detail: `${req.user.adSoyad}, "${task.title}" görevini arşivledi.`,
      });
    });

    return res.json({
      message: "Görev arşivlendi",
    });
  } catch (error) {
    return sendError(res, error, "Görev arşivlenemedi");
  }
};

exports.restoreTask = async (req, res) => {
  const taskId = Number(req.params?.id);

  if (!Number.isInteger(taskId) || taskId < 1) {
    return res.status(400).json({
      error: "Geçersiz görev id",
    });
  }

  if (!canAssignTasks(req.user)) {
    return res.status(403).json({
      error:
        "Görev geri yüklemek için grup yöneticisi veya üstü olmalısınız",
    });
  }

  try {
    const restoredTask = await db.withTransaction(
      async (transactionQuery) => {
        const task = await findManageableTask(
          transactionQuery,
          req.user,
          taskId,
          true,
        );

        const updateResult = await transactionQuery(
          `UPDATE gorevler
           SET arsivlendimi = FALSE,
               arsivlenmetarihi = NULL,
               arsivleyenkullaniciid = NULL,
               guncellemetarihi = NOW()
           WHERE gorevid = $1
             AND arsivlendimi = TRUE
           RETURNING gorevid AS "id",
                     durum AS "status",
                     arsivlendimi AS "archived",
                     guncellemetarihi AS "updatedAt"`,
          [taskId],
        );

        const restored = updateResult.rows[0];

        if (!restored) {
          throw createHttpError(404, "Görev bulunamadı");
        }

        await recordActivity(transactionQuery, {
          actor: req.user,
          taskId,
          action: "GorevGeriYukleme",
          detail: `${req.user.adSoyad}, "${task.title}" görevini geri yükledi.`,
        });

        return restored;
      },
    );

    return res.json({
      task: restoredTask,
      message: "Görev geri yüklendi",
    });
  } catch (error) {
    return sendError(res, error, "Görev geri yüklenemedi");
  }
};

exports.listActivityLogs = async (req, res) => {
  if (!isSystemAssigner(req.user)) {
    return res.status(403).json({
      error: "İşlem kayıtlarını görüntüleme yetkiniz bulunmuyor",
    });
  }

  const requestedLimit = Number(req.query?.limit);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;

  try {
    const result = await db.query(
      `SELECT al.logid AS "id",
              al.islem AS "action",
              al.detay AS "detail",
              al.islemtarihi AS "createdAt",
              al.kullaniciid AS "actorId",
              actor.adsoyad AS "actorName",
              al.gorevid AS "taskId",
              task.baslik AS "taskTitle"
       FROM aktiviteloglari al
       LEFT JOIN kullanicilar actor
         ON actor.kullaniciid = al.kullaniciid
       LEFT JOIN gorevler task
         ON task.gorevid = al.gorevid
       ORDER BY al.islemtarihi DESC, al.logid DESC
       LIMIT $1`,
      [limit],
    );

    return res.json({
      activity: result.rows,
    });
  } catch (error) {
    return sendError(res, error, "İşlem kayıtları getirilemedi");
  }
};
