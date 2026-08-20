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
    adsoyad: "Görev Sahibi",
    email: "creator.test@sirket.com",
    rol: "kullanici",
  },
  4: {
    kullaniciid: 4,
    adsoyad: "Diğer Kullanıcı",
    email: "other.test@sirket.com",
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

let tags;
let assignedTagIds;
let taskVisible;
let taskStatus;
let taskArchived;
let duplicateOnInsert;
let activity;

const tagResponse = (tag) => ({
  id: tag.id,
  name: tag.name,
  active: tag.active,
  createdAt: tag.createdAt,
  updatedAt: tag.updatedAt,
  archivedAt: tag.archivedAt,
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
  tags = [
    {
      id: 1,
      name: "KVKK",
      active: true,
      createdAt: new Date("2026-08-20T08:00:00.000Z"),
      updatedAt: new Date("2026-08-20T08:00:00.000Z"),
      archivedAt: null,
    },
    {
      id: 2,
      name: "Sözleşme",
      active: true,
      createdAt: new Date("2026-08-20T08:00:00.000Z"),
      updatedAt: new Date("2026-08-20T08:00:00.000Z"),
      archivedAt: null,
    },
    {
      id: 3,
      name: "Eski Etiket",
      active: false,
      createdAt: new Date("2026-08-20T08:00:00.000Z"),
      updatedAt: new Date("2026-08-20T09:00:00.000Z"),
      archivedAt: new Date("2026-08-20T09:00:00.000Z"),
    },
  ];
  assignedTagIds = [1];
  taskVisible = true;
  taskStatus = "Yeni Atandi";
  taskArchived = false;
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
      return { rows: memberships[Number(params[0])] || [] };
    }

    if (
      normalized.includes('as "canview"') &&
      normalized.includes("from gorevler g")
    ) {
      return {
        rows: [
          {
            id: Number(params[0]),
            title: "KVKK denetimi",
            status: taskStatus,
            archived: taskArchived,
            creatorId: 3,
            canView: taskVisible,
            canManage:
              params[2] === true ||
              (Array.isArray(params[4]) && params[4].length > 0),
          },
        ],
      };
    }

    if (
      normalized.includes("from etiketler") &&
      normalized.includes("where aktifmi = $1::boolean") &&
      normalized.includes("order by lower(etiketadi)")
    ) {
      return {
        rows: tags
          .filter((tag) => tag.active === Boolean(params[0]))
          .map(tagResponse),
      };
    }

    if (
      normalized.includes("from etiketler") &&
      normalized.includes("where etiketid = $1") &&
      normalized.includes("for update")
    ) {
      const tag = tags.find(
        (item) =>
          item.id === Number(params[0]) &&
          item.active === Boolean(params[1]),
      );
      return { rows: tag ? [tagResponse(tag)] : [] };
    }

    if (normalized.includes("insert into etiketler")) {
      if (duplicateOnInsert) {
        const error = new Error("duplicate tag");
        error.code = "23505";
        throw error;
      }

      const tag = {
        id: Math.max(...tags.map((item) => item.id)) + 1,
        name: params[0],
        active: true,
        createdAt: new Date("2026-08-20T10:00:00.000Z"),
        updatedAt: new Date("2026-08-20T10:00:00.000Z"),
        archivedAt: null,
      };
      tags.push(tag);
      return { rows: [tagResponse(tag)] };
    }

    if (
      normalized.includes("update etiketler") &&
      normalized.includes("set etiketadi = $1")
    ) {
      const tag = tags.find(
        (item) => item.id === Number(params[1]) && item.active,
      );

      if (!tag) {
        return { rowCount: 0, rows: [] };
      }

      tag.name = params[0];
      tag.updatedAt = new Date("2026-08-20T10:00:00.000Z");
      return { rowCount: 1, rows: [tagResponse(tag)] };
    }

    if (
      normalized.includes("update etiketler") &&
      normalized.includes("set aktifmi = false")
    ) {
      const tag = tags.find(
        (item) => item.id === Number(params[0]) && item.active,
      );

      if (!tag) {
        return { rowCount: 0, rows: [] };
      }

      tag.active = false;
      tag.archivedAt = new Date("2026-08-20T10:00:00.000Z");
      return { rowCount: 1, rows: [] };
    }

    if (
      normalized.includes("update etiketler") &&
      normalized.includes("set aktifmi = true")
    ) {
      const tag = tags.find(
        (item) => item.id === Number(params[0]) && !item.active,
      );

      if (!tag) {
        return { rowCount: 0, rows: [] };
      }

      tag.active = true;
      tag.archivedAt = null;
      tag.updatedAt = new Date("2026-08-20T10:00:00.000Z");
      return { rowCount: 1, rows: [tagResponse(tag)] };
    }

    if (
      normalized.includes("from gorevetiketleri ge") &&
      normalized.includes("and e.aktifmi = true") &&
      normalized.includes("order by e.etiketid")
    ) {
      return {
        rows: assignedTagIds
          .map((tagId) => tags.find((tag) => tag.id === tagId))
          .filter((tag) => tag?.active)
          .map((tag) => ({ id: tag.id, name: tag.name })),
      };
    }

    if (
      normalized.includes("from gorevetiketleri ge") &&
      normalized.includes("join etiketler e") &&
      normalized.includes("order by e.aktifmi desc")
    ) {
      return {
        rows: assignedTagIds
          .map((tagId) => tags.find((tag) => tag.id === tagId))
          .filter(Boolean)
          .map((tag) => ({
            id: tag.id,
            name: tag.name,
            active: tag.active,
          })),
      };
    }

    if (
      normalized.includes('select etiketid as "id", etiketadi as "name"') &&
      normalized.includes("where etiketid = any($1::int[])")
    ) {
      const selectedIds = Array.isArray(params[0])
        ? params[0].map(Number)
        : [];
      return {
        rows: tags
          .filter((tag) => tag.active && selectedIds.includes(tag.id))
          .sort((left, right) => left.id - right.id)
          .map((tag) => ({ id: tag.id, name: tag.name })),
      };
    }

    if (normalized.includes("delete from gorevetiketleri ge")) {
      const selectedIds = Array.isArray(params[1])
        ? params[1].map(Number)
        : [];
      assignedTagIds = assignedTagIds.filter((tagId) => {
        const tag = tags.find((item) => item.id === tagId);
        return tag?.active !== true || selectedIds.includes(tagId);
      });
      return { rowCount: 1, rows: [] };
    }

    if (normalized.includes("insert into gorevetiketleri")) {
      const selectedIds = Array.isArray(params[1])
        ? params[1].map(Number)
        : [];
      assignedTagIds = [...new Set([...assignedTagIds, ...selectedIds])];
      return { rowCount: selectedIds.length, rows: [] };
    }

    if (normalized.includes("insert into aktiviteloglari")) {
      activity.push({
        actorId: params[0],
        taskId: params[1],
        action: params[2],
        detail: params[3],
      });
      return { rows: [] };
    }

    throw new Error(`Unexpected database query in tag test: ${sql}`);
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

test("tag routes require authentication", async () => {
  const response = await request(app).get("/api/tasks/tags");

  assert.equal(response.status, 401);
});

test("authenticated user can list active tags", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/tags"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tags.length, 2);
  assert.equal(response.body.canManageTags, false);
});

test("admin can list archived tags", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/tags?archived=true"),
    1,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tags.length, 1);
  assert.equal(response.body.tags[0].name, "Eski Etiket");
});

test("standard user cannot list archived tags", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/tags?archived=true"),
    3,
  );

  assert.equal(response.status, 403);
});

test("standard user cannot create a global tag", async () => {
  const response = await authenticated(
    request(app)
      .post("/api/tasks/tags")
      .send({ etiketAdi: "Acil" }),
    3,
  );

  assert.equal(response.status, 403);
});

test("admin can create a normalized tag", async () => {
  const response = await authenticated(
    request(app)
      .post("/api/tasks/tags")
      .send({ etiketAdi: "  Acil   İnceleme  " }),
    1,
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.tag.name, "Acil İnceleme");
  assert.equal(activity[0].action, "EtiketOlusturma");
  assert.equal(activity[0].taskId, null);
});

test("duplicate tag name returns conflict", async () => {
  duplicateOnInsert = true;

  const response = await authenticated(
    request(app)
      .post("/api/tasks/tags")
      .send({ etiketAdi: "KVKK" }),
    1,
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /zaten kullanılıyor/i);
});

test("admin can rename an active tag", async () => {
  const response = await authenticated(
    request(app)
      .patch("/api/tasks/tags/2")
      .send({ etiketAdi: "Sözleşme İncelemesi" }),
    1,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tag.name, "Sözleşme İncelemesi");
  assert.equal(activity[0].action, "EtiketGuncelleme");
});

test("admin can archive a tag without deleting assignments", async () => {
  const response = await authenticated(
    request(app).delete("/api/tasks/tags/1"),
    1,
  );

  assert.equal(response.status, 200);
  assert.equal(tags[0].active, false);
  assert.deepEqual(assignedTagIds, [1]);
  assert.equal(activity[0].action, "EtiketArsivleme");
});

test("admin can restore an archived tag", async () => {
  const response = await authenticated(
    request(app).patch("/api/tasks/tags/3/restore"),
    1,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tag.active, true);
  assert.equal(activity[0].action, "EtiketGeriYukleme");
});

test("task creator can list and manage task tags", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/50/tags"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.tags.length, 1);
  assert.equal(response.body.tags[0].name, "KVKK");
  assert.equal(response.body.availableTags.length, 2);
  assert.equal(response.body.canManage, true);
});

test("visible unrelated user receives read-only task tags", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/50/tags"),
    4,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.canManage, false);
});

test("user outside task visibility cannot list task tags", async () => {
  taskVisible = false;

  const response = await authenticated(
    request(app).get("/api/tasks/50/tags"),
    4,
  );

  assert.equal(response.status, 404);
});

test("task creator can replace active task tags", async () => {
  const response = await authenticated(
    request(app)
      .put("/api/tasks/50/tags")
      .send({ etiketIds: [2] }),
    3,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(assignedTagIds, [2]);
  assert.equal(response.body.tags[0].name, "Sözleşme");
  assert.equal(activity[0].action, "GorevEtiketDegisikligi");
  assert.equal(activity[0].taskId, 50);
});

test("group manager can replace tags in managed task scope", async () => {
  const response = await authenticated(
    request(app)
      .put("/api/tasks/50/tags")
      .send({ etiketIds: [1, 2] }),
    2,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(assignedTagIds.sort(), [1, 2]);
});

test("unrelated user cannot replace task tags", async () => {
  const response = await authenticated(
    request(app)
      .put("/api/tasks/50/tags")
      .send({ etiketIds: [2] }),
    4,
  );

  assert.equal(response.status, 403);
  assert.deepEqual(assignedTagIds, [1]);
});

test("completed task rejects tag changes", async () => {
  taskStatus = "Tamamlandi";

  const response = await authenticated(
    request(app)
      .put("/api/tasks/50/tags")
      .send({ etiketIds: [2] }),
    1,
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /tamamlanmış/i);
});

test("duplicate task tag ids are rejected", async () => {
  const response = await authenticated(
    request(app)
      .put("/api/tasks/50/tags")
      .send({ etiketIds: [1, 1] }),
    3,
  );

  assert.equal(response.status, 400);
  assert.match(response.body.error, /birden fazla/i);
});

test("archived global tag cannot be newly assigned", async () => {
  const response = await authenticated(
    request(app)
      .put("/api/tasks/50/tags")
      .send({ etiketIds: [3] }),
    3,
  );

  assert.equal(response.status, 400);
  assert.match(response.body.error, /arşivlenmiş/i);
  assert.deepEqual(assignedTagIds, [1]);
});
