const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  taskAccessContextFor,
  taskReadableSql,
  taskVisibilitySql,
} = require("../services/taskAccess");

test("task access context separates managed groups from memberships", () => {
  const context = taskAccessContextFor({
    id: "7",
    rol: "kullanici",
    groups: [
      {
        grupId: 1,
        grupRolu: "grup_yoneticisi",
      },
      {
        grupId: 2,
        grupRolu: "grup_uyesi",
      },
      {
        grupId: "2",
        grupRolu: "grup_uyesi",
      },
      {
        grupId: 0,
        grupRolu: "grup_yoneticisi",
      },
    ],
  });

  assert.deepEqual(context, {
    userId: 7,
    systemManager: false,
    groupIds: [1, 2],
    managedGroupIds: [1],
    privilegedViewer: true,
  });
});

test("task readability grants closed task access only in managed scope", () => {
  const sql = taskReadableSql({
    alias: "task_row",
    systemManagerParam: "$2",
    managedGroupIdsParam: "$4",
    privilegedViewerParam: "$5",
  });

  assert.match(sql, /task_row\.atanangrupid = ANY\(\$4::int\[\]\)/);
  assert.match(sql, /task_row\.gorunurlukgrupid = ANY\(\$4::int\[\]\)/);
  assert.match(sql, /\$5::boolean AND/);
  assert.match(sql, /task_row\.arsivlendimi = FALSE/);
  assert.match(
    sql,
    /task_row\.durum NOT IN \('Tamamlandi', 'Iptal Edildi'\)/,
  );
  assert.doesNotMatch(sql, /\$5::boolean\s+OR\s+task_row\.durum/);
});

test("task SQL builders reject unsafe aliases and parameter references", () => {
  assert.throws(
    () =>
      taskVisibilitySql({
        alias: "g; DROP TABLE gorevler",
        userIdParam: "$1",
        systemManagerParam: "$2",
        groupIdsParam: "$3",
        managedGroupIdsParam: "$4",
      }),
    /alias is invalid/,
  );

  assert.throws(
    () =>
      taskReadableSql({
        alias: "g",
        systemManagerParam: "TRUE",
        managedGroupIdsParam: "$4",
      }),
    /PostgreSQL parameter reference/,
  );
});
