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

const argon2 = require("argon2");
const request = require("supertest");

const app = require("../app");
const db = require("../config/db");

const originalQuery = db.query;
const testPassword = "GuvenliTestSifresi123!";

let passwordHash;
let loginSql;

before(async () => {
  passwordHash = await argon2.hash(testPassword, {
    type: argon2.argon2id,
  });
});

beforeEach(() => {
  loginSql = "";

  db.query = async (text) => {
    loginSql = String(text || "");

    return {
      rows: [
        {
          kullaniciid: 7,
          adsoyad: "Test Grup Yöneticisi",
          email: "group.manager.test@sirket.com",
          sifrehash: passwordHash,
          rol: "kullanici",
          aktifmi: true,
          groups: [
            {
              grupId: 2,
              grupAdi: "KVKK",
              grupRolu: "grup_yoneticisi",
            },
          ],
        },
      ],
    };
  };
});

after(async () => {
  db.query = originalQuery;
  await db.close();
});

test(
  "login response includes normalized group memberships",
  async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "group.manager.test@sirket.com",
        password: testPassword,
      });

    assert.equal(response.status, 200);

    assert.deepEqual(response.body.user, {
      id: 7,
      adSoyad: "Test Grup Yöneticisi",
      email: "group.manager.test@sirket.com",
      rol: "kullanici",
      groups: [
        {
          grupId: 2,
          grupAdi: "KVKK",
          grupRolu: "grup_yoneticisi",
        },
      ],
    });

    assert.match(
      loginSql,
      /from grupuyelikleri/i,
    );

    assert.match(
      loginSql,
      /as "groups"/i,
    );
  },
);