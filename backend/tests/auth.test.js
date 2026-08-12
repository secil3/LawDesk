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
const {
  requireSystemRole,
} = require("../middleware/auth");

const testPassword = "GuvenliTestSifresi123!";
const activeEmail = "admin.test@sirket.com";
const passiveEmail = "pasif.test@sirket.com";

let passwordHash;
const originalQuery = db.query;

const activeUser = () => ({
  kullaniciid: 1,
  adsoyad: "Test Admin",
  email: activeEmail,
  sifrehash: passwordHash,
  rol: "admin",
  aktifmi: true,
});

const passiveUser = () => ({
  kullaniciid: 2,
  adsoyad: "Pasif Kullanici",
  email: passiveEmail,
  sifrehash: passwordHash,
  rol: "kullanici",
  aktifmi: false,
});

before(async () => {
  passwordHash = await argon2.hash(testPassword, {
    type: argon2.argon2id,
  });
});

beforeEach(() => {
  db.query = async (text, params) => {
    if (text.includes("sifrehash")) {
      const email = String(params[0]).toLowerCase();

      if (email === activeEmail) {
        return {
          rows: [activeUser()],
        };
      }

      if (email === passiveEmail) {
        return {
          rows: [passiveUser()],
        };
      }

      return {
        rows: [],
      };
    }

    if (text.includes("WHERE kullaniciid = $1")) {
      if (Number(params[0]) === 1) {
        return {
          rows: [activeUser()],
        };
      }

      return {
        rows: [],
      };
    }

    throw new Error(
      "Unexpected database query in test",
    );
  };
});

after(async () => {
  db.query = originalQuery;
  await db.close();
});

test("empty login fields are rejected", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: "",
      password: "",
    });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "E-posta ve şifre zorunludur",
  });
});

test(
  "unknown user and wrong password return the same message",
  async () => {
    const unknownResponse = await request(app)
      .post("/api/auth/login")
      .send({
        email: "olmayan@sirket.com",
        password: testPassword,
      });

    const wrongPasswordResponse = await request(app)
      .post("/api/auth/login")
      .send({
        email: activeEmail,
        password: "TamamenYanlisSifre123!",
      });

    assert.equal(unknownResponse.status, 401);
    assert.equal(wrongPasswordResponse.status, 401);

    assert.deepEqual(
      unknownResponse.body,
      wrongPasswordResponse.body,
    );

    assert.deepEqual(unknownResponse.body, {
      error: "E-posta veya şifre hatalı",
    });
  },
);

test("passive user cannot log in", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: passiveEmail,
      password: testPassword,
    });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    error: "E-posta veya şifre hatalı",
  });
});

test(
  "valid login returns user and HttpOnly cookie",
  async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: activeEmail,
        password: testPassword,
      });

    assert.equal(response.status, 200);

    assert.deepEqual(response.body.user, {
      id: 1,
      adSoyad: "Test Admin",
      email: activeEmail,
      rol: "admin",
    });

    const cookie =
      response.headers["set-cookie"]?.[0] || "";

    assert.match(
      cookie,
      /lawdesk_test_session=/,
    );
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  },
);

test("me requires a valid login", async () => {
  const response = await request(app).get(
    "/api/auth/me",
  );

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    error: "Giriş yapmanız gerekiyor",
  });
});

test(
  "login, me and logout work as one session",
  async () => {
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/auth/login")
      .send({
        email: activeEmail,
        password: testPassword,
      });

    assert.equal(loginResponse.status, 200);

    const meResponse = await agent.get(
      "/api/auth/me",
    );

    assert.equal(meResponse.status, 200);
    assert.equal(
      meResponse.body.user.email,
      activeEmail,
    );

    const logoutResponse = await agent.post(
      "/api/auth/logout",
    );

    assert.equal(logoutResponse.status, 200);
    assert.deepEqual(logoutResponse.body, {
      message: "Çıkış başarılı",
    });

    const afterLogoutResponse = await agent.get(
      "/api/auth/me",
    );

    assert.equal(afterLogoutResponse.status, 401);
  },
);

const createResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
  };

  res.status = (statusCode) => {
    res.statusCode = statusCode;
    return res;
  };

  res.json = (body) => {
    res.body = body;
    return res;
  };

  return res;
};

test(
  "system role rejects unauthorized user",
  () => {
    const req = {
      user: {
        rol: "kullanici",
      },
    };

    const res = createResponse();
    let nextCalled = false;

    requireSystemRole("admin")(
      req,
      res,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);

    assert.deepEqual(res.body, {
      error:
        "Bu işlem için yetkiniz bulunmuyor",
    });
  },
);

test(
  "system role allows authorized user",
  () => {
    const req = {
      user: {
        rol: "admin",
      },
    };

    const res = createResponse();
    let nextCalled = false;

    requireSystemRole("admin")(
      req,
      res,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, null);
  },
);