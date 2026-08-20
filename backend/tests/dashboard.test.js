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
  2: {
    kullaniciid: 2,
    adsoyad: "Test Grup Yöneticisi",
    email: "manager.test@sirket.com",
    rol: "kullanici",
  },
  4: {
    kullaniciid: 4,
    adsoyad: "Test Standart Kullanıcı",
    email: "standard.test@sirket.com",
    rol: "kullanici",
  },
};

const memberships = {
  2: [
    {
      grupId: 2,
      grupAdi: "KVKK",
      grupRolu: "grup_yoneticisi",
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

let dashboardParams;
let recentTaskParams;

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
  dashboardParams = null;
  recentTaskParams = null;

  db.query = async (text, params = []) => {
    const sql = String(text || "");
    const normalized = sql.toLowerCase();

    if (
      normalized.includes(
        "select kullaniciid, adsoyad, email, rol",
      ) &&
      normalized.includes("from kullanicilar")
    ) {
      const user = users[Number(params[0])];

      return {
        rows: user ? [user] : [],
      };
    }

    if (
      normalized.includes(
        'gu.gruprolu as "gruprolu"',
      ) &&
      normalized.includes("from grupuyelikleri gu")
    ) {
      return {
        rows: memberships[Number(params[0])] || [],
      };
    }

    if (
      normalized.includes("with visible_tasks as") &&
      normalized.includes('as "activetasks"')
    ) {
      dashboardParams = params;

      return {
        rows: [
          {
            activeTasks: 1,
            archivedTasks:
              params[4] === true ? 1 : 0,
            openTasks: 1,
            closedTasks: 0,
            newAssigned: 1,
            inProgress: 0,
            waiting: 0,
            completed: 0,
            cancelled: 0,
            overdue: 1,
            dueSoon: 0,
            withoutDueDate: 0,
            criticalPriority: 0,
            highPriority: 1,
            mediumPriority: 0,
            lowPriority: 0,
            createdInPeriod: 2,
            completedInPeriod: 1,
            averageCompletionHours: "12.5",
            groupCount: params[2].length,
            typeBreakdown: [
              {
                id: 5,
                name: "=Riskli tip",
                count: 1,
              },
            ],
            assignmentBreakdown: [
              {
                id: 2,
                name: "KVKK",
                kind: "group",
                count: 1,
                overdue: 1,
              },
            ],
          },
        ],
      };
    }

    if (
      normalized.includes(
        'g.gorevid as "id"',
      ) &&
      normalized.includes("limit 6")
    ) {
      assert.equal(
        params.length,
        4,
        "recent task query must receive exactly four SQL parameters",
      );
      recentTaskParams = params;

      return {
        rows: [
          {
            id: 10,
            title: "Görünür görev",
            description: null,
            priority: "Yuksek",
            status: "Yeni Atandi",
            dueDate: "2026-08-19T09:00:00.000Z",
            typeName: "Operasyonel",
            assignedUserName: null,
            assignedGroupName: "KVKK",
            overdue: true,
          },
        ],
      };
    }

    throw new Error(
      `Unexpected database query: ${sql}`,
    );
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

test(
  "standard user dashboard excludes archive access",
  async () => {
    const beforeRequest = Date.now();
    const response = await authenticated(
      request(app).get(
        "/api/tasks/dashboard-summary",
      ),
      4,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(dashboardParams.slice(0, 5), [
      4,
      false,
      [],
      [],
      false,
    ]);
    assert.deepEqual(recentTaskParams, [
      4,
      false,
      [],
      [],
    ]);

    const boundary = new Date(dashboardParams[5]).getTime();
    const expectedBoundary = beforeRequest - 30 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(boundary - expectedBoundary) < 5_000);

    assert.equal(response.body.reportPeriod, "30");
    assert.equal(response.body.totalTasks, 1);
    assert.equal(response.body.activeTasks, 1);
    assert.equal(response.body.archivedTasks, 0);
    assert.equal(response.body.openTasks, 1);
    assert.equal(response.body.groupCount, 0);
    assert.equal(
      response.body.canViewArchive,
      false,
    );

    assert.deepEqual(response.body.statusCounts, {
      "Yeni Atandi": 1,
      "Devam Ediyor": 0,
      Beklemede: 0,
      Tamamlandi: 0,
      "Iptal Edildi": 0,
    });
    assert.deepEqual(response.body.riskCounts, {
      overdue: 1,
      dueSoon: 0,
      withoutDueDate: 0,
    });
    assert.deepEqual(response.body.performance, {
      createdTasks: 2,
      completedTasks: 1,
      completionRate: 50,
      averageCompletionHours: 12.5,
    });
    assert.equal(
      response.body.recentTasks[0].title,
      "Görünür görev",
    );
  },
);

test(
  "group manager dashboard uses managed group scope",
  async () => {
    const response = await authenticated(
      request(app).get(
        "/api/tasks/dashboard-summary",
      ),
      2,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(dashboardParams.slice(0, 5), [
      2,
      false,
      [2],
      [2],
      true,
    ]);

    assert.equal(response.body.totalTasks, 2);
    assert.equal(response.body.activeTasks, 1);
    assert.equal(response.body.archivedTasks, 1);
    assert.equal(response.body.groupCount, 1);
    assert.equal(
      response.body.canViewArchive,
      true,
    );
    assert.deepEqual(response.body.assignmentBreakdown, [
      {
        id: 2,
        name: "KVKK",
        kind: "group",
        count: 1,
        overdue: 1,
      },
    ]);
  },
);

test(
  "dashboard applies the selected reporting period",
  async () => {
    const beforeRequest = Date.now();
    const response = await authenticated(
      request(app).get(
        "/api/tasks/dashboard-summary?period=90",
      ),
      4,
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.reportPeriod, "90");

    const boundary = new Date(dashboardParams[5]).getTime();
    const expectedBoundary = beforeRequest - 90 * 24 * 60 * 60 * 1000;
    assert.ok(Math.abs(boundary - expectedBoundary) < 5_000);
  },
);

test(
  "dashboard all-time period does not set a date boundary",
  async () => {
    const response = await authenticated(
      request(app).get(
        "/api/tasks/dashboard-summary?period=all",
      ),
      4,
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.reportPeriod, "all");
    assert.equal(dashboardParams[5], null);
  },
);

test(
  "dashboard report export requires authentication",
  async () => {
    const response = await request(app).get(
      "/api/tasks/dashboard-report/export",
    );

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Giriş yapmanız gerekiyor");
  },
);

test(
  "dashboard report exports scoped Excel-safe UTF-8 CSV",
  async () => {
    const response = await authenticated(
      request(app).get(
        "/api/tasks/dashboard-report/export?period=all",
      ),
      4,
    );

    assert.equal(response.status, 200);
    assert.match(
      response.headers["content-type"],
      /^text\/csv; charset=utf-8/,
    );
    assert.match(
      response.headers["content-disposition"],
      /lawdesk-gorev-raporu-all-\d{4}-\d{2}-\d{2}\.csv/,
    );
    assert.equal(response.text.charCodeAt(0), 0xfeff);
    assert.match(response.text, /"Bölüm";"Metrik";"Değer";"Açıklama"/);
    assert.ok(response.text.includes("\"'=Riskli tip\""));
    assert.ok(!response.text.includes("\"=Riskli tip\""));
    assert.deepEqual(dashboardParams.slice(0, 5), [
      4,
      false,
      [],
      [],
      false,
    ]);
    assert.equal(dashboardParams[5], null);
  },
);
