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
    adsoyad: "Test Yönetici",
    email: "manager.test@sirket.com",
    rol: "yonetici",
  },
  3: {
    kullaniciid: 3,
    adsoyad: "Standart Kullanıcı",
    email: "user.test@sirket.com",
    rol: "kullanici",
  },
};

const createToken = (userId) =>
  jwt.sign(
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

let taskTypes;
let duplicateOnInsert;
let activity;

const typeResponse = (taskType) => ({
  id: taskType.id,
  name: taskType.name,
  description: taskType.description,
  active: taskType.active,
  createdAt: taskType.createdAt,
  updatedAt: taskType.updatedAt,
  archivedAt: taskType.archivedAt,
  taskCount: taskType.taskCount,
  activeTaskCount: taskType.activeTaskCount,
});

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
  taskTypes = [
    {
      id: 1,
      name: "Operasyonel",
      description: "Günlük operasyonlar",
      active: true,
      createdAt: new Date("2026-08-20T08:00:00.000Z"),
      updatedAt: new Date("2026-08-20T08:00:00.000Z"),
      archivedAt: null,
      taskCount: 2,
      activeTaskCount: 1,
    },
    {
      id: 2,
      name: "Sözleşme",
      description: null,
      active: true,
      createdAt: new Date("2026-08-20T08:00:00.000Z"),
      updatedAt: new Date("2026-08-20T08:00:00.000Z"),
      archivedAt: null,
      taskCount: 0,
      activeTaskCount: 0,
    },
    {
      id: 3,
      name: "Eski Tip",
      description: "Arşivlenmiş görev tipi",
      active: false,
      createdAt: new Date("2026-08-20T08:00:00.000Z"),
      updatedAt: new Date("2026-08-20T09:00:00.000Z"),
      archivedAt: new Date("2026-08-20T09:00:00.000Z"),
      taskCount: 3,
      activeTaskCount: 0,
    },
  ];
  duplicateOnInsert = false;
  activity = [];

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
      return { rows: [] };
    }

    if (
      normalized.includes("from gorevtipleri gt") &&
      normalized.includes("group by gt.tipid")
    ) {
      return {
        rows: taskTypes
          .filter((taskType) => taskType.active === Boolean(params[0]))
          .map(typeResponse),
      };
    }

    if (
      normalized.includes("from gorevtipleri gt") &&
      normalized.includes("for update of gt")
    ) {
      const taskType = taskTypes.find(
        (item) =>
          item.id === Number(params[0]) &&
          item.active === Boolean(params[1]),
      );

      return {
        rows: taskType ? [typeResponse(taskType)] : [],
      };
    }

    if (normalized.includes("insert into gorevtipleri")) {
      if (duplicateOnInsert) {
        const error = new Error("duplicate task type");
        error.code = "23505";
        throw error;
      }

      const taskType = {
        id: Math.max(...taskTypes.map((item) => item.id)) + 1,
        name: params[0],
        description: params[1],
        active: true,
        createdAt: new Date("2026-08-20T10:00:00.000Z"),
        updatedAt: new Date("2026-08-20T10:00:00.000Z"),
        archivedAt: null,
        taskCount: 0,
        activeTaskCount: 0,
      };
      taskTypes.push(taskType);
      return { rows: [typeResponse(taskType)] };
    }

    if (
      normalized.includes("update gorevtipleri") &&
      normalized.includes("set tipadi = $1")
    ) {
      const taskType = taskTypes.find(
        (item) => item.id === Number(params[2]) && item.active,
      );

      if (!taskType) {
        return { rowCount: 0, rows: [] };
      }

      taskType.name = params[0];
      taskType.description = params[1];
      taskType.updatedAt = new Date("2026-08-20T10:00:00.000Z");
      return { rowCount: 1, rows: [typeResponse(taskType)] };
    }

    if (
      normalized.includes("update gorevtipleri") &&
      normalized.includes("set aktifmi = false")
    ) {
      const taskType = taskTypes.find(
        (item) => item.id === Number(params[0]) && item.active,
      );

      if (!taskType) {
        return { rowCount: 0, rows: [] };
      }

      taskType.active = false;
      taskType.archivedAt = new Date("2026-08-20T10:00:00.000Z");
      return { rowCount: 1, rows: [] };
    }

    if (
      normalized.includes("update gorevtipleri") &&
      normalized.includes("set aktifmi = true")
    ) {
      const taskType = taskTypes.find(
        (item) => item.id === Number(params[0]) && !item.active,
      );

      if (!taskType) {
        return { rowCount: 0, rows: [] };
      }

      taskType.active = true;
      taskType.archivedAt = null;
      taskType.updatedAt = new Date("2026-08-20T10:00:00.000Z");
      return { rowCount: 1, rows: [typeResponse(taskType)] };
    }

    if (normalized.includes("insert into aktiviteloglari")) {
      activity.push({
        actorId: params[0],
        action: params[1],
        detail: params[2],
      });
      return { rows: [] };
    }

    throw new Error(`Unexpected database query in task type test: ${sql}`);
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

test("task type routes require authentication", async () => {
  const response = await request(app).get("/api/tasks/types");

  assert.equal(response.status, 401);
});

test("standard user cannot manage task types", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/types"),
    3,
  );

  assert.equal(response.status, 403);
});

test("admin can list active task types with usage counts", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/types"),
    1,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.taskTypes.length, 2);
  assert.equal(response.body.taskTypes[0].taskCount, 2);
  assert.equal(response.body.taskTypes[0].activeTaskCount, 1);
  assert.equal(response.body.limits.maxNameLength, 100);
  assert.equal(response.body.limits.maxDescriptionLength, 300);
});

test("manager can list archived task types", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/types?archived=true"),
    2,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.archived, true);
  assert.equal(response.body.taskTypes.length, 1);
  assert.equal(response.body.taskTypes[0].name, "Eski Tip");
});

test("admin can create a normalized task type", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks/types"),
    1,
  ).send({
    tipAdi: "  Dava   Takibi  ",
    aciklama: "  Dava ve   duruşma süreçleri  ",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.taskType.name, "Dava Takibi");
  assert.equal(
    response.body.taskType.description,
    "Dava ve duruşma süreçleri",
  );
  assert.equal(activity[0].action, "GorevTipiOlusturma");
});

test("manager can create a task type", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks/types"),
    2,
  ).send({ tipAdi: "Risk İncelemesi" });

  assert.equal(response.status, 201);
  assert.equal(response.body.taskType.name, "Risk İncelemesi");
  assert.equal(activity[0].actorId, 2);
});

test("task type creation rejects an empty name", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks/types"),
    1,
  ).send({ tipAdi: "   " });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /adı zorunludur/i);
});

test("task type creation rejects an overlong description", async () => {
  const response = await authenticated(
    request(app).post("/api/tasks/types"),
    1,
  ).send({
    tipAdi: "Yeni Tip",
    aciklama: "a".repeat(301),
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /en fazla 300/i);
});

test("duplicate task type name returns conflict", async () => {
  duplicateOnInsert = true;

  const response = await authenticated(
    request(app).post("/api/tasks/types"),
    1,
  ).send({ tipAdi: "Operasyonel" });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /zaten kullanılıyor/i);
});

test("admin can update task type name and description", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/types/2"),
    1,
  ).send({
    tipAdi: "Sözleşme İncelemesi",
    aciklama: "Sözleşme hazırlama ve kontrol",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.taskType.name, "Sözleşme İncelemesi");
  assert.equal(
    response.body.taskType.description,
    "Sözleşme hazırlama ve kontrol",
  );
  assert.equal(activity[0].action, "GorevTipiGuncelleme");
});

test("task type update rejects a request without changes", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/types/1"),
    1,
  ).send({
    tipAdi: "Operasyonel",
    aciklama: "Günlük operasyonlar",
  });

  assert.equal(response.status, 409);
  assert.match(response.body.error, /değişiklik yapılmadı/i);
});

test("admin can archive a used type without changing its tasks", async () => {
  const response = await authenticated(
    request(app).delete("/api/tasks/types/1"),
    1,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.taskCount, 2);
  assert.equal(taskTypes[0].active, false);
  assert.match(response.body.message, /2 görev korundu/i);
  assert.equal(activity[0].action, "GorevTipiArsivleme");
});

test("manager can restore an archived task type", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/types/3/restore"),
    2,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.taskType.active, true);
  assert.equal(response.body.taskType.taskCount, 3);
  assert.equal(activity[0].action, "GorevTipiGeriYukleme");
});

test("invalid task type id is rejected", async () => {
  const response = await authenticated(
    request(app).delete("/api/tasks/types/not-a-number"),
    1,
  );

  assert.equal(response.status, 400);
  assert.match(response.body.error, /geçersiz görev tipi id/i);
});
