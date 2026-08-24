const assert = require("node:assert/strict");
const { after, beforeEach, test } = require("node:test");

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-secret-".repeat(8);
process.env.AUTH_TOKEN_TTL_HOURS = "8";
process.env.AUTH_COOKIE_NAME = "lawdesk_test_session";
process.env.REGISTRATION_RATE_LIMIT_MAX = "1000";
process.env.SMTP_JSON_TRANSPORT = "true";
process.env.SMTP_FROM = "LawDesk Test <lawdesk@test.local>";
process.env.APP_BASE_URL = "http://localhost:5175";

const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const expressApp = require("../app");
const db = require("../config/db");
const registrationController = require(
  "../controllers/registrationController",
);

const GENERIC_RESPONSE = {
  message:
    "Başvurunuz alınmıştır. İnceleme sonucunda e-posta gönderilecektir.",
};
const VALID_TOKEN = "A".repeat(43);
const VALID_PASSWORD = "GuvenliAktivasyonParolasi123!";

const originalQuery = db.query;
const originalWithTransaction = db.withTransaction;

let transactionCalls;
let transactionQueries;
let existingUser;
let pendingRequest;
let activationAvailable;
let storedPasswordHash;
let approvalTokenInsert;
let approvalEmailRecorded;

const transactionQuery = async (text, params = []) => {
  const sql = String(text);
  const normalized = sql.toLowerCase();
  transactionQueries.push({ sql, params });

  if (
    normalized.includes("select 1") &&
    normalized.includes("from kullanicilar")
  ) {
    return {
      rows: existingUser ? [{ exists: 1 }] : [],
      rowCount: existingUser ? 1 : 0,
    };
  }

  if (normalized.includes("insert into kayit_talepleri")) {
    return pendingRequest
      ? { rows: [], rowCount: 0 }
      : { rows: [{ id: 41 }], rowCount: 1 };
  }

  if (
    normalized.includes('select kullaniciid as "id"') &&
    normalized.includes("rol = 'admin'")
  ) {
    return { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };
  }

  if (normalized.includes("insert into bildirimler")) {
    return { rows: [], rowCount: 1 };
  }

  if (
    normalized.includes("from kullaniciaktivasyontokenlari token") &&
    normalized.includes("for update")
  ) {
    return activationAvailable
      ? { rows: [{ tokenId: 7, userId: 19 }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  }

  if (
    normalized.includes("from kayit_talepleri") &&
    normalized.includes("for update")
  ) {
    return {
      rows: [
        {
          id: 41,
          adsoyad: "Onaylanan Aday",
          email: "approved@example.com",
          durum: "Bekliyor",
        },
      ],
      rowCount: 1,
    };
  }

  if (normalized.includes("insert into kullanicilar")) {
    return { rows: [{ id: 19 }], rowCount: 1 };
  }

  if (normalized.includes("insert into kullaniciaktivasyontokenlari")) {
    approvalTokenInsert = params;
    return { rows: [], rowCount: 1 };
  }

  if (normalized.includes("update kullanicilar")) {
    storedPasswordHash = params[1];
    return { rows: [], rowCount: 1 };
  }

  if (
    normalized.includes("update kullaniciaktivasyontokenlari") &&
    normalized.includes("set kullanilmatarihi")
  ) {
    activationAvailable = false;
    return { rows: [], rowCount: 1 };
  }

  if (
    normalized.includes("update kullaniciaktivasyontokenlari") ||
    normalized.includes("insert into aktiviteloglari") ||
    normalized.includes("update kayit_talepleri")
  ) {
    return { rows: [], rowCount: 1 };
  }

  throw new Error(`Unexpected transaction query: ${sql}`);
};

beforeEach(() => {
  transactionCalls = 0;
  transactionQueries = [];
  existingUser = false;
  pendingRequest = false;
  activationAvailable = true;
  storedPasswordHash = null;
  approvalTokenInsert = null;
  approvalEmailRecorded = false;

  db.query = async (text, params = []) => {
    const sql = String(text);
    const normalized = sql.toLowerCase();

    if (
      normalized.includes("select kullaniciid, adsoyad, email, rol") &&
      normalized.includes("from kullanicilar")
    ) {
      return {
        rows: [
          {
            kullaniciid: 1,
            adsoyad: "Test Admin",
            email: "admin@example.com",
            rol: "admin",
          },
        ],
        rowCount: 1,
      };
    }

    if (normalized.includes("from grupuyelikleri gu")) {
      return { rows: [], rowCount: 0 };
    }

    if (normalized.includes("update kayit_talepleri")) {
      approvalEmailRecorded = params[1] === true;
      return { rows: [], rowCount: 1 };
    }

    if (normalized.includes("from kullaniciaktivasyontokenlari token")) {
      const expectedHash = registrationController._private.tokenHashFor(
        VALID_TOKEN,
      );
      assert.equal(params[0], expectedHash);

      return activationAvailable
        ? {
            rows: [
              {
                tokenId: 7,
                userId: 19,
                requestId: 41,
                email: "aday@example.com",
                activationPending: true,
              },
            ],
            rowCount: 1,
          }
        : { rows: [], rowCount: 0 };
    }

    throw new Error(`Unexpected database query: ${sql}`);
  };

  db.withTransaction = async (callback) => {
    transactionCalls += 1;
    return callback(transactionQuery);
  };
});

after(async () => {
  db.query = originalQuery;
  db.withTransaction = originalWithTransaction;
  await db.close();
});

test("public registration always uses the same generic response", async () => {
  const invalidResponse = await request(expressApp)
    .post("/api/registration-requests")
    .send({ adSoyad: "", email: "not-an-email" });

  assert.equal(invalidResponse.status, 202);
  assert.deepEqual(invalidResponse.body, GENERIC_RESPONSE);
  assert.equal(transactionCalls, 0);

  existingUser = true;
  const existingResponse = await request(expressApp)
    .post("/api/registration-requests")
    .send({
      adSoyad: "Var Olan Kullanıcı",
      email: "EXISTING@EXAMPLE.COM",
    });

  assert.equal(existingResponse.status, 202);
  assert.deepEqual(existingResponse.body, GENERIC_RESPONSE);
  assert.equal(transactionCalls, 1);
});

test("new request is stored once and every active admin is notified", async () => {
  const response = await request(expressApp)
    .post("/api/registration-requests")
    .send({
      adSoyad: "  Yeni   Aday  ",
      email: "ADAY@EXAMPLE.COM",
    });

  assert.equal(response.status, 202);
  assert.deepEqual(response.body, GENERIC_RESPONSE);

  const requestInsert = transactionQueries.find((query) =>
    query.sql.toLowerCase().includes("insert into kayit_talepleri"),
  );
  assert.deepEqual(requestInsert.params, ["Yeni Aday", "aday@example.com"]);

  const notifications = transactionQueries.filter((query) =>
    query.sql.toLowerCase().includes("insert into bildirimler"),
  );
  assert.equal(notifications.length, 2);
  assert.deepEqual(
    notifications.map((notification) => notification.params.slice(0, 4)),
    [
      [1, null, 41, "KayitTalebi"],
      [2, null, 41, "KayitTalebi"],
    ],
  );
});

test("an already pending email does not create duplicate notifications", async () => {
  pendingRequest = true;

  const response = await request(expressApp)
    .post("/api/registration-requests")
    .send({ adSoyad: "Yeni Aday", email: "aday@example.com" });

  assert.equal(response.status, 202);
  assert.deepEqual(response.body, GENERIC_RESPONSE);
  assert.equal(
    transactionQueries.some((query) =>
      query.sql.toLowerCase().includes("insert into bildirimler"),
    ),
    false,
  );
});

test("activation token is random, hash-only and defaults to 24 hours", () => {
  const first = registrationController._private.createActivationToken();
  const second = registrationController._private.createActivationToken();

  assert.equal(first.token.length, 43);
  assert.equal(first.tokenHash.length, 64);
  assert.notEqual(first.token, first.tokenHash);
  assert.notEqual(first.token, second.token);
  assert.equal(
    first.tokenHash,
    registrationController._private.tokenHashFor(first.token),
  );

  const hoursRemaining =
    (first.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000);
  assert.ok(hoursRemaining > 23.9 && hoursRemaining <= 24);
});

test("group selections are normalized and duplicate groups are rejected", () => {
  assert.deepEqual(
    registrationController._private.parseMemberships([
      { grupId: "2", grupRolu: "uye" },
      { grupId: 3, grupRolu: "yonetici" },
    ]),
    [
      { groupId: 2, groupRole: "grup_uyesi" },
      { groupId: 3, groupRole: "grup_yoneticisi" },
    ],
  );

  assert.throws(
    () =>
      registrationController._private.parseMemberships([
        { grupId: 2, grupRolu: "grup_uyesi" },
        { grupId: 2, grupRolu: "grup_yoneticisi" },
      ]),
    /Aynı grup birden fazla seçilemez/,
  );
});

test("admin approval creates a pending user and sends activation email", async () => {
  const adminToken = jwt.sign(
    {},
    process.env.AUTH_TOKEN_SECRET,
    {
      subject: "1",
      issuer: "lawdesk-backend",
      audience: "lawdesk-web",
      expiresIn: "1h",
      algorithm: "HS256",
    },
  );

  const response = await request(expressApp)
    .post("/api/admin/registration-requests/41/approve")
    .set(
      "Cookie",
      `${process.env.AUTH_COOKIE_NAME}=${adminToken}`,
    )
    .send({ systemRole: "kullanici", memberships: [] });

  assert.equal(response.status, 201);
  assert.equal(response.body.requestId, 41);
  assert.equal(response.body.userId, 19);
  assert.ok(approvalTokenInsert);
  assert.equal(approvalTokenInsert[0], 19);
  assert.equal(approvalTokenInsert[1], 41);
  assert.match(approvalTokenInsert[2], /^[a-f0-9]{64}$/);
  assert.equal(approvalTokenInsert[4], 1);
  assert.equal(approvalEmailRecorded, true);

  const userInsert = transactionQueries.find((query) =>
    query.sql.toLowerCase().includes("insert into kullanicilar"),
  );
  assert.deepEqual(userInsert.params, [
    "Onaylanan Aday",
    "approved@example.com",
    "kullanici",
  ]);
});

test("activation validates the token, stores Argon2id and is single-use", async () => {
  const validation = await request(expressApp)
    .post("/api/registration-requests/activation/validate")
    .send({ token: VALID_TOKEN });

  assert.equal(validation.status, 200);
  assert.deepEqual(validation.body, {
    valid: true,
    email: "a***@example.com",
  });

  const activation = await request(expressApp)
    .post("/api/registration-requests/activation/complete")
    .send({
      token: VALID_TOKEN,
      password: VALID_PASSWORD,
      passwordConfirmation: VALID_PASSWORD,
    });

  assert.equal(activation.status, 200);
  assert.match(activation.body.message, /aktifleştirildi/);
  assert.ok(storedPasswordHash);
  assert.equal(await argon2.verify(storedPasswordHash, VALID_PASSWORD), true);
  assert.match(storedPasswordHash, /^\$argon2id\$/);

  const reused = await request(expressApp)
    .post("/api/registration-requests/activation/complete")
    .send({
      token: VALID_TOKEN,
      password: VALID_PASSWORD,
      passwordConfirmation: VALID_PASSWORD,
    });

  assert.equal(reused.status, 400);
  assert.match(reused.body.error, /geçersiz veya süresi dolmuş/);
});
