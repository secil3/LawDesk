const assert = require("node:assert/strict");
const {
  after,
  before,
  beforeEach,
  test,
} = require("node:test");

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-secret-".repeat(8);
process.env.AUTH_TOKEN_TTL_HOURS = "8";
process.env.AUTH_COOKIE_NAME = "lawdesk_test_session";

const jwt = require("jsonwebtoken");
const request = require("supertest");

const expressApp = require("../app");
const db = require("../config/db");

let app = null;
let testServer = null;

const originalQuery = db.query;
const originalWithTransaction = db.withTransaction;

const users = {
  1: {
    kullaniciid: 1,
    adsoyad: "Test Admin",
    email: "admin.test@sirket.com",
    rol: "admin",
  },
  2: {
    kullaniciid: 2,
    adsoyad: "KVKK Yöneticisi",
    email: "manager.test@sirket.com",
    rol: "kullanici",
  },
  3: {
    kullaniciid: 3,
    adsoyad: "KVKK Üyesi",
    email: "member.test@sirket.com",
    rol: "kullanici",
  },
  4: {
    kullaniciid: 4,
    adsoyad: "Standart Kullanıcı",
    email: "standard.test@sirket.com",
    rol: "kullanici",
  },
  5: {
    kullaniciid: 5,
    adsoyad: "Uyum Üyesi",
    email: "uyum.test@sirket.com",
    rol: "kullanici",
  },
};

const memberships = {
  1: [],
  2: [
    {
      grupId: 2,
      grupAdi: "KVKK",
      grupRolu: "grup_yoneticisi",
    },
  ],
  3: [
    {
      grupId: 2,
      grupAdi: "KVKK",
      grupRolu: "grup_uyesi",
    },
  ],
  4: [],
  5: [
    {
      grupId: 1,
      grupAdi: "Uyum",
      grupRolu: "grup_uyesi",
    },
  ],
};

const groups = {
  1: { id: 1, name: "Uyum" },
  2: { id: 2, name: "KVKK" },
};

const createToken = (userId) => {
  return jwt.sign(
    {},
    process.env.AUTH_TOKEN_SECRET,
    {
      subject: String(userId),
      issuer: "lawdesk-backend",
      audience: "lawdesk-web",
      expiresIn: "1h",
      algorithm: "HS256",
    },
  );
};

const authenticated = (requestBuilder, userId) => {
  return requestBuilder.set(
    "Cookie",
    `${process.env.AUTH_COOKIE_NAME}=${createToken(userId)}`,
  );
};

let recorded;
let manageAllowed;
let currentTaskStatus;
let currentTaskCreatorId;
let currentTaskDueDate;
let currentTaskTitle;
let currentTaskDescription;
let currentTaskPriority;
let currentTaskTypeId;
let currentTaskTypeName;
let currentTaskArchived;
let currentTaskParentId;
let inheritedChildIds;
let laterChildTask;
let openSubtaskCount;
let unarchivedSubtaskCount;
let parentTaskArchived;
let parentTaskDueDate;
let parentTaskStatus;

before(async () => {
  testServer = expressApp.listen(0, "127.0.0.1");

  await new Promise((resolve, reject) => {
    testServer.once("error", reject);
    testServer.once("listening", resolve);
  });

  const address = testServer.address();
  app = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  recorded = {
    activity: [],
    archiveParams: null,
    dueDateParams: null,
    detailParams: null,
    findParams: [],
    insertParams: null,
    listParams: null,
    listSql: "",
    historyCount: 0,
    statusParams: null,
    statusSql: "",
    restoreParams: null,
    taskUpdateParams: null,
    updateCount: 0,
    childPropagationParams: null,
  };
  manageAllowed = true;
  currentTaskStatus = "Yeni Atandi";
  currentTaskCreatorId = 3;
  currentTaskDueDate = null;
  currentTaskTitle = "Görülebilen görev";
  currentTaskDescription = null;
  currentTaskPriority = "Orta";
  currentTaskTypeId = null;
  currentTaskTypeName = null;
  currentTaskArchived = false;
  currentTaskParentId = null;
  inheritedChildIds = [];
  laterChildTask = null;
  openSubtaskCount = 0;
  unarchivedSubtaskCount = 0;
  parentTaskArchived = false;
  parentTaskDueDate = null;
  parentTaskStatus = "Devam Ediyor";

  db.query = async (text, params = []) => {
    const sql = String(text || "");
    const normalized = sql.toLowerCase();

    if (
      normalized.includes("select kullaniciid, adsoyad, email, rol") &&
      normalized.includes("from kullanicilar")
    ) {
      const user = users[Number(params[0])];
      return { rows: user ? [user] : [] };
    }

    if (
      normalized.includes('gu.gruprolu as "gruprolu"') &&
      normalized.includes("from grupuyelikleri gu")
    ) {
      return {
        rows: memberships[Number(params[0])] || [],
      };
    }

    if (
      normalized.includes("from gorevtipleri") &&
      normalized.includes("where tipid = $1")
    ) {
      return Number(params[0]) === 1
        ? { rows: [{ id: 1, name: "Personel" }] }
        : { rows: [] };
    }

    if (
      normalized.includes("from gorevtipleri") &&
      normalized.includes("where aktifmi = true")
    ) {
      return {
        rows: [
          { id: 1, name: "Personel" },
          { id: 2, name: "Sözleşme" },
        ],
      };
    }

    if (
      normalized.includes("from gruplar") &&
      normalized.includes("where grupid = $1")
    ) {
      const group = groups[Number(params[0])];
      return { rows: group ? [group] : [] };
    }

    if (
      normalized.includes("from gruplar") &&
      normalized.includes("order by grupadi")
    ) {
      const allowedIds = Array.isArray(params[0])
        ? params[0].map(Number)
        : Object.keys(groups).map(Number);

      return {
        rows: allowedIds
          .map((groupId) => groups[groupId])
          .filter(Boolean),
      };
    }

    if (
      normalized.includes("array_agg(gu.grupid)") &&
      normalized.includes("from kullanicilar k")
    ) {
      const targetUser = users[Number(params[0])];

      if (!targetUser) {
        return { rows: [] };
      }

      return {
        rows: [
          {
            id: targetUser.kullaniciid,
            name: targetUser.adsoyad,
            groupIds: (memberships[targetUser.kullaniciid] || []).map(
              (membership) => membership.grupId,
            ),
          },
        ],
      };
    }

    if (
      normalized.includes("select distinct k.kullaniciid") &&
      normalized.includes("from kullanicilar k")
    ) {
      const allowedGroupIds = Array.isArray(params[0])
        ? params[0].map(Number)
        : [];

      return {
        rows: Object.values(users)
          .filter((user) =>
            (memberships[user.kullaniciid] || []).some((membership) =>
              allowedGroupIds.includes(Number(membership.grupId)),
            ),
          )
          .map((user) => ({
            id: user.kullaniciid,
            name: user.adsoyad,
          })),
      };
    }

    if (
      normalized.includes('select kullaniciid as "id"') &&
      normalized.includes("from kullanicilar") &&
      normalized.includes("order by adsoyad")
    ) {
      return {
        rows: Object.values(users).map((user) => ({
          id: user.kullaniciid,
          name: user.adsoyad,
        })),
      };
    }

    if (normalized.includes("insert into gorevler")) {
      recorded.insertParams = params;

      return {
        rows: [
          {
            id: 101,
            title: params[0],
            description: params[1],
            priority: params[3],
            status: "Yeni Atandi",
            dueDate: params[4],
            createdAt: new Date("2026-08-13T09:00:00.000Z"),
          },
        ],
      };
    }

    if (normalized.includes("insert into gorevatamagecmisi")) {
      recorded.historyCount += 1;
      return { rows: [] };
    }

    if (normalized.includes("insert into aktiviteloglari")) {
      recorded.activity.push({
        actorId: params[0],
        taskId: params[1],
        action: params[2],
        detail: params[3],
      });
      return { rows: [] };
    }

    if (
      normalized.includes("from aktiviteloglari al") &&
      normalized.includes('count(*)::int as "total"')
    ) {
      return { rows: [{ total: 1 }] };
    }

    if (
      normalized.includes("from aktiviteloglari al") &&
      normalized.includes("order by al.islemtarihi")
    ) {
      return {
        rows: [
          {
            id: 88,
            action: "DurumDegisikligi",
            detail: "Test Admin görevin durumunu değiştirdi.",
            createdAt: new Date("2026-08-13T10:00:00.000Z"),
            actorId: 1,
            actorName: "Test Admin",
            taskId: 50,
            taskTitle: "Görülebilen görev",
          },
        ],
      };
    }

    if (
      normalized.includes('end as "canmanage"') &&
      normalized.includes("from gorevler g")
    ) {
      recorded.findParams.push(params);
      return {
        rows: [
          {
            id: Number(params[0]),
            parentTaskId: currentTaskParentId,
            title: currentTaskTitle,
            description: currentTaskDescription,
            priority: currentTaskPriority,
            status: currentTaskStatus,
            dueDate: currentTaskDueDate,
            typeId: currentTaskTypeId,
            typeName: currentTaskTypeName,
            creatorId: currentTaskCreatorId,
            archived: params[3] === true,
            canManage: manageAllowed,
          },
        ],
      };
    }

    if (
      normalized.includes('select gorevid as "id", baslik as "title"') &&
      normalized.includes("where ustgorevid = $1") &&
      normalized.includes("bitistarihi > $2")
    ) {
      return { rows: laterChildTask ? [laterChildTask] : [] };
    }

    if (
      normalized.includes('select bitistarihi as "duedate"') &&
      normalized.includes("where gorevid = $1")
    ) {
      return { rows: [{ dueDate: parentTaskDueDate }] };
    }

    if (
      normalized.includes('select durum as "status"') &&
      normalized.includes('bitistarihi as "duedate"') &&
      normalized.includes('arsivlendimi as "archived"') &&
      normalized.includes("where gorevid = $1")
    ) {
      return {
        rows: [
          {
            status: parentTaskStatus,
            dueDate: parentTaskDueDate,
            archived: parentTaskArchived,
          },
        ],
      };
    }

    if (
      normalized.includes('select durum as "status", arsivlendimi as "archived"') &&
      normalized.includes("where gorevid = $1")
    ) {
      return {
        rows: [
          {
            status: parentTaskStatus,
            archived: parentTaskArchived,
          },
        ],
      };
    }

    if (
      normalized.includes('select arsivlendimi as "archived"') &&
      normalized.includes("where gorevid = $1")
    ) {
      return { rows: [{ archived: parentTaskArchived }] };
    }

    if (
      normalized.includes('select count(*)::int as "total"') &&
      normalized.includes("where ustgorevid = $1") &&
      normalized.includes("durum not in")
    ) {
      return { rows: [{ total: openSubtaskCount }] };
    }

    if (
      normalized.includes('select count(*)::int as "total"') &&
      normalized.includes("where ustgorevid = $1")
    ) {
      return { rows: [{ total: unarchivedSubtaskCount }] };
    }

    if (
      normalized.includes("update gorevler") &&
      normalized.includes("where ustgorevid = $6")
    ) {
      recorded.childPropagationParams = params;
      return {
        rowCount: inheritedChildIds.length,
        rows: inheritedChildIds.map((id) => ({ id })),
      };
    }

    if (
      normalized.includes("update gorevler") &&
      normalized.includes("set baslik = $1")
    ) {
      recorded.taskUpdateParams = params;
      currentTaskTitle = params[0];
      currentTaskDescription = params[1];
      currentTaskTypeId = params[2];
      currentTaskTypeName = Number(params[2]) === 1 ? "Personel" : null;
      currentTaskPriority = params[3];
      currentTaskDueDate = params[4];

      return {
        rowCount: 1,
        rows: [
          {
            id: Number(params[5]),
            title: params[0],
            description: params[1],
            typeId: params[2],
            priority: params[3],
            status: currentTaskStatus,
            dueDate: params[4],
            updatedAt: new Date("2026-08-13T10:00:00.000Z"),
          },
        ],
      };
    }

    if (
      normalized.includes("update gorevler") &&
      normalized.includes("set bitistarihi = $1")
    ) {
      recorded.dueDateParams = params;
      currentTaskDueDate = params[0];

      return {
        rowCount: 1,
        rows: [
          {
            id: Number(params[1]),
            dueDate: params[0],
            updatedAt: new Date("2026-08-13T10:00:00.000Z"),
          },
        ],
      };
    }

    if (
      normalized.includes("update gorevler") &&
      normalized.includes("set durum = $1")
    ) {
      recorded.statusSql = normalized;
      recorded.statusParams = params;
      currentTaskStatus = params[0];

      return {
        rowCount: 1,
        rows: [
          {
            id: Number(params[1]),
            status: params[0],
            completedAt:
              params[0] === "Tamamlandi"
                ? new Date("2026-08-13T10:00:00.000Z")
                : null,
            updatedAt: new Date("2026-08-13T10:00:00.000Z"),
          },
        ],
      };
    }

    if (
      normalized.includes("update gorevler") &&
      normalized.includes("set arsivlendimi = true")
    ) {
      recorded.archiveParams = params;
      return { rowCount: 1, rows: [] };
    }

    if (
      normalized.includes("update gorevler") &&
      normalized.includes("set arsivlendimi = false")
    ) {
      recorded.restoreParams = params;
      return {
        rowCount: 1,
        rows: [
          {
            id: Number(params[0]),
            status: currentTaskStatus,
            archived: false,
            updatedAt: new Date("2026-08-13T10:00:00.000Z"),
          },
        ],
      };
    }

    if (normalized.includes("update gorevler")) {
      recorded.updateCount += 1;
      return { rowCount: 1, rows: [] };
    }

    if (
      normalized.includes("select count(*)") &&
      normalized.includes("from gorevler g")
    ) {
      return {
        rows: [{ total: 47 }],
      };
    }

    if (
      normalized.includes('end as "canmanageassignment"') &&
      normalized.includes("from gorevler g") &&
      normalized.includes("where g.gorevid = $1")
    ) {
      recorded.detailParams = params;

      if (currentTaskArchived && params[5] !== true) {
        return { rows: [] };
      }

      return {
        rows: [
          {
            id: Number(params[0]),
            parentTaskId: currentTaskParentId,
            parentTaskTitle: currentTaskParentId
              ? "Ana görev"
              : null,
            title: currentTaskTitle,
            description: currentTaskDescription,
            priority: currentTaskPriority,
            status: currentTaskStatus,
            dueDate: currentTaskDueDate,
            createdAt: new Date("2026-08-13T09:00:00.000Z"),
            archived: currentTaskArchived,
            archivedAt: currentTaskArchived
              ? new Date("2026-08-13T10:00:00.000Z")
              : null,
            typeId: currentTaskTypeId,
            typeName: currentTaskTypeName,
            creatorId: currentTaskCreatorId,
            creatorName: "KVKK Üyesi",
            assignedUserId: 3,
            assignedUserName: "KVKK Üyesi",
            assignedGroupId: null,
            assignedGroupName: null,
            canManageAssignment: params[1] === true || params[3].length > 0,
          },
        ],
      };
    }

    if (
      normalized.includes('end as "canmanageassignment"') &&
      normalized.includes("from gorevler g")
    ) {
      recorded.listSql = normalized;
      recorded.listParams = params;

      return {
        rows: [
          {
            id: 50,
            parentTaskId: null,
            parentTaskTitle: null,
            title: "Görülebilen görev",
            description: null,
            priority: "Orta",
            status: "Yeni Atandi",
            dueDate: null,
            createdAt: new Date("2026-08-13T09:00:00.000Z"),
            archived: params[5] === true,
            archivedAt: params[5]
              ? new Date("2026-08-13T10:00:00.000Z")
              : null,
            typeId: null,
            typeName: null,
            creatorId: 3,
            creatorName: "KVKK Üyesi",
            assignedUserId: 3,
            assignedUserName: "KVKK Üyesi",
            assignedGroupId: null,
            assignedGroupName: null,
            canManageAssignment: params[4] === true,
          },
        ],
      };
    }

    throw new Error(`Unexpected database query in task test: ${sql}`);
  };

  db.withTransaction = async (callback) => callback(db.query);
});

after(async () => {
  if (testServer) {
    await new Promise((resolve, reject) => {
      testServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  db.query = originalQuery;
  db.withTransaction = originalWithTransaction;
  await db.close();
});

test("task routes require authentication", async () => {
  const response = await request(app).get("/api/tasks");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Giriş yapmanız gerekiyor");
});

test("standard user can create an unassigned task", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks"),
    4,
  ).send({
    baslik: "Atamasız görev",
    aciklama: "Daha sonra atanacak",
    oncelik: "Orta",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.task.title, "Atamasız görev");
  assert.equal(response.body.task.assignedUserId, null);
  assert.equal(response.body.task.assignedGroupId, null);

  assert.equal(recorded.insertParams[5], null);
  assert.equal(recorded.insertParams[6], null);
  assert.equal(recorded.insertParams[7], "Kisi");
  assert.equal(recorded.insertParams[8], 4);
  assert.equal(recorded.insertParams[9], null);
  assert.equal(recorded.insertParams[10], 4);
  assert.equal(recorded.historyCount, 0);
  assert.equal(recorded.activity.length, 1);
  assert.equal(recorded.activity[0].action, "GorevOlusturma");
});

test("task rejects a due date in the past", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks"),
    4,
  ).send({
    baslik: "Geçmiş tarihli görev",
    bitisTarihi: "2020-01-01T12:00:00.000Z",
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /geçmiş bir zaman olamaz/i);
  assert.equal(recorded.insertParams, null);
});

test("standard user cannot assign a task", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks"),
    4,
  ).send({
    baslik: "Yetkisiz atama",
    atananGrupId: 2,
  });

  assert.equal(response.status, 403);
  assert.match(response.body.error, /grup yöneticisi/i);
  assert.equal(recorded.insertParams, null);
});

test("task rejects two assignment targets at the same time", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks"),
    1,
  ).send({
    baslik: "Çift hedefli görev",
    atananKullaniciId: 3,
    atananGrupId: 2,
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /hem kullanıcıya hem gruba/i);
  assert.equal(recorded.insertParams, null);
});

test("group manager can assign a new task to managed group", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks"),
    2,
  ).send({
    baslik: "KVKK görevi",
    tipId: 1,
    oncelik: "Yuksek",
    atananGrupId: 2,
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.task.assignedGroupId, 2);
  assert.equal(response.body.task.assignedGroupName, "KVKK");
  assert.equal(recorded.insertParams[6], 2);
  assert.equal(recorded.insertParams[7], "Grup");
  assert.equal(recorded.insertParams[9], 2);
  assert.equal(recorded.historyCount, 1);
});

test("group manager cannot assign outside managed groups", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks"),
    2,
  ).send({
    baslik: "Yetki dışı görev",
    atananGrupId: 1,
  });

  assert.equal(response.status, 403);
  assert.match(response.body.error, /yönettiğiniz gruplara/i);
  assert.equal(recorded.insertParams, null);
});

test("task detail endpoint returns one visible task", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/50"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.task.id, 50);
  assert.equal(response.body.task.title, "Görülebilen görev");
  assert.equal(response.body.task.canManage, false);
});

test("subtask detail returns its parent reference and inherited assignment", async () => {
  currentTaskParentId = 10;

  const response = await authenticated(
    request(app).get("/api/tasks/50"),
    2,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.task.parentTaskId, 10);
  assert.equal(response.body.task.parentTaskTitle, "Ana görev");
  assert.equal(response.body.task.canManage, true);
  assert.equal(response.body.task.canManageAssignment, false);
});

test("group manager can open and restore an archived task detail", async () => {
  currentTaskArchived = true;

  const response = await authenticated(
    request(app).get("/api/tasks/50"),
    2,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.task.archived, true);
  assert.equal(response.body.task.canRestore, true);
  assert.equal(recorded.detailParams[5], true);
});

test("standard user cannot open an archived task detail", async () => {
  currentTaskArchived = true;

  const response = await authenticated(
    request(app).get("/api/tasks/50"),
    3,
  );

  assert.equal(response.status, 404);
  assert.equal(recorded.detailParams[5], false);
});

test("task list passes visibility context to database", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tasks.length, 1);
  assert.deepEqual(recorded.listParams, [3, false, [2], [], false, false]);
  assert.match(recorded.listSql, /g\.olusturankullaniciid = \$1/);
  assert.match(recorded.listSql, /g\.atanankullaniciid = \$1/);
  assert.match(recorded.listSql, /assigned_membership/);
  assert.match(recorded.listSql, /g\.atanankullaniciid is null/);
  assert.match(recorded.listSql, /g\.durum <> 'tamamlandi'/);
  assert.match(recorded.listSql, /g\.arsivlendimi = \$6::boolean/);
});

test("task list filters results by search term", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?search=dava"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tasks.length, 1);
  assert.deepEqual(recorded.listParams, [
    3,
    false,
    [2],
    [],
    false,
    false,
    "%dava%",
  ]);
  assert.match(recorded.listSql, /lower\(coalesce\(g\.baslik, ''\)\).*like lower\(\$7\)/i);
  assert.match(recorded.listSql, /lower\(coalesce\(g\.aciklama, ''\)\).*like lower\(\$7\)/i);
});

test("task list filters by status and priority", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?status=open&priority=high"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tasks.length, 1);
  assert.deepEqual(recorded.listParams, [
    3,
    false,
    [2],
    [],
    false,
    false,
    "Yeni Atandi",
    "Devam Ediyor",
    "Beklemede",
    "Yuksek",
  ]);
  assert.match(recorded.listSql, /g\.durum in \(\$7, \$8, \$9\)/i);
  assert.match(recorded.listSql, /g\.oncelik = \$10/i);
});

test("task list filters by task type and combines with search", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?search=dava&status=open&priority=high&taskType=personel"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tasks.length, 1);
  assert.deepEqual(recorded.listParams, [
    3,
    false,
    [2],
    [],
    false,
    false,
    "%dava%",
    "Yeni Atandi",
    "Devam Ediyor",
    "Beklemede",
    "Yuksek",
    "%personel%",
  ]);
  assert.match(recorded.listSql, /lower\(coalesce\(gt\.tipadi, ''\)\).*like lower\(\$12\)/i);
});

test("task list filters by an active tag", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?tagId=3"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tasks.length, 1);
  assert.deepEqual(recorded.listParams, [
    3,
    false,
    [2],
    [],
    false,
    false,
    3,
  ]);
  assert.match(
    recorded.listSql,
    /filtered_task_tag\.etiketid = \$7/i,
  );
  assert.match(recorded.listSql, /filtered_tag\.aktifmi = true/i);
});

test("task list rejects an invalid tag filter", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?tagId=not-a-number"),
    3,
  );

  assert.equal(response.status, 400);
  assert.match(response.body.error, /geçerli bir etiket/i);
  assert.equal(recorded.listParams, null);
});

test("task list sorts by due date ascending and combines with search and filters", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?search=dava&status=open&priority=high&sortBy=due_date&sortOrder=asc"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tasks.length, 1);
  assert.deepEqual(recorded.listParams, [
    3,
    false,
    [2],
    [],
    false,
    false,
    "%dava%",
    "Yeni Atandi",
    "Devam Ediyor",
    "Beklemede",
    "Yuksek",
  ]);
  assert.match(recorded.listSql, /order by g\.bitistarihi asc/i);
});

test("task list ignores invalid sort values and keeps default ordering", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?sortBy=unknown&sortOrder=sideways"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tasks.length, 1);
  assert.match(recorded.listSql, /order by\s+case when \$6::boolean then g\.arsivlenmetarihi end desc nulls last/i);
});

test("task list paginates database results and returns metadata", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?search=dava&status=open&sortBy=due_date&sortOrder=asc&page=2&limit=10"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tasks.length, 1);
  assert.equal(response.body.pagination.page, 2);
  assert.equal(response.body.pagination.limit, 10);
  assert.equal(response.body.pagination.total, 47);
  assert.equal(response.body.pagination.totalPages, 5);
  assert.match(recorded.listSql, /limit\s+\$11\s+offset\s+\$12/i);
});

test("task pagination clamps a page above the available range", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?page=99&limit=10"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.pagination.page, 5);
  assert.equal(response.body.pagination.totalPages, 5);
  assert.deepEqual(recorded.listParams.slice(-2), [10, 40]);
});

test("group manager can list archived tasks in managed scope", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?archived=true"),
    2,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tasks.length, 1);
  assert.equal(response.body.tasks[0].archived, true);
  assert.equal(response.body.tasks[0].canRestore, true);
  assert.deepEqual(recorded.listParams, [2, false, [2], [2], true, true]);
});

test("standard user cannot list archived tasks", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks?archived=true"),
    3,
  );

  assert.equal(response.status, 403);
  assert.match(response.body.error, /arşivini görüntüleme/i);
  assert.equal(recorded.listParams, null);
});

test("group manager receives only managed assignment options", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/options"),
    2,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.canAssign, true);
  assert.deepEqual(response.body.groups, [{ id: 2, name: "KVKK" }]);
  assert.deepEqual(
    response.body.users.map((user) => user.id).sort(),
    [2, 3],
  );
});

test("group manager can assign a manageable task to group member", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/50/assignment"),
    2,
  ).send({
    atananKullaniciId: 3,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.assignment.assignedUserId, 3);
  assert.equal(response.body.assignment.assignedUserName, "KVKK Üyesi");
  assert.equal(recorded.updateCount, 1);
  assert.equal(recorded.historyCount, 1);
  assert.equal(recorded.activity[0].action, "GorevAtama");
});

test("parent assignment is propagated to direct subtasks", async () => {
  inheritedChildIds = [70, 71];

  const response = await authenticated(
    request(app).patch("/api/tasks/50/assignment"),
    2,
  ).send({ atananGrupId: 2 });

  assert.equal(response.status, 200);
  assert.equal(recorded.childPropagationParams[1], 2);
  assert.equal(recorded.childPropagationParams[4], 2);
  assert.equal(recorded.childPropagationParams[5], 50);
  assert.equal(recorded.historyCount, 2);
  assert.match(recorded.activity[0].detail, /2 alt göreve/i);
});

test("subtask assignment cannot be changed independently", async () => {
  currentTaskParentId = 10;

  const response = await authenticated(
    request(app).patch("/api/tasks/50/assignment"),
    2,
  ).send({ atananKullaniciId: 3 });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /ana görevden devralınır/i);
  assert.equal(recorded.updateCount, 0);
});

test("group manager cannot reassign a task outside managed scope", async () => {
  manageAllowed = false;

  const response = await authenticated(
    request(app).patch("/api/tasks/50/assignment"),
    2,
  ).send({
    atananKullaniciId: 3,
  });

  assert.equal(response.status, 403);
  assert.match(response.body.error, /yetkiniz bulunmuyor/i);
  assert.equal(recorded.updateCount, 0);
  assert.equal(recorded.historyCount, 0);
});

test("task creator can update all editable task information", async () => {
  manageAllowed = false;
  const nextDueDate = "2099-08-14T12:30:00.000Z";

  const response = await authenticated(
    request(app).patch("/api/tasks/50"),
    3,
  ).send({
    baslik: "Güncellenmiş görev",
    aciklama: "Yeni açıklama",
    tipId: 1,
    oncelik: "Yuksek",
    bitisTarihi: nextDueDate,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.task.title, "Güncellenmiş görev");
  assert.equal(response.body.task.typeName, "Personel");
  assert.equal(response.body.message, "Görev bilgileri güncellendi");
  assert.equal(recorded.taskUpdateParams[0], "Güncellenmiş görev");
  assert.equal(recorded.taskUpdateParams[1], "Yeni açıklama");
  assert.equal(recorded.taskUpdateParams[2], 1);
  assert.equal(recorded.taskUpdateParams[3], "Yuksek");
  assert.equal(recorded.taskUpdateParams[4].toISOString(), nextDueDate);
  assert.equal(recorded.taskUpdateParams[5], 50);
  assert.equal(recorded.activity[0].action, "GorevBilgileriDegisikligi");
  assert.match(recorded.activity[0].detail, /Başlık/);
  assert.match(recorded.activity[0].detail, /Görev tipi/);
});

test("group manager can update a task in managed scope", async () => {
  currentTaskCreatorId = 4;

  const response = await authenticated(
    request(app).patch("/api/tasks/50"),
    2,
  ).send({
    oncelik: "Kritik",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.task.priority, "Kritik");
  assert.equal(recorded.taskUpdateParams[3], "Kritik");
});

test("unrelated standard user cannot edit a task", async () => {
  manageAllowed = false;

  const response = await authenticated(
    request(app).patch("/api/tasks/50"),
    4,
  ).send({
    baslik: "Yetkisiz değişiklik",
  });

  assert.equal(response.status, 403);
  assert.match(response.body.error, /düzenleme yetkiniz/i);
  assert.equal(recorded.taskUpdateParams, null);
});

test("closed task must be reopened before editing", async () => {
  currentTaskStatus = "Tamamlandi";

  const response = await authenticated(
    request(app).patch("/api/tasks/50"),
    3,
  ).send({
    baslik: "Kapalı görev değişikliği",
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /önce yeniden açınız/i);
  assert.equal(recorded.taskUpdateParams, null);
});

test("task edit rejects a changed due date in the past", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/50"),
    3,
  ).send({
    bitisTarihi: "2020-01-01T12:00:00.000Z",
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /geçmiş bir zaman olamaz/i);
  assert.equal(recorded.taskUpdateParams, null);
});

test("task edit rejects a request without changes", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/50"),
    3,
  ).send({
    baslik: "Görülebilen görev",
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /değişiklik yapılmadı/i);
  assert.equal(recorded.taskUpdateParams, null);
});

test("task creator can update the due date", async () => {
  manageAllowed = false;
  const nextDueDate = "2099-08-14T12:30:00.000Z";

  const response = await authenticated(
    request(app).patch("/api/tasks/50/due-date"),
    3,
  ).send({
    bitisTarihi: nextDueDate,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Bitiş tarihi güncellendi");
  assert.equal(recorded.dueDateParams[0].toISOString(), nextDueDate);
  assert.equal(recorded.dueDateParams[1], 50);
  assert.equal(recorded.activity[0].action, "BitisTarihiDegisikligi");
});

test("unrelated standard user cannot update the due date", async () => {
  manageAllowed = false;

  const response = await authenticated(
    request(app).patch("/api/tasks/50/due-date"),
    4,
  ).send({
    bitisTarihi: "2099-08-14T12:30:00.000Z",
  });

  assert.equal(response.status, 403);
  assert.match(response.body.error, /yetkiniz bulunmuyor/i);
  assert.equal(recorded.dueDateParams, null);
});

test("task creator can remove the due date", async () => {
  manageAllowed = false;
  currentTaskDueDate = new Date("2099-08-14T12:30:00.000Z");

  const response = await authenticated(
    request(app).patch("/api/tasks/50/due-date"),
    3,
  ).send({
    bitisTarihi: null,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Bitiş tarihi kaldırıldı");
  assert.deepEqual(recorded.dueDateParams, [null, 50]);
});

test("closed task must be reopened before editing its due date", async () => {
  currentTaskStatus = "Tamamlandi";

  const response = await authenticated(
    request(app).patch("/api/tasks/50/due-date"),
    3,
  ).send({
    bitisTarihi: "2099-08-14T12:30:00.000Z",
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /önce yeniden açınız/i);
  assert.equal(recorded.dueDateParams, null);
});

test("due date update rejects a past value", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/50/due-date"),
    3,
  ).send({
    bitisTarihi: "2020-01-01T12:00:00.000Z",
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /geçmiş bir zaman olamaz/i);
  assert.equal(recorded.dueDateParams, null);
});

test("parent due date cannot be earlier than an active subtask", async () => {
  laterChildTask = {
    id: 70,
    title: "Belge kontrolü",
    dueDate: new Date("2099-08-25T12:00:00.000Z"),
  };

  const response = await authenticated(
    request(app).patch("/api/tasks/50/due-date"),
    3,
  ).send({ bitisTarihi: "2099-08-20T12:00:00.000Z" });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /belge kontrolü/i);
  assert.equal(recorded.dueDateParams, null);
});

test("subtask due date cannot exceed its parent due date", async () => {
  currentTaskParentId = 10;
  parentTaskDueDate = new Date("2099-08-20T12:00:00.000Z");

  const response = await authenticated(
    request(app).patch("/api/tasks/50/due-date"),
    3,
  ).send({ bitisTarihi: "2099-08-25T12:00:00.000Z" });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /ana görevin bitiş tarihini geçemez/i);
  assert.equal(recorded.dueDateParams, null);
});

test("standard user cannot change task status", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/50/status"),
    3,
  ).send({
    durum: "Devam Ediyor",
  });

  assert.equal(response.status, 403);
  assert.match(response.body.error, /grup yöneticisi/i);
  assert.equal(recorded.statusParams, null);
});

test("group manager can close a task in managed scope", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/50/status"),
    2,
  ).send({
    durum: "Tamamlandi",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.task.status, "Tamamlandi");
  assert.equal(response.body.message, "Görev kapatıldı");
  assert.deepEqual(recorded.statusParams, ["Tamamlandi", 50, true]);
  assert.match(recorded.statusSql, /when \$3::boolean/);
  assert.doesNotMatch(
    recorded.statusSql,
    /\$1\s*=\s*'tamamlandi'/,
  );
  assert.equal(recorded.activity.length, 1);
  assert.equal(recorded.activity[0].action, "DurumDegisikligi");
  assert.match(recorded.activity[0].detail, /Yeni Atandi/);
  assert.match(recorded.activity[0].detail, /Tamamlandi/);
});

test("parent task cannot close while a subtask remains open", async () => {
  openSubtaskCount = 2;

  const response = await authenticated(
    request(app).patch("/api/tasks/50/status"),
    2,
  ).send({ durum: "Tamamlandi" });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /2 açık alt görevi/i);
  assert.equal(recorded.statusParams, null);
});

test("subtask cannot reopen while its parent is terminal", async () => {
  currentTaskParentId = 10;
  currentTaskStatus = "Tamamlandi";
  parentTaskStatus = "Tamamlandi";

  const response = await authenticated(
    request(app).patch("/api/tasks/50/status"),
    2,
  ).send({ durum: "Devam Ediyor" });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /ana görevi aktif duruma/i);
  assert.equal(recorded.statusParams, null);
});

test("group manager can reopen a completed task", async () => {
  currentTaskStatus = "Tamamlandi";

  const response = await authenticated(
    request(app).patch("/api/tasks/50/status"),
    2,
  ).send({
    durum: "Devam Ediyor",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.task.status, "Devam Ediyor");
  assert.equal(response.body.task.completedAt, null);
  assert.deepEqual(recorded.statusParams, ["Devam Ediyor", 50, false]);
});

test("group manager cannot change status outside managed scope", async () => {
  manageAllowed = false;

  const response = await authenticated(
    request(app).patch("/api/tasks/50/status"),
    2,
  ).send({
    durum: "Beklemede",
  });

  assert.equal(response.status, 403);
  assert.match(response.body.error, /yetkiniz bulunmuyor/i);
  assert.equal(recorded.statusParams, null);
  assert.equal(recorded.activity.length, 0);
});

test("group manager can soft archive a task in managed scope", async () => {
  const response = await authenticated(
    request(app).delete("/api/tasks/50"),
    2,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Görev arşivlendi");
  assert.deepEqual(recorded.archiveParams, [2, 50]);
  assert.equal(recorded.activity.length, 1);
  assert.equal(recorded.activity[0].action, "GorevArsivleme");
});

test("parent task cannot archive before its subtasks", async () => {
  unarchivedSubtaskCount = 2;

  const response = await authenticated(
    request(app).delete("/api/tasks/50"),
    2,
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /2 alt görevi arşivleyin/i);
  assert.equal(recorded.archiveParams, null);
});

test("standard user cannot archive a task", async () => {
  const response = await authenticated(
    request(app).delete("/api/tasks/50"),
    3,
  );

  assert.equal(response.status, 403);
  assert.match(response.body.error, /grup yöneticisi/i);
  assert.equal(recorded.archiveParams, null);
});

test("group manager can restore a task in managed scope", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/50/restore"),
    2,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Görev geri yüklendi");
  assert.deepEqual(recorded.restoreParams, [50]);
  assert.deepEqual(recorded.findParams.at(-1), [50, false, [2], true]);
  assert.equal(recorded.activity.length, 1);
  assert.equal(recorded.activity[0].action, "GorevGeriYukleme");
});

test("subtask cannot restore while its parent is archived", async () => {
  currentTaskParentId = 10;
  parentTaskArchived = true;

  const response = await authenticated(
    request(app).patch("/api/tasks/50/restore"),
    2,
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /ana görevi geri yükleyin/i);
  assert.equal(recorded.restoreParams, null);
});

test("active subtask cannot restore while its parent is terminal", async () => {
  currentTaskParentId = 10;
  parentTaskStatus = "Tamamlandi";

  const response = await authenticated(
    request(app).patch("/api/tasks/50/restore"),
    2,
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /ana görevi aktif duruma/i);
  assert.equal(recorded.restoreParams, null);
});

test("subtask restore preserves the parent due date boundary", async () => {
  currentTaskParentId = 10;
  currentTaskDueDate = new Date("2099-08-25T12:00:00.000Z");
  parentTaskDueDate = new Date("2099-08-20T12:00:00.000Z");

  const response = await authenticated(
    request(app).patch("/api/tasks/50/restore"),
    2,
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /bitiş tarihini ana görevle uyumlu/i);
  assert.equal(recorded.restoreParams, null);
});

test("standard user cannot restore a task", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/50/restore"),
    3,
  );

  assert.equal(response.status, 403);
  assert.match(response.body.error, /grup yöneticisi/i);
  assert.equal(recorded.restoreParams, null);
});

test("admin can list activity records with a bounded limit", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/activity?limit=999"),
    1,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.activity.length, 1);
  assert.equal(response.body.activity[0].action, "DurumDegisikligi");
});

test("group manager cannot view system activity records", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/activity"),
    2,
  );

  assert.equal(response.status, 403);
  assert.match(response.body.error, /yetkiniz bulunmuyor/i);
});
