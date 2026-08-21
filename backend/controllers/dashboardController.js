const db = require("../config/db");

const REPORT_PERIODS = new Map([
  ["30", 30],
  ["90", 90],
  ["365", 365],
  ["all", null],
]);

const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

const STATUS_LABELS = {
  "Yeni Atandi": "Yeni Atandı",
  "Devam Ediyor": "Devam Ediyor",
  Beklemede: "Beklemede",
  Tamamlandi: "Tamamlandı",
  "Iptal Edildi": "İptal Edildi",
};

const PRIORITY_LABELS = {
  Kritik: "Kritik",
  Yuksek: "Yüksek",
  Orta: "Orta",
  Dusuk: "Düşük",
};

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

const normalizePeriod = (value) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return REPORT_PERIODS.has(normalized) ? normalized : "30";
};

const periodStartFor = (period) => {
  const days = REPORT_PERIODS.get(period);

  if (days === null) {
    return null;
  }

  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
};

const normalizeBreakdown = (value, includeOverdue = false) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({
    id:
      item.id === undefined || item.id === null
        ? null
        : Number(item.id),
    name: String(item.name || "Belirtilmedi"),
    count: toNumber(item.count),
    ...(item.kind ? { kind: String(item.kind) } : {}),
    ...(includeOverdue
      ? { overdue: toNumber(item.overdue) }
      : {}),
  }));
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

const DASHBOARD_SUMMARY_SQL = `
  WITH visible_tasks AS (
    SELECT g.*,
           gt.tipid AS task_type_id,
           gt.tipadi AS task_type_name,
           assigned_group.grupadi AS assigned_group_name
    FROM gorevler g
    LEFT JOIN gorevtipleri gt
      ON gt.tipid = g.tipid
    LEFT JOIN gruplar assigned_group
      ON assigned_group.grupid = g.atanangrupid
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
          AND durum NOT IN ('Tamamlandi', 'Iptal Edildi')
      )
    )::int AS "openTasks",
        (
      COUNT(*) FILTER (
        WHERE durum IN ('Tamamlandi', 'Iptal Edildi')
          AND (arsivlendimi = FALSE OR $5::boolean)
      )
    )::int AS "closedTasks",
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
        WHERE durum = 'Tamamlandi'
          AND (arsivlendimi = FALSE OR $5::boolean)
      )
    )::int AS "completed",
        (
      COUNT(*) FILTER (
        WHERE durum = 'Iptal Edildi'
          AND (arsivlendimi = FALSE OR $5::boolean)
      )
    )::int AS "cancelled",
    (
      COUNT(*) FILTER (
        WHERE arsivlendimi = FALSE
          AND durum NOT IN ('Tamamlandi', 'Iptal Edildi')
          AND bitistarihi < NOW()
      )
    )::int AS "overdue",
    (
      COUNT(*) FILTER (
        WHERE arsivlendimi = FALSE
          AND durum NOT IN ('Tamamlandi', 'Iptal Edildi')
          AND bitistarihi >= NOW()
          AND bitistarihi < NOW() + INTERVAL '7 days'
      )
    )::int AS "dueSoon",
    (
      COUNT(*) FILTER (
        WHERE arsivlendimi = FALSE
          AND durum NOT IN ('Tamamlandi', 'Iptal Edildi')
          AND bitistarihi IS NULL
      )
    )::int AS "withoutDueDate",
    (
      COUNT(*) FILTER (
        WHERE arsivlendimi = FALSE
          AND durum NOT IN ('Tamamlandi', 'Iptal Edildi')
          AND oncelik = 'Kritik'
      )
    )::int AS "criticalPriority",
    (
      COUNT(*) FILTER (
        WHERE arsivlendimi = FALSE
          AND durum NOT IN ('Tamamlandi', 'Iptal Edildi')
          AND oncelik = 'Yuksek'
      )
    )::int AS "highPriority",
    (
      COUNT(*) FILTER (
        WHERE arsivlendimi = FALSE
          AND durum NOT IN ('Tamamlandi', 'Iptal Edildi')
          AND oncelik = 'Orta'
      )
    )::int AS "mediumPriority",
    (
      COUNT(*) FILTER (
        WHERE arsivlendimi = FALSE
          AND durum NOT IN ('Tamamlandi', 'Iptal Edildi')
          AND oncelik = 'Dusuk'
      )
    )::int AS "lowPriority",
    (
      COUNT(*) FILTER (
        WHERE ($6::timestamptz IS NULL OR olusturmatarihi >= $6::timestamptz)
          AND (arsivlendimi = FALSE OR $5::boolean)
      )
    )::int AS "createdInPeriod",
    (
      COUNT(*) FILTER (
        WHERE ($6::timestamptz IS NULL OR olusturmatarihi >= $6::timestamptz)
          AND (arsivlendimi = FALSE OR $5::boolean)
          AND durum = 'Tamamlandi'
      )
    )::int AS "completedInPeriod",
    ROUND(
      (
        AVG(
          EXTRACT(
            EPOCH FROM (tamamlanmatarihi - olusturmatarihi)
          ) / 3600
        ) FILTER (
          WHERE ($6::timestamptz IS NULL OR olusturmatarihi >= $6::timestamptz)
            AND (arsivlendimi = FALSE OR $5::boolean)
            AND durum = 'Tamamlandi'
            AND tamamlanmatarihi IS NOT NULL
        )
      )::numeric,
      1
    ) AS "averageCompletionHours",
    CASE
      WHEN $2::boolean THEN (
        SELECT COUNT(*)::int
        FROM gruplar
      )
      ELSE cardinality($3::int[])
    END AS "groupCount",
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', type_counts.id,
            'name', type_counts.name,
            'count', type_counts.task_count
          )
          ORDER BY type_counts.task_count DESC, LOWER(type_counts.name)
        )
        FROM (
          SELECT task_type_id AS id,
                 COALESCE(task_type_name, 'Tip belirtilmedi') AS name,
                 COUNT(*)::int AS task_count
          FROM visible_tasks
          WHERE arsivlendimi = FALSE
            AND durum NOT IN ('Tamamlandi', 'Iptal Edildi')
          GROUP BY task_type_id, task_type_name
          ORDER BY task_count DESC, LOWER(COALESCE(task_type_name, 'Tip belirtilmedi'))
          LIMIT 8
        ) type_counts
      ),
      '[]'::jsonb
    ) AS "typeBreakdown",
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', assignment_counts.id,
            'name', assignment_counts.name,
            'kind', assignment_counts.kind,
            'count', assignment_counts.task_count,
            'overdue', assignment_counts.overdue_count
          )
          ORDER BY assignment_counts.task_count DESC,
                   LOWER(assignment_counts.name)
        )
        FROM (
          SELECT
            atanangrupid AS id,
            CASE
              WHEN atanangrupid IS NOT NULL
                THEN COALESCE(assigned_group_name, 'Bilinmeyen grup')
              WHEN atanankullaniciid IS NOT NULL
                THEN 'Bireysel atama'
              ELSE 'Atamasız'
            END AS name,
            CASE
              WHEN atanangrupid IS NOT NULL THEN 'group'
              WHEN atanankullaniciid IS NOT NULL THEN 'user'
              ELSE 'unassigned'
            END AS kind,
            COUNT(*)::int AS task_count,
            (
              COUNT(*) FILTER (
                WHERE bitistarihi < NOW()
              )
            )::int AS overdue_count
          FROM visible_tasks
          WHERE arsivlendimi = FALSE
            AND durum NOT IN ('Tamamlandi', 'Iptal Edildi')
          GROUP BY atanangrupid, assigned_group_name,
                   CASE
                     WHEN atanangrupid IS NOT NULL THEN 'group'
                     WHEN atanankullaniciid IS NOT NULL THEN 'user'
                     ELSE 'unassigned'
                   END,
                   CASE
                     WHEN atanangrupid IS NOT NULL
                       THEN COALESCE(assigned_group_name, 'Bilinmeyen grup')
                     WHEN atanankullaniciid IS NOT NULL
                       THEN 'Bireysel atama'
                     ELSE 'Atamasız'
                   END
        ) assignment_counts
      ),
      '[]'::jsonb
    ) AS "assignmentBreakdown"
  FROM visible_tasks
`;

const RECENT_TASKS_SQL = `
  SELECT
    g.gorevid AS "id",
    g.baslik AS "title",
    g.aciklama AS "description",
    g.oncelik AS "priority",
    g.durum AS "status",
    g.bitisTarihi AS "dueDate",
    gt.tipadi AS "typeName",
    assigned_user.adsoyad AS "assignedUserName",
    assigned_group.grupadi AS "assignedGroupName",
    (
      g.bitisTarihi < NOW()
      AND g.durum NOT IN ('Tamamlandi', 'Iptal Edildi')
    ) AS "overdue"
  FROM gorevler g
  LEFT JOIN gorevtipleri gt
    ON gt.tipid = g.tipid
  LEFT JOIN kullanicilar assigned_user
    ON assigned_user.kullaniciid = g.atanankullaniciid
  LEFT JOIN gruplar assigned_group
    ON assigned_group.grupid = g.atanangrupid
  WHERE ${TASK_VISIBILITY_SQL}
    AND g.arsivlendimi = FALSE
    AND g.durum NOT IN ('Tamamlandi', 'Iptal Edildi')
  ORDER BY
    CASE
      WHEN g.bitisTarihi < NOW() THEN 0
      WHEN g.bitisTarihi IS NOT NULL THEN 1
      ELSE 2
    END,
    g.bitisTarihi ASC NULLS LAST,
    g.olusturmaTarihi DESC,
    g.gorevid DESC
  LIMIT 6
`;

const dashboardDataFor = async (user, requestedPeriod) => {
  const userId = Number(user.id);
  const systemViewer = isSystemViewer(user);
  const groupIds = allGroupIdsFor(user);
  const managedGroupIds = managedGroupIdsFor(user);
  const privilegedViewer = systemViewer || managedGroupIds.length > 0;
  const period = normalizePeriod(requestedPeriod);
  const periodStart = periodStartFor(period);
  const visibilityParams = [
    userId,
    systemViewer,
    groupIds,
    managedGroupIds,
    privilegedViewer,
  ];

  const [summaryResult, recentTasksResult] = await Promise.all([
    db.query(DASHBOARD_SUMMARY_SQL, [...visibilityParams, periodStart]),
    db.query(RECENT_TASKS_SQL, visibilityParams.slice(0, 4)),
  ]);

  const summary = summaryResult.rows[0] || {};
  const activeTasks = toNumber(summary.activeTasks);
  const archivedTasks = toNumber(summary.archivedTasks);
  const createdInPeriod = toNumber(summary.createdInPeriod);
  const completedInPeriod = toNumber(summary.completedInPeriod);

  return {
    reportPeriod: period,
    generatedAt: new Date().toISOString(),
    totalTasks: activeTasks + archivedTasks,
    activeTasks,
    archivedTasks,
    openTasks: toNumber(summary.openTasks),
    closedTasks: toNumber(summary.closedTasks),
    groupCount: toNumber(summary.groupCount),
    canViewArchive: privilegedViewer,
    statusCounts: {
      "Yeni Atandi": toNumber(summary.newAssigned),
      "Devam Ediyor": toNumber(summary.inProgress),
      Beklemede: toNumber(summary.waiting),
      Tamamlandi: toNumber(summary.completed),
      "Iptal Edildi": toNumber(summary.cancelled),
    },
    riskCounts: {
      overdue: toNumber(summary.overdue),
      dueSoon: toNumber(summary.dueSoon),
      withoutDueDate: toNumber(summary.withoutDueDate),
    },
    priorityCounts: {
      Kritik: toNumber(summary.criticalPriority),
      Yuksek: toNumber(summary.highPriority),
      Orta: toNumber(summary.mediumPriority),
      Dusuk: toNumber(summary.lowPriority),
    },
    performance: {
      createdTasks: createdInPeriod,
      completedTasks: completedInPeriod,
      completionRate:
        createdInPeriod > 0
          ? Math.round((completedInPeriod / createdInPeriod) * 100)
          : 0,
      averageCompletionHours: toNumber(summary.averageCompletionHours),
    },
    typeBreakdown: normalizeBreakdown(summary.typeBreakdown),
    assignmentBreakdown: normalizeBreakdown(
      summary.assignmentBreakdown,
      true,
    ),
    recentTasks: recentTasksResult.rows,
  };
};

const csvCell = (value) => {
  let text = value === undefined || value === null ? "" : String(value);

  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
};

const exportFileDate = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: ISTANBUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const periodLabel = (period) => {
  return period === "all" ? "Tüm zamanlar" : `Son ${period} gün`;
};

const dashboardCsv = (data) => {
  const rows = [
    ["Özet", "Toplam görünür görev", data.totalTasks, ""],
    ["Özet", "Arşivlenmemiş görev", data.activeTasks, ""],
    ["Özet", "Açık görev", data.openTasks, ""],
    ["Özet", "Kapalı görev", data.closedTasks, ""],
    ...(data.canViewArchive
      ? [["Özet", "Arşivlenmiş görev", data.archivedTasks, ""]]
      : []),
    ["Özet", "İlgili grup", data.groupCount, ""],
    ["Zaman riski", "Geciken görev", data.riskCounts.overdue, ""],
    ["Zaman riski", "7 gün içinde bitecek", data.riskCounts.dueSoon, ""],
    ["Zaman riski", "Bitiş tarihi olmayan", data.riskCounts.withoutDueDate, ""],
    ...Object.entries(data.statusCounts).map(([status, count]) => [
      "Durum dağılımı",
      STATUS_LABELS[status] || status,
      count,
      "",
    ]),
    ...Object.entries(data.priorityCounts).map(([priority, count]) => [
      "Öncelik dağılımı",
      PRIORITY_LABELS[priority] || priority,
      count,
      "",
    ]),
    [
      "Dönem performansı",
      "Oluşturulan görev",
      data.performance.createdTasks,
      periodLabel(data.reportPeriod),
    ],
    [
      "Dönem performansı",
      "Tamamlanan görev",
      data.performance.completedTasks,
      periodLabel(data.reportPeriod),
    ],
    [
      "Dönem performansı",
      "Tamamlanma oranı",
      `${data.performance.completionRate}%`,
      periodLabel(data.reportPeriod),
    ],
    [
      "Dönem performansı",
      "Ortalama tamamlanma süresi",
      data.performance.averageCompletionHours,
      "Saat",
    ],
    ...data.typeBreakdown.map((item) => [
      "Görev tipi dağılımı",
      item.name,
      item.count,
      "Açık görev",
    ]),
    ...data.assignmentBreakdown.map((item) => [
      "Atama dağılımı",
      item.name,
      item.count,
      `${item.overdue} geciken`,
    ]),
  ];
  const header = ["Bölüm", "Metrik", "Değer", "Açıklama"];

  return `\uFEFF${[
    header,
    ...rows,
  ].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
};

exports.getDashboardSummary = async (req, res) => {
  try {
    const data = await dashboardDataFor(req.user, req.query?.period);
    return res.json(data);
  } catch (error) {
    console.error("Dashboard özeti getirilemedi", error);

    return res.status(500).json({
      error: "Dashboard özeti getirilemedi",
    });
  }
};

exports.exportDashboardReport = async (req, res) => {
  try {
    const data = await dashboardDataFor(req.user, req.query?.period);
    const csv = dashboardCsv(data);

    res.set({
      "Cache-Control": "no-store",
      "Content-Disposition":
        `attachment; filename="lawdesk-gorev-raporu-${data.reportPeriod}-${exportFileDate()}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    });

    return res.status(200).send(csv);
  } catch (error) {
    console.error("Dashboard raporu dışa aktarılamadı", error);

    return res.status(500).json({
      error: "Dashboard raporu dışa aktarılamadı",
    });
  }
};
