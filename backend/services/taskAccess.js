const parameterReference = (value, label) => {
  if (typeof value !== "string" || !/^\$\d+$/.test(value)) {
    throw new Error(`${label} must be a PostgreSQL parameter reference`);
  }

  return value;
};

const sqlAlias = (value) => {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error("Task SQL alias is invalid");
  }

  return value;
};

const taskManagementSql = ({
  alias = "g",
  systemManagerParam,
  managedGroupIdsParam,
}) => {
  const task = sqlAlias(alias);
  const systemManager = parameterReference(
    systemManagerParam,
    "systemManagerParam",
  );
  const managedGroupIds = parameterReference(
    managedGroupIdsParam,
    "managedGroupIdsParam",
  );

  return `(
    ${systemManager}::boolean
    OR (
      cardinality(${managedGroupIds}::int[]) > 0
      AND (
        ${task}.atanangrupid = ANY(${managedGroupIds}::int[])
        OR ${task}.gorunurlukgrupid = ANY(${managedGroupIds}::int[])
        OR EXISTS (
          SELECT 1
          FROM grupuyelikleri managed_assignment
          WHERE managed_assignment.kullaniciid = ${task}.atanankullaniciid
            AND managed_assignment.grupid = ANY(${managedGroupIds}::int[])
        )
        OR (
          ${task}.atanankullaniciid IS NULL
          AND ${task}.atanangrupid IS NULL
          AND EXISTS (
            SELECT 1
            FROM grupuyelikleri managed_creator
            WHERE managed_creator.kullaniciid = ${task}.olusturankullaniciid
              AND managed_creator.grupid = ANY(${managedGroupIds}::int[])
          )
        )
      )
    )
  )`;
};

const taskVisibilitySql = ({
  alias = "g",
  userIdParam,
  systemManagerParam,
  groupIdsParam,
  managedGroupIdsParam,
}) => {
  const task = sqlAlias(alias);
  const userId = parameterReference(userIdParam, "userIdParam");
  const systemManager = parameterReference(
    systemManagerParam,
    "systemManagerParam",
  );
  const groupIds = parameterReference(groupIdsParam, "groupIdsParam");
  const managedGroupIds = parameterReference(
    managedGroupIdsParam,
    "managedGroupIdsParam",
  );
  const manageable = taskManagementSql({
    alias: task,
    systemManagerParam: systemManager,
    managedGroupIdsParam: managedGroupIds,
  });

  return `(
    ${manageable}
    OR ${task}.olusturankullaniciid = ${userId}
    OR ${task}.atanankullaniciid = ${userId}
    OR ${task}.gorunurlukkullaniciid = ${userId}
    OR ${task}.atanangrupid = ANY(${groupIds}::int[])
    OR ${task}.gorunurlukgrupid = ANY(${groupIds}::int[])
  )`;
};

const taskReadableSql = ({
  alias = "g",
  systemManagerParam,
  managedGroupIdsParam,
  privilegedViewerParam = null,
}) => {
  const task = sqlAlias(alias);
  const manageable = taskManagementSql({
    alias: task,
    systemManagerParam,
    managedGroupIdsParam,
  });
  const managedAccess = privilegedViewerParam
    ? `(${parameterReference(
        privilegedViewerParam,
        "privilegedViewerParam",
      )}::boolean AND ${manageable})`
    : manageable;

  return `(
    ${managedAccess}
    OR (
      ${task}.arsivlendimi = FALSE
      AND ${task}.durum NOT IN ('Tamamlandi', 'Iptal Edildi')
    )
  )`;
};

const uniquePositiveIds = (values) => [
  ...new Set(
    (values || [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  ),
];

const taskAccessContextFor = (user) => {
  const groups = Array.isArray(user?.groups) ? user.groups : [];
  const managedGroupIds = uniquePositiveIds(
    groups
      .filter((group) => group.grupRolu === "grup_yoneticisi")
      .map((group) => group.grupId),
  );
  const systemManager = ["admin", "yonetici"].includes(user?.rol);

  return {
    userId: Number(user?.id),
    systemManager,
    groupIds: uniquePositiveIds(groups.map((group) => group.grupId)),
    managedGroupIds,
    privilegedViewer: systemManager || managedGroupIds.length > 0,
  };
};

module.exports = {
  taskAccessContextFor,
  taskManagementSql,
  taskReadableSql,
  taskVisibilitySql,
};
