const db = require("../config/db");

const isSystemViewer = (user) => {
  return ["admin", "yonetici"].includes(user?.rol);
};

const allGroupIdsFor = (user) => {
  const ids = (user?.groups || [])
    .map((group) => Number(group.grupId))
    .filter((groupId) => Number.isInteger(groupId) && groupId > 0);

  return [...new Set(ids)];
};

const managedGroupIdsFor = (user) => {
  const ids = (user?.groups || [])
    .filter((group) => group.grupRolu === "grup_yoneticisi")
    .map((group) => Number(group.grupId))
    .filter((groupId) => Number.isInteger(groupId) && groupId > 0);

  return [...new Set(ids)];
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

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
            WHERE creator_membership.kullaniciid =
              g.olusturankullaniciid
              AND creator_membership.grupid = ANY($4::int[])
          )
        )
      )
    )
  )
`;

exports.getDashboardSummary = async (req, res) => {
  const userId = Number(req.user.id);
  const systemViewer = isSystemViewer(req.user);
  const groupIds = allGroupIdsFor(req.user);
  const managedGroupIds = managedGroupIdsFor(req.user);
  const privilegedViewer =
    systemViewer || managedGroupIds.length > 0;

  const queryParams = [
    userId,
    systemViewer,
    groupIds,
    managedGroupIds,
    privilegedViewer,
  ];

  try {
    const summaryResult = await db.query(
      `WITH visible_tasks AS (
         SELECT g.*
         FROM gorevler g
         WHERE ${TASK_VISIBILITY_SQL}
           AND ($5::boolean OR g.durum <> 'Tamamlandi')
       )
       SELECT
         (
           COUNT(*) FILTER (
             WHERE arsivlendimi = FALSE
           )
         )::int AS "activeTasks",
         (
           COUNT(*) FILTER (
             WHERE arsivlendimi = TRUE
               AND $5::boolean
           )
         )::int AS "archivedTasks",
         (
           COUNT(*) FILTER (
             WHERE arsivlendimi = FALSE
               AND durum = 'Yeni Atandi'
           )
         )::int AS "newAssigned",
         (
           COUNT(*) FILTER (
             WHERE arsivlendimi = FALSE
               AND durum = 'Devam Ediyor'
           )
         )::int AS "inProgress",
         (
           COUNT(*) FILTER (
             WHERE arsivlendimi = FALSE
               AND durum = 'Beklemede'
           )
         )::int AS "waiting",
         (
           COUNT(*) FILTER (
             WHERE arsivlendimi = FALSE
               AND durum = 'Tamamlandi'
           )
         )::int AS "completed",
         (
           COUNT(*) FILTER (
             WHERE arsivlendimi = FALSE
               AND durum = 'Iptal Edildi'
           )
         )::int AS "cancelled",
         CASE
           WHEN $2::boolean THEN (
             SELECT COUNT(*)::int
             FROM gruplar
           )
           ELSE cardinality($3::int[])
         END AS "groupCount"
       FROM visible_tasks`,
      queryParams,
    );

    const recentTasksResult = await db.query(
      `SELECT
         g.gorevid AS "id",
         g.baslik AS "title",
         g.aciklama AS "description",
         g.oncelik AS "priority",
         g.durum AS "status",
         g.bitisTarihi AS "dueDate",
         gt.tipadi AS "typeName"
       FROM gorevler g
       LEFT JOIN gorevtipleri gt
         ON gt.tipid = g.tipid
       WHERE ${TASK_VISIBILITY_SQL}
         AND ($5::boolean OR g.durum <> 'Tamamlandi')
         AND g.arsivlendimi = FALSE
       ORDER BY
         g.bitisTarihi ASC NULLS LAST,
         g.olusturmaTarihi DESC,
         g.gorevid DESC
       LIMIT 6`,
      queryParams,
    );

    const summary = summaryResult.rows[0] || {};
    const activeTasks = toNumber(summary.activeTasks);
    const archivedTasks = toNumber(summary.archivedTasks);

    return res.json({
      totalTasks: activeTasks + archivedTasks,
      activeTasks,
      archivedTasks,
      groupCount: toNumber(summary.groupCount),
      canViewArchive: privilegedViewer,
      statusCounts: {
        "Yeni Atandi": toNumber(summary.newAssigned),
        "Devam Ediyor": toNumber(summary.inProgress),
        Beklemede: toNumber(summary.waiting),
        Tamamlandi: toNumber(summary.completed),
        "Iptal Edildi": toNumber(summary.cancelled),
      },
      recentTasks: recentTasksResult.rows,
    });
  } catch (error) {
    console.error("Dashboard özeti getirilemedi", error);

    return res.status(500).json({
      error: "Dashboard özeti getirilemedi",
    });
  }
};