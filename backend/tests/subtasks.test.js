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
    adsoyad: "Grup Yöneticisi",
    email: "manager.test@sirket.com",
    rol: "kullanici",
  },
  3: {
    kullaniciid: 3,
    adsoyad: "Ana Görev Sahibi",
    email: "creator.test@sirket.com",
    rol: "kullanici",
  },
  4: {
    kullaniciid: 4,
    adsoyad: "Atanan Kullanıcı",
    email: "assignee.test@sirket.com",
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
  4: [
    {
      grupId: 2,
      grupAdi: "KVKK",
      grupRolu: "grup_uyesi",
    },
  ],
};

const createToken = (userId) => jwt.sign(
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

const authenticated = (requestBuilder, userId) =>
  requestBuilder.set(
    "Cookie",
    `${process.env.AUTH_COOKIE_NAME}=${createToken(userId)}`,
  );

let parentVisible;
let parentTaskId;
let parentStatus;
let parentArchived;
let parentCreatorId;
let parentDueDate;
let canManageParent;
let activeSubtaskCount;
let recorded;

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
  parentVisible = true;
  parentTaskId = null;
  parentStatus = "Devam Ediyor";
  parentArchived = false;
  parentCreatorId = 3;
  parentDueDate = new Date("2099-08-30T12:00:00.000Z");
  canManageParent = false;
  activeSubtaskCount = 1;
  recorded = {
    activity: [],
    historyCount: 0,
    insertParams: null,
    listParams: null,
  };

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
      return { rows: memberships[Number(params[0])] || [] };
    }

    if (
      normalized.includes('as "canview"') &&
      normalized.includes('as "canmanage"') &&
      normalized.includes("from gorevler g")
    ) {
      return {
        rows: [
          {
            id: Number(params[0]),
            parentTaskId,
            title: "KVKK ana görevi",
            priority: "Yuksek",
            status: parentStatus,
            dueDate: parentDueDate,
            typeId: 1,
            assignedUserId: null,
            assignedUserName: null,
            assignedGroupId: 2,
            assignedGroupName: "KVKK",
            visibilityType: "Grup",
            visibilityUserId: null,
            visibilityGroupId: 2,
            creatorId: parentCreatorId,
            creatorName: "Ana Görev Sahibi",
            archived: parentArchived,
            canView: parentVisible,
            canManage:
              canManageParent ||
              params[2] === true ||
              (Array.isArray(params[4]) && params[4].length > 0),
          },
        ],
      };
    }

    if (
      normalized.includes("from gorevler child") &&
      normalized.includes("child.ustgorevid = $1")
    ) {
      recorded.listParams = params;
      return {
        rows: [
          {
            id: 71,
            parentTaskId: Number(params[0]),
            title: "Alt kontrol",
            description: null,
            priority: "Orta",
            status: "Yeni Atandi",
            dueDate: null,
            createdAt: new Date("2026-08-20T08:00:00.000Z"),
            archived: params[1] === true,
            typeId: 1,
            typeName: "Operasyonel",
            assignedUserId: null,
            assignedUserName: null,
            assignedGroupId: 2,
            assignedGroupName: "KVKK",
          },
        ],
      };
    }

    if (
      normalized.includes("select count(*)::int") &&
      normalized.includes("where ustgorevid = $1")
    ) {
      return { rows: [{ total: activeSubtaskCount }] };
    }

    if (
      normalized.includes("from gorevtipleri") &&
      normalized.includes("where tipid = $1")
    ) {
      return Number(params[0]) === 1
        ? { rows: [{ id: 1, name: "Operasyonel" }] }
        : { rows: [] };
    }

    if (normalized.includes("insert into gorevler")) {
      recorded.insertParams = params;
      return {
        rows: [
          {
            id: 72,
            parentTaskId: Number(params[0]),
            title: params[1],
            description: params[2],
            priority: params[4],
            status: "Yeni Atandi",
            dueDate: params[5],
            createdAt: new Date("2026-08-20T10:00:00.000Z"),
            archived: false,
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

    throw new Error(`Unexpected database query in subtask test: ${sql}`);
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

test("subtask routes require authentication", async () => {
  const response = await request(app).get("/api/tasks/50/subtasks");

  assert.equal(response.status, 401);
});

test("parent task creator can list active subtasks", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/50/subtasks"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.subtasks.length, 1);
  assert.equal(response.body.canCreate, true);
  assert.equal(response.body.canViewArchive, false);
  assert.deepEqual(recorded.listParams, [50, false]);
});

test("user outside parent visibility cannot list subtasks", async () => {
  parentVisible = false;

  const response = await authenticated(
    request(app).get("/api/tasks/50/subtasks"),
    4,
  );

  assert.equal(response.status, 404);
  assert.match(response.body.error, /ana görev bulunamadı/i);
});

test("standard task creator cannot open subtask archive", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/50/subtasks?archived=true"),
    3,
  );

  assert.equal(response.status, 403);
  assert.match(response.body.error, /arşivini görüntüleme/i);
});

test("parent creator can create a subtask with inherited access", async () => {
  activeSubtaskCount = 1;

  const response = await authenticated(
    request(app).post("/api/tasks/50/subtasks"),
    3,
  ).send({
    baslik: "  Belge kontrolü  ",
    aciklama: "Belgeleri incele",
    bitisTarihi: "2099-08-25T12:00:00.000Z",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.subtask.title, "Belge kontrolü");
  assert.equal(response.body.subtask.parentTaskId, 50);
  assert.equal(response.body.subtask.assignedGroupId, 2);
  assert.equal(response.body.subtask.canManageAssignment, false);
  assert.equal(recorded.insertParams[0], 50);
  assert.equal(recorded.insertParams[3], 1);
  assert.equal(recorded.insertParams[4], "Yuksek");
  assert.equal(recorded.insertParams[7], 2);
  assert.equal(recorded.insertParams[8], "Grup");
  assert.equal(recorded.insertParams[10], 2);
  assert.equal(recorded.insertParams[11], 3);
  assert.equal(recorded.historyCount, 1);
  assert.equal(recorded.activity[0].action, "AltGorevOlusturma");
});

test("group manager can create a subtask in managed scope", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks/50/subtasks"),
    2,
  ).send({ baslik: "Yönetici alt görevi", tipId: 1 });

  assert.equal(response.status, 201);
  assert.equal(response.body.subtask.title, "Yönetici alt görevi");
  assert.equal(response.body.subtask.creatorId, 3);
  assert.equal(recorded.insertParams[11], 3);
  assert.equal(recorded.activity[0].actorId, 2);
});

test("visible unrelated user cannot create a subtask", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks/50/subtasks"),
    4,
  ).send({ baslik: "Yetkisiz alt görev" });

  assert.equal(response.status, 403);
  assert.match(response.body.error, /yetkiniz bulunmuyor/i);
  assert.equal(recorded.insertParams, null);
});

test("nested subtasks are rejected", async () => {
  parentTaskId = 9;

  const response = await authenticated(
    request(app).post("/api/tasks/50/subtasks"),
    3,
  ).send({ baslik: "İkinci seviye" });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /yeni bir görev katmanı/i);
});

test("terminal parent rejects new subtasks", async () => {
  parentStatus = "Tamamlandi";

  const response = await authenticated(
    request(app).post("/api/tasks/50/subtasks"),
    3,
  ).send({ baslik: "Kapalı görevin altı" });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /tamamlanmış veya iptal edilmiş/i);
});

test("archived parent rejects new subtasks", async () => {
  parentArchived = true;

  const response = await authenticated(
    request(app).post("/api/tasks/50/subtasks"),
    1,
  ).send({ baslik: "Arşiv altı" });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /arşivlenmiş ana göreve/i);
});

test("subtask due date cannot exceed parent due date", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks/50/subtasks"),
    3,
  ).send({
    baslik: "Geç biten alt görev",
    bitisTarihi: "2099-09-01T12:00:00.000Z",
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /ana görevin bitiş tarihini geçemez/i);
});

test("parent enforces active subtask limit", async () => {
  activeSubtaskCount = 50;

  const response = await authenticated(
    request(app).post("/api/tasks/50/subtasks"),
    3,
  ).send({ baslik: "Fazla alt görev" });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /en fazla 50 aktif alt görev/i);
});
