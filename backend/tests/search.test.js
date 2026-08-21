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

let app = null;
let testServer = null;
let currentRole;
let currentMemberships;
let recorded;

const originalQuery = db.query;

const createToken = () => {
  return jwt.sign(
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
};

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
  currentRole = "admin";
  currentMemberships = [];
  recorded = {
    taskParams: null,
    groupParams: null,
    userSearchCalled: false,
    classificationSearchCalled: false,
    activitySearchCalled: false,
  };

  db.query = async (text, params) => {
    const t = String(text || "").toLowerCase();

    if (
      t.includes("from kullanicilar") &&
      !t.includes("from kullanicilar k") &&
      t.includes("where kullaniciid = $1")
    ) {
      return {
        rows: [
          {
            kullaniciid: 1,
            adsoyad: "Arama Kullanıcısı",
            email: "arama@sirket.com",
            rol: currentRole,
          },
        ],
      };
    }

    if (t.includes("from grupuyelikleri gu") && t.includes("join gruplar g")) {
      return { rows: currentMemberships };
    }

    if (t.includes("from gorevler g") && t.includes("task_attachment")) {
      recorded.taskParams = params;
      return {
        rows: [
          {
            id: 12,
            title: "KVKK uyum görevi",
            status: "Devam Ediyor",
            archived: false,
            typeName: "Denetim",
            assignedGroupName: "KVKK",
          },
        ],
      };
    }

    if (t.includes("count(gu.grupuyelikid)::int")) {
      recorded.groupParams = params;
      return {
        rows: [
          {
            id: 2,
            title: "KVKK",
            description: "KVKK ekibi",
            memberCount: 4,
          },
        ],
      };
    }

    if (t.includes("from kullanicilar k") && t.includes("user_membership")) {
      recorded.userSearchCalled = true;
      return {
        rows: [
          {
            id: 3,
            title: "Ayşe Yılmaz",
            email: "ayse@sirket.com",
            rol: "kullanici",
            active: true,
            archived: false,
          },
        ],
      };
    }

    if (t.includes("from (") && t.includes("classification.kind")) {
      recorded.classificationSearchCalled = true;
      return {
        rows: [
          {
            kind: "taskType",
            id: 4,
            title: "Denetim",
            description: "Denetim görevleri",
            active: true,
          },
          {
            kind: "tag",
            id: 7,
            title: "KVKK",
            description: null,
            active: true,
          },
        ],
      };
    }

    if (t.includes("from aktiviteloglari activity")) {
      recorded.activitySearchCalled = true;
      return {
        rows: [
          {
            id: 19,
            action: "GorevGuncelleme",
            detail: "KVKK görevi güncellendi",
            actorName: "Arama Kullanıcısı",
            taskTitle: "KVKK uyum görevi",
          },
        ],
      };
    }

    return { rows: [] };
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

test("global search requires authentication", async () => {
  const response = await request(app).get("/api/search?q=kvkk");

  assert.equal(response.status, 401);
});

test("global search requires at least two characters", async () => {
  const response = await request(app)
    .get("/api/search?q=k")
    .set("Cookie", `${process.env.AUTH_COOKIE_NAME}=${createToken()}`);

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Arama için en az 2 karakter giriniz");
});

test("admin global search returns all permitted result categories", async () => {
  const response = await request(app)
    .get("/api/search?q=kvkk")
    .set("Cookie", `${process.env.AUTH_COOKIE_NAME}=${createToken()}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.query, "kvkk");
  assert.deepEqual(
    response.body.results.map((result) => result.kind),
    ["task", "group", "user", "taskType", "tag", "activity"],
  );
  assert.deepEqual(recorded.taskParams, [
    1,
    true,
    [],
    [],
    true,
    "%kvkk%",
    5,
  ]);
  assert.deepEqual(recorded.groupParams, ["%kvkk%", 5]);
  assert.equal(recorded.userSearchCalled, true);
  assert.equal(recorded.classificationSearchCalled, true);
  assert.equal(recorded.activitySearchCalled, true);
});

test("standard user global search stays inside task and group scope", async () => {
  currentRole = "kullanici";
  currentMemberships = [
    {
      grupId: 2,
      grupAdi: "KVKK",
      grupRolu: "grup_uyesi",
    },
  ];

  const response = await request(app)
    .get("/api/search?q=kvkk")
    .set("Cookie", `${process.env.AUTH_COOKIE_NAME}=${createToken()}`);

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.results.map((result) => result.kind),
    ["task", "group"],
  );
  assert.deepEqual(recorded.taskParams, [
    1,
    false,
    [2],
    [],
    false,
    "%kvkk%",
    5,
  ]);
  assert.deepEqual(recorded.groupParams, [[2], "%kvkk%", 5]);
  assert.equal(recorded.userSearchCalled, false);
  assert.equal(recorded.classificationSearchCalled, false);
  assert.equal(recorded.activitySearchCalled, false);
});
