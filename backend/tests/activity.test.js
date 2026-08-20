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

const users = {
  1: {
    kullaniciid: 1,
    adsoyad: "Test Admin",
    email: "admin.test@sirket.com",
    rol: "admin",
  },
  2: {
    kullaniciid: 2,
    adsoyad: "Test Grup Yöneticisi",
    email: "manager.test@sirket.com",
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

let activityRows;
let activityTotal;
let activityQueries;

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
  activityRows = [
    {
      id: 88,
      action: "DurumDegisikligi",
      detail: "Test Admin görevin durumunu değiştirdi.",
      createdAt: new Date("2026-08-20T10:48:00.000Z"),
      actorId: 1,
      actorName: "Test Admin",
      actorEmail: "admin.test@sirket.com",
      taskId: 50,
      taskTitle: "Görülebilen görev",
    },
    {
      id: 87,
      action: "GorevOlusturma",
      detail: "Test Admin görevi oluşturdu.",
      createdAt: new Date("2026-08-20T09:30:00.000Z"),
      actorId: 1,
      actorName: "Test Admin",
      actorEmail: "admin.test@sirket.com",
      taskId: 49,
      taskTitle: "Önceki görev",
    },
  ];
  activityTotal = activityRows.length;
  activityQueries = [];

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

    if (normalized.includes("from aktiviteloglari al")) {
      activityQueries.push({ sql, params });

      if (normalized.includes('count(*)::int as "total"')) {
        return { rows: [{ total: activityTotal }] };
      }

      return { rows: activityRows };
    }

    throw new Error(`Unexpected database query: ${sql}`);
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

test("activity records require authentication", async () => {
  const response = await request(app).get("/api/tasks/activity");

  assert.equal(response.status, 401);
  assert.match(response.body.error, /giriş yapmanız gerekiyor/i);
  assert.equal(activityQueries.length, 0);
});

test("group manager cannot list or export system activity", async () => {
  const listResponse = await authenticated(
    request(app).get("/api/tasks/activity"),
    2,
  );
  const exportResponse = await authenticated(
    request(app).get("/api/tasks/activity/export"),
    2,
  );

  assert.equal(listResponse.status, 403);
  assert.equal(exportResponse.status, 403);
  assert.equal(activityQueries.length, 0);
});

test("admin receives bounded activity pagination", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/activity?page=0&limit=999"),
    1,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.activity.length, 2);
  assert.deepEqual(response.body.pagination, {
    page: 1,
    limit: 100,
    total: 2,
    totalPages: 1,
  });
  assert.deepEqual(activityQueries[1].params, [100, 0]);
});

test("activity list applies actor task action and date filters", async () => {
  activityTotal = 26;
  const from = "2026-08-19T21:00:00.000Z";
  const to = "2026-08-20T21:00:00.000Z";
  const response = await authenticated(
    request(app)
      .get("/api/tasks/activity")
      .query({
        actor: "Test Admin",
        task: "#50",
        action: "DurumDegisikligi",
        from,
        to,
        page: 2,
        limit: 25,
      }),
    1,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.pagination, {
    page: 2,
    limit: 25,
    total: 26,
    totalPages: 2,
  });
  assert.deepEqual(activityQueries[0].params, [
    "%Test Admin%",
    "%50%",
    "DurumDegisikligi",
    from,
    to,
  ]);
  assert.deepEqual(activityQueries[1].params, [
    "%Test Admin%",
    "%50%",
    "DurumDegisikligi",
    from,
    to,
    25,
    25,
  ]);
  assert.match(activityQueries[1].sql, /actor\.email/i);
  assert.match(activityQueries[1].sql, /task\.baslik/i);
});

test("activity list rejects an invalid date", async () => {
  const response = await authenticated(
    request(app).get("/api/tasks/activity?from=not-a-date"),
    1,
  );

  assert.equal(response.status, 400);
  assert.match(response.body.error, /başlangıç tarihi geçerli değil/i);
  assert.equal(activityQueries.length, 0);
});

test("activity list rejects an inverted date range", async () => {
  const response = await authenticated(
    request(app)
      .get("/api/tasks/activity")
      .query({
        from: "2026-08-21T00:00:00.000Z",
        to: "2026-08-20T00:00:00.000Z",
      }),
    1,
  );

  assert.equal(response.status, 400);
  assert.match(response.body.error, /bitiş tarihi başlangıç/i);
  assert.equal(activityQueries.length, 0);
});

test("admin exports filtered activity as Excel-safe UTF-8 CSV", async () => {
  activityRows = [
    {
      id: 91,
      action: "DurumDegisikligi",
      detail: '=2+2; "deneme"\nyeni satır',
      createdAt: new Date("2026-08-20T10:48:00.000Z"),
      actorId: 1,
      actorName: "Test Admin",
      actorEmail: "admin.test@sirket.com",
      taskId: 50,
      taskTitle: "Görülebilen görev",
    },
  ];

  const response = await authenticated(
    request(app)
      .get("/api/tasks/activity/export")
      .query({ actor: "Admin", action: "DurumDegisikligi" }),
    1,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /text\/csv/);
  assert.match(
    response.headers["content-disposition"],
    /lawdesk-denetim-izi-\d{4}-\d{2}-\d{2}\.csv/,
  );
  assert.ok(response.text.startsWith("\uFEFF"));
  assert.match(response.text, /"Kayıt No";"Tarih";"İşlem Türü"/);
  assert.match(response.text, /"Durum değişikliği"/);
  assert.match(response.text, /"'=2\+2; ""deneme""\nyeni satır"/);
  assert.deepEqual(activityQueries[0].params, [
    "%Admin%",
    "DurumDegisikligi",
    5001,
  ]);
});

test("CSV export asks for narrower filters above the safe limit", async () => {
  activityRows = Array.from({ length: 5001 }, (_, index) => ({
    id: index + 1,
    action: "GorevOlusturma",
    detail: "Görev oluşturuldu",
    createdAt: new Date("2026-08-20T10:48:00.000Z"),
    actorId: 1,
    actorName: "Test Admin",
    actorEmail: "admin.test@sirket.com",
    taskId: index + 1,
    taskTitle: `Görev ${index + 1}`,
  }));

  const response = await authenticated(
    request(app).get("/api/tasks/activity/export"),
    1,
  );

  assert.equal(response.status, 422);
  assert.match(response.body.error, /en fazla 5000 kayıt/i);
});
