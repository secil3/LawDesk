const db = require("../config/db");

const TASK_VISIBILITY_SQL = `
  (
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
`;

const normalizeQuery = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 100);
};

const normalizeLimit = (value) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 5;
  }

  return Math.min(parsed, 10);
};

const uniquePositiveIds = (values) => {
  const ids = (values || [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return [...new Set(ids)];
};

const allGroupIdsFor = (user) => {
  return uniquePositiveIds(
    (user?.groups || []).map((group) => group.grupId),
  );
};

const managedGroupIdsFor = (user) => {
  return uniquePositiveIds(
    (user?.groups || [])
      .filter((group) => group.grupRolu === "grup_yoneticisi")
      .map((group) => group.grupId),
  );
};

const searchTasks = async ({ user, pattern, limit }) => {
  const userId = Number(user.id);
  const systemViewer = ["admin", "yonetici"].includes(user?.rol);
  const groupIds = allGroupIdsFor(user);
  const managedGroupIds = managedGroupIdsFor(user);
  const privilegedViewer = systemViewer || managedGroupIds.length > 0;

  const result = await db.query(
    `SELECT g.gorevid AS "id",
            g.baslik AS "title",
            g.durum AS "status",
            g.arsivlendimi AS "archived",
            gt.tipadi AS "typeName",
            assigned_group.grupadi AS "assignedGroupName"
     FROM gorevler g
     LEFT JOIN gorevtipleri gt
       ON gt.tipid = g.tipid
     LEFT JOIN gruplar assigned_group
       ON assigned_group.grupid = g.atanangrupid
     LEFT JOIN kullanicilar assigned_user
       ON assigned_user.kullaniciid = g.atanankullaniciid
     WHERE ${TASK_VISIBILITY_SQL}
       AND ($5::boolean OR g.durum <> 'Tamamlandi')
       AND (g.arsivlendimi = FALSE OR $5::boolean)
       AND (
         COALESCE(g.baslik, '') ILIKE $6
         OR COALESCE(g.aciklama, '') ILIKE $6
         OR g.gorevid::text ILIKE $6
         OR COALESCE(gt.tipadi, '') ILIKE $6
         OR COALESCE(assigned_group.grupadi, '') ILIKE $6
         OR COALESCE(assigned_user.adsoyad, '') ILIKE $6
         OR EXISTS (
           SELECT 1
           FROM gorevetiketleri task_tag_link
           JOIN etiketler task_tag
             ON task_tag.etiketid = task_tag_link.etiketid
           WHERE task_tag_link.gorevid = g.gorevid
             AND task_tag.etiketadi ILIKE $6
         )
         OR EXISTS (
           SELECT 1
           FROM yorumlar task_comment
           WHERE task_comment.gorevid = g.gorevid
             AND task_comment.silindimi = FALSE
             AND task_comment.yorummetni ILIKE $6
         )
         OR EXISTS (
           SELECT 1
           FROM ekler task_attachment
           WHERE task_attachment.gorevid = g.gorevid
             AND task_attachment.silindimi = FALSE
             AND task_attachment.dosyaadi ILIKE $6
         )
       )
     ORDER BY g.arsivlendimi ASC,
              g.guncellemetarihi DESC,
              g.gorevid DESC
     LIMIT $7`,
    [
      userId,
      systemViewer,
      groupIds,
      managedGroupIds,
      privilegedViewer,
      pattern,
      limit,
    ],
  );

  return result.rows.map((task) => ({
    kind: "task",
    id: Number(task.id),
    title: task.title,
    subtitle: [
      task.archived ? "Arşivlenmiş" : task.status,
      task.typeName,
      task.assignedGroupName ? `Grup: ${task.assignedGroupName}` : null,
    ].filter(Boolean).join(" · "),
    path: `/tasks/${task.id}`,
    archived: task.archived === true,
  }));
};

const searchGroups = async ({ user, pattern, limit }) => {
  const systemViewer = ["admin", "yonetici"].includes(user?.rol);
  const groupIds = allGroupIdsFor(user);

  if (!systemViewer && groupIds.length === 0) {
    return [];
  }

  const params = systemViewer
    ? [pattern, limit]
    : [groupIds, pattern, limit];
  const patternPlaceholder = systemViewer ? "$1" : "$2";
  const limitPlaceholder = systemViewer ? "$2" : "$3";
  const scopeSql = systemViewer
    ? ""
    : "AND g.grupid = ANY($1::int[])";
  const result = await db.query(
    `SELECT g.grupid AS "id",
            g.grupadi AS "title",
            g.aciklama AS "description",
            COUNT(gu.grupuyelikid)::int AS "memberCount"
     FROM gruplar g
     LEFT JOIN grupuyelikleri gu
       ON gu.grupid = g.grupid
     WHERE (
       g.grupadi ILIKE ${patternPlaceholder}
       OR COALESCE(g.aciklama, '') ILIKE ${patternPlaceholder}
     )
     ${scopeSql}
     GROUP BY g.grupid, g.grupadi, g.aciklama
     ORDER BY g.grupadi ASC
     LIMIT ${limitPlaceholder}`,
    params,
  );

  return result.rows.map((group) => ({
    kind: "group",
    id: Number(group.id),
    title: group.title,
    subtitle: group.description || `${Number(group.memberCount) || 0} üye`,
    path: "/groups",
  }));
};

const searchUsers = async ({ user, pattern, limit }) => {
  if (user?.rol !== "admin") {
    return [];
  }

  const result = await db.query(
    `SELECT k.kullaniciid AS "id",
            k.adsoyad AS "title",
            k.email,
            k.rol,
            k.aktifmi AS "active",
            k.silindimi AS "archived"
     FROM kullanicilar k
     WHERE k.rol IN ('kullanici', 'yonetici')
       AND (
         k.adsoyad ILIKE $1
         OR k.email ILIKE $1
         OR EXISTS (
           SELECT 1
           FROM grupuyelikleri user_membership
           JOIN gruplar user_group
             ON user_group.grupid = user_membership.grupid
           WHERE user_membership.kullaniciid = k.kullaniciid
             AND user_group.grupadi ILIKE $1
         )
       )
     ORDER BY k.silindimi ASC, k.adsoyad ASC
     LIMIT $2`,
    [pattern, limit],
  );

  return result.rows.map((listedUser) => ({
    kind: "user",
    id: Number(listedUser.id),
    title: listedUser.title,
    subtitle: [
      listedUser.email,
      listedUser.archived
        ? "Arşivlenmiş"
        : listedUser.active
          ? "Aktif"
          : "Pasif",
    ].filter(Boolean).join(" · "),
    path: "/users/create",
    archived: listedUser.archived === true,
  }));
};

const searchClassifications = async ({ user, pattern, limit }) => {
  if (!["admin", "yonetici"].includes(user?.rol)) {
    return [];
  }

  const result = await db.query(
    `SELECT classification.kind,
            classification.id,
            classification.title,
            classification.description,
            classification.active
     FROM (
       SELECT 'taskType'::text AS kind,
              gt.tipid AS id,
              gt.tipadi AS title,
              gt.aciklama AS description,
              gt.aktifmi AS active
       FROM gorevtipleri gt
       WHERE gt.tipadi ILIKE $1
          OR COALESCE(gt.aciklama, '') ILIKE $1

       UNION ALL

       SELECT 'tag'::text AS kind,
              e.etiketid AS id,
              e.etiketadi AS title,
              NULL::text AS description,
              e.aktifmi AS active
       FROM etiketler e
       WHERE e.etiketadi ILIKE $1
     ) classification
     ORDER BY classification.active DESC, classification.title ASC
     LIMIT $2`,
    [pattern, limit],
  );

  return result.rows.map((item) => ({
    kind: item.kind,
    id: Number(item.id),
    title: item.title,
    subtitle: item.active
      ? item.description || "Aktif"
      : "Arşivlenmiş",
    path: "/management",
    archived: item.active === false,
  }));
};

const searchActivity = async ({ user, pattern, limit }) => {
  if (!["admin", "yonetici"].includes(user?.rol)) {
    return [];
  }

  const result = await db.query(
    `SELECT activity.logid AS "id",
            activity.islem AS "action",
            activity.detay AS "detail",
            actor.adsoyad AS "actorName",
            task.baslik AS "taskTitle"
     FROM aktiviteloglari activity
     LEFT JOIN kullanicilar actor
       ON actor.kullaniciid = activity.kullaniciid
     LEFT JOIN gorevler task
       ON task.gorevid = activity.gorevid
     WHERE activity.islem ILIKE $1
        OR COALESCE(activity.detay, '') ILIKE $1
        OR COALESCE(actor.adsoyad, '') ILIKE $1
        OR COALESCE(task.baslik, '') ILIKE $1
     ORDER BY activity.islemtarihi DESC, activity.logid DESC
     LIMIT $2`,
    [pattern, limit],
  );

  return result.rows.map((activity) => ({
    kind: "activity",
    id: Number(activity.id),
    title: activity.detail || activity.action,
    subtitle: [activity.actorName, activity.taskTitle].filter(Boolean).join(" · "),
    path: "/settings",
  }));
};

exports.globalSearch = async (req, res) => {
  const query = normalizeQuery(req.query?.q);
  const limit = normalizeLimit(req.query?.limit);

  if (query.length < 2) {
    return res.status(400).json({
      error: "Arama için en az 2 karakter giriniz",
    });
  }

  const pattern = `%${query}%`;

  try {
    const [tasks, groups, users, classifications, activity] = await Promise.all([
      searchTasks({ user: req.user, pattern, limit }),
      searchGroups({ user: req.user, pattern, limit }),
      searchUsers({ user: req.user, pattern, limit }),
      searchClassifications({ user: req.user, pattern, limit }),
      searchActivity({ user: req.user, pattern, limit }),
    ]);
    const results = [
      ...tasks,
      ...groups,
      ...users,
      ...classifications,
      ...activity,
    ];

    return res.json({
      query,
      results,
      total: results.length,
      limitPerCategory: limit,
    });
  } catch (error) {
    console.error("Global search failed:", error);

    return res.status(500).json({
      error: "Genel arama tamamlanamadı",
    });
  }
};
