const assert = require("node:assert/strict");
const {
  after,
  beforeEach,
  test,
} = require("node:test");

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-secret-".repeat(8);
process.env.AUTH_TOKEN_TTL_HOURS = "8";
process.env.AUTH_COOKIE_NAME = "lawdesk_test_session";

const jwt = require("jsonwebtoken");
const request = require("supertest");

const app = require("../app");
const db = require("../config/db");

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

beforeEach(() => {
  recorded = {
    activity: [],
    archiveParams: null,
    dueDateParams: null,
    findParams: [],
    insertParams: null,
    listParams: null,
    listSql: "",
    historyCount: 0,
    statusParams: null,
    statusSql: "",
    restoreParams: null,
    updateCount: 0,
  };
  manageAllowed = true;
  currentTaskStatus = "Yeni Atandi";
  currentTaskCreatorId = 3;
  currentTaskDueDate = null;

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
            title: "Görülebilen görev",
            status: currentTaskStatus,
            dueDate: currentTaskDueDate,
            creatorId: currentTaskCreatorId,
            archived: params[3] === true,
            canManage: manageAllowed,
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
      normalized.includes('end as "canmanageassignment"') &&
      normalized.includes("from gorevler g")
    ) {
      recorded.listSql = normalized;
      recorded.listParams = params;

      return {
        rows: [
          {
            id: 50,
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
