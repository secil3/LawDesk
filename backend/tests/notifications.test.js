const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-secret-".repeat(8);
process.env.AUTH_TOKEN_TTL_HOURS = "8";
process.env.AUTH_COOKIE_NAME = "lawdesk_test_session";

const jwt = require("jsonwebtoken");
const request = require("supertest");

const expressApp = require("../app");
const db = require("../config/db");

let app;
let testServer;
let recorded;

const originalQuery = db.query;

const createToken = () =>
  jwt.sign({}, process.env.AUTH_TOKEN_SECRET, {
    subject: "2",
    issuer: "lawdesk-backend",
    audience: "lawdesk-web",
    expiresIn: "1h",
    algorithm: "HS256",
  });

const authenticated = (requestBuilder) =>
  requestBuilder.set(
    "Cookie",
    `${process.env.AUTH_COOKIE_NAME}=${createToken()}`,
  );

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
    count: null,
    list: null,
    updates: [],
  };

  db.query = async (text, params = []) => {
    const sql = String(text || "");
    const normalized = sql.toLowerCase();

    if (
      normalized.includes("select kullaniciid, adsoyad, email, rol") &&
      normalized.includes("from kullanicilar")
    ) {
      return {
        rows: [
          {
            kullaniciid: 2,
            adsoyad: "Karma Grup Yöneticisi",
            email: "manager.test@lawdesk.test",
            rol: "kullanici",
          },
        ],
      };
    }

    if (
      normalized.includes('gu.gruprolu as "gruprolu"') &&
      normalized.includes("from grupuyelikleri gu")
    ) {
      return {
        rows: [
          {
            grupId: 1,
            grupAdi: "Uyum",
            grupRolu: "grup_yoneticisi",
          },
          {
            grupId: 2,
            grupAdi: "KVKK",
            grupRolu: "grup_uyesi",
          },
        ],
      };
    }

    if (
      normalized.includes('count(*)::int as "total"') &&
      normalized.includes("from bildirimler b")
    ) {
      recorded.count = { sql, params };
      return { rows: [{ total: 1 }] };
    }

    if (
      normalized.includes('select b.bildirimid as "id"') &&
      normalized.includes("from bildirimler b")
    ) {
      recorded.list = { sql, params };
      return {
        rows: [
          {
            id: 10,
            taskId: null,
            registrationRequestId: 3,
            taskTitle: null,
            type: "KayitTalebi",
            message: "Yeni kayıt talebi",
            read: false,
            createdAt: new Date("2026-08-25T09:00:00.000Z"),
          },
        ],
      };
    }

    if (normalized.startsWith("update bildirimler b")) {
      recorded.updates.push({ sql, params });

      if (Number(params[5]) !== 10) {
        return { rows: [] };
      }

      return {
        rows: [
          {
            id: 10,
            taskId: null,
            registrationRequestId: 3,
            type: "KayitTalebi",
            message: "Yeni kayıt talebi",
            read: true,
            createdAt: new Date("2026-08-25T09:00:00.000Z"),
          },
        ],
      };
    }

    throw new Error(`Unexpected database query in notification test: ${sql}`);
  };
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
  await db.close();
});

test("notification list carries exact task visibility scope", async () => {
  const response = await authenticated(
    request(app).get("/api/notifications?unread=true"),
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.notifications.length, 1);
  assert.deepEqual(recorded.count.params, [2, false, [1, 2], [1], true]);
  assert.deepEqual(recorded.list.params, [
    2,
    false,
    [1, 2],
    [1],
    true,
    20,
    0,
  ]);
  assert.match(
    recorded.list.sql,
    /visible_task\.atanangrupid = ANY\(\$4::int\[\]\)/,
  );
  assert.match(recorded.list.sql, /visible_task\.arsivlendimi = FALSE/);
  assert.match(recorded.list.sql, /b\.okundumu = FALSE/);
});

test("notification read enforces ownership and current task visibility", async () => {
  const response = await authenticated(
    request(app).patch("/api/notifications/10/read"),
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.notification.read, true);
  assert.deepEqual(recorded.updates[0].params, [
    2,
    false,
    [1, 2],
    [1],
    true,
    10,
  ]);
  assert.match(recorded.updates[0].sql, /b\.kullaniciid = \$1/);
  assert.match(recorded.updates[0].sql, /FROM gorevler visible_task/);
});

test("inaccessible notification is indistinguishable from a missing one", async () => {
  const response = await authenticated(
    request(app).patch("/api/notifications/99/read"),
  );

  assert.equal(response.status, 404);
  assert.deepEqual(response.body, {
    error: "Bildirim bulunamadı",
  });
});
