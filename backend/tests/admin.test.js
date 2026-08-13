const assert = require("node:assert/strict");
const {
  after,
  before,
  beforeEach,
  test,
} = require("node:test");

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET =
  "test-secret-".repeat(8);
process.env.AUTH_TOKEN_TTL_HOURS = "8";
process.env.AUTH_COOKIE_NAME =
  "lawdesk_test_session";

const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const app = require("../app");
const db = require("../config/db");

let passwordHash;

const originalQuery = db.query;
const adminEmail = "admin.test@sirket.com";
const testPassword = "GuvenliTestSifresi123!";

const createAdminToken = () => {
  return jwt.sign(
    {},
    process.env.AUTH_TOKEN_SECRET,
    {
      subject: String(1),
      issuer: "lawdesk-backend",
      audience: "lawdesk-web",
      expiresIn: "1h",
      algorithm: "HS256",
    },
  );
};

before(async () => {
  passwordHash = await argon2.hash(
    testPassword,
    {
      type: argon2.argon2id,
    },
  );
});

beforeEach(() => {
  db.query = async (text, params) => {
    const t = String(text || "").toLowerCase();

    if (t.includes("sifrehash")) {
      return {
        rows: [
          {
            kullaniciid: 1,
            adsoyad: "Test Admin",
            email: adminEmail,
            sifrehash: passwordHash,
            rol: "admin",
            aktifmi: true,
          },
        ],
      };
    }

    if (t.includes("set silindimi = true")) {
      return {
        rowCount: 1,
        rows: [
          {
            id: params[0],
            email: "ornek@sirket.com",
            silindiMi: true,
          },
        ],
      };
    }

    if (
      t.startsWith("update kullanicilar") ||
      t.includes("set aktifmi")
    ) {
      return {
        rowCount: 1,
        rows: [
          {
            id: params[1],
            email: "ornek@sirket.com",
            aktifmi: params[0],
          },
        ],
      };
    }

    if (t.includes("where kullaniciid = $1")) {
      if (Number(params?.[0]) === 1) {
        return {
          rows: [
            {
              kullaniciid: 1,
              adsoyad: "Test Admin",
              email: adminEmail,
              rol: "admin",
              aktifmi: true,
            },
          ],
        };
      }

      return {
        rows: [],
      };
    }

    if (t.includes("from gruplar")) {
      return {
        rows: [
          {
            id: 2,
            name: "KVKK",
            description: "KVKK ekibi",
          },
          {
            id: 1,
            name: "Uyum",
            description: "Uyum ekibi",
          },
        ],
      };
    }

    return {
      rows: [],
    };
  };
});

after(async () => {
  db.query = originalQuery;
  await db.close();
});

test(
  "admin can toggle active state of a user",
  async () => {
    const token = createAdminToken();

    const response = await request(app)
      .patch("/api/admin/users/2")
      .set(
        "Cookie",
        `${process.env.AUTH_COOKIE_NAME}=${token}`,
      )
      .send({
        aktifMi: false,
      });

    assert.equal(response.status, 200);
    assert.equal(
      response.body.user.aktifMi,
      false,
    );
  },
);

test(
  "admin can archive a user",
  async () => {
    const token = createAdminToken();

    const response = await request(app)
      .delete("/api/admin/users/2")
      .set(
        "Cookie",
        `${process.env.AUTH_COOKIE_NAME}=${token}`,
      );

    assert.equal(response.status, 200);
    assert.equal(
      response.body.archivedUserId,
      2,
    );
    assert.equal(
      response.body.message,
      "Kullanıcı arşivlendi",
    );
  },
);

test(
  "admin can list groups",
  async () => {
    const token = createAdminToken();

    const response = await request(app)
      .get("/api/admin/groups")
      .set(
        "Cookie",
        `${process.env.AUTH_COOKIE_NAME}=${token}`,
      );

    assert.equal(response.status, 200);

    assert.deepEqual(response.body.groups, [
      {
        id: 2,
        name: "KVKK",
        description: "KVKK ekibi",
      },
      {
        id: 1,
        name: "Uyum",
        description: "Uyum ekibi",
      },
    ]);
  },
);