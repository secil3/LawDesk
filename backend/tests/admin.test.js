const assert = require("node:assert/strict");
const { before, beforeEach, after, test } = require("node:test");

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-secret-".repeat(8);
process.env.AUTH_TOKEN_TTL_HOURS = "8";
process.env.AUTH_COOKIE_NAME = "lawdesk_test_session";

const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const app = require("../app");
const db = require("../config/db");

let passwordHash;
const originalQuery = db.query;

const adminEmail = "admin.test@sirket.com";
const testPassword = "GuvenliTestSifresi123!";

before(async () => {
  passwordHash = await argon2.hash(testPassword, { type: argon2.argon2id });
});

beforeEach(() => {
  db.query = async (text, params) => {
    const t = String(text || "").toLowerCase();

    // login/select sifrehash
    if (t.includes("sifrehash")) {
      return { rows: [ { kullaniciid: 1, adsoyad: 'Test Admin', email: adminEmail, sifrehash: passwordHash, rol: 'admin', aktifmi: true } ] };
    }

    // delete grupuyelikleri
    // archive user
if (t.includes("set silindimi = true")) {
  return {
    rowCount: 1,
    rows: [
      {
        id: params[0],
        email: "zayn@gmail.com",
        silindiMi: true,
      },
    ],
  };
}
    // update aktifmi
    if (t.startsWith("update kullanicilar") || t.includes("set aktifmi")) {
      return { rowCount: 1, rows: [ { id: params[1], email: 'zayn@gmail.com', aktifmi: params[0] } ] };
    }

    // select user by id used in requireAuth
    if (t.includes("where kullaniciid = $1")) {
      // return admin user for id 1
      if (Number(params?.[0]) === 1) {
        return { rows: [ { kullaniciid: 1, adsoyad: 'Test Admin', email: adminEmail, rol: 'admin', aktifmi: true } ] };
      }
      return { rows: [] };
    }

    // default
    return { rows: [] };
  };
});

after(async () => {
  db.query = originalQuery;
  await db.close();
});

test('admin can toggle active state of a user', async () => {
  // create a valid JWT for user id 1 (admin)
  const token = jwt.sign({}, process.env.AUTH_TOKEN_SECRET, {
    subject: String(1),
    issuer: 'lawdesk-backend',
    audience: 'lawdesk-web',
    expiresIn: '1h',
    algorithm: 'HS256',
  });

  // directly call PATCH with cookie header
  const patchRes = await request(app)
    .patch('/api/admin/users/2')
    .set('Cookie', `${process.env.AUTH_COOKIE_NAME}=${token}`)
    .send({ aktifMi: false });

  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.body.user.aktifMi, false);
});

test('admin can archive a user', async () => {
  const token = jwt.sign({}, process.env.AUTH_TOKEN_SECRET, {
    subject: String(1),
    issuer: 'lawdesk-backend',
    audience: 'lawdesk-web',
    expiresIn: '1h',
    algorithm: 'HS256',
  });

  const delRes = await request(app)
    .delete('/api/admin/users/2')
    .set('Cookie', `${process.env.AUTH_COOKIE_NAME}=${token}`);

  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.archivedUserId, 2);
  assert.equal(delRes.body.message, "Kullanıcı arşivlendi");
});
