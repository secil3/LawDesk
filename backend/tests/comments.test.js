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
    adsoyad: "Görev Üyesi",
    email: "member.test@sirket.com",
    rol: "kullanici",
  },
  4: {
    kullaniciid: 4,
    adsoyad: "Başka Kullanıcı",
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

let currentComment;
let commentHistory;
let taskVisible;
let currentTaskStatus;
let currentTaskArchived;
let activity;

const seedComment = ({
  authorId = 3,
  archived = false,
  edited = false,
  text = "İlk değerlendirme tamamlandı.",
  version = 1,
} = {}) => {
  currentComment = {
    id: 70,
    text,
    authorId,
    authorName: users[authorId].adsoyad,
    createdAt: new Date("2026-08-20T08:00:00.000Z"),
    updatedAt: edited
      ? new Date("2026-08-20T09:00:00.000Z")
      : null,
    edited,
    version,
    archived,
    archivedAt: archived
      ? new Date("2026-08-20T10:00:00.000Z")
      : null,
  };
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
  currentComment = null;
  commentHistory = [];
  taskVisible = true;
  currentTaskStatus = "Yeni Atandi";
  currentTaskArchived = false;
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
            status: currentTaskStatus,
            archived: currentTaskArchived,
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
      normalized.includes("from yorumlar y") &&
      normalized.includes("for update of y")
    ) {
      const expectedArchived = Boolean(params[2]);
      return {
        rows:
          currentComment && currentComment.archived === expectedArchived
            ? [currentComment]
            : [],
      };
    }

    if (
      normalized.includes("from yorumlar y") &&
      normalized.includes("join kullanicilar author")
    ) {
      const expectedArchived = Boolean(params[1]);
      return {
        rows:
          currentComment && currentComment.archived === expectedArchived
            ? [currentComment]
            : [],
      };
    }

    if (normalized.includes("insert into yorumlar")) {
      seedComment({
        authorId: Number(params[1]),
        text: params[2],
      });
      currentComment.id = 71;
      return { rows: [currentComment] };
    }

    if (normalized.includes("insert into yorumgecmisi")) {
      commentHistory.push({
        id: 90 + commentHistory.length,
        text: params[1],
        version: Number(params[2]),
        editorId: Number(params[3]),
        editorName: users[Number(params[3])]?.adsoyad || null,
        changedAt: new Date("2026-08-20T09:00:00.000Z"),
      });
      return { rows: [] };
    }

    if (
      normalized.includes("update yorumlar") &&
      normalized.includes("set yorummetni = $1")
    ) {
      if (
        !currentComment ||
        currentComment.archived ||
        Number(currentComment.version) !== Number(params[3])
      ) {
        return { rowCount: 0, rows: [] };
      }

      currentComment.text = params[0];
      currentComment.edited = true;
      currentComment.version += 1;
      currentComment.updatedAt = new Date("2026-08-20T09:00:00.000Z");
      return { rowCount: 1, rows: [currentComment] };
    }

    if (
      normalized.includes("update yorumlar") &&
      normalized.includes("set silindimi = true")
    ) {
      if (!currentComment || currentComment.archived) {
        return { rowCount: 0, rows: [] };
      }

      currentComment.archived = true;
      currentComment.archivedAt = new Date("2026-08-20T10:00:00.000Z");
      return { rowCount: 1, rows: [] };
    }

    if (
      normalized.includes("update yorumlar") &&
      normalized.includes("set silindimi = false")
    ) {
      if (!currentComment || !currentComment.archived) {
        return { rowCount: 0, rows: [] };
      }

      currentComment.archived = false;
      currentComment.archivedAt = null;
      return { rowCount: 1, rows: [] };
    }

    if (
      normalized.includes('select yorumid as "id"') &&
      normalized.includes("from yorumlar")
    ) {
      return { rows: currentComment ? [{ id: currentComment.id }] : [] };
    }

    if (
      normalized.includes("from yorumgecmisi history") &&
      normalized.includes("left join kullanicilar editor")
    ) {
      return { rows: commentHistory };
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

    if (normalized.includes("insert into bildirimler")) {
      return { rows: [] };
    }

    throw new Error(`Unexpected database query in comment test: ${sql}`);
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

test("comment routes require authentication", async () => {
  const response = await request(app).get("/api/tasks/50/comments");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Giriş yapmanız gerekiyor");
});

test("visible task user can list active comments", async () => {
  seedComment();

  const response = await authenticated(
    request(app).get("/api/tasks/50/comments"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.comments.length, 1);
  assert.equal(response.body.comments[0].text, currentComment.text);
  assert.equal(response.body.comments[0].canEdit, true);
  assert.equal(response.body.comments[0].canArchive, true);
  assert.equal(response.body.canComment, true);
});

test("user outside task visibility cannot list comments", async () => {
  taskVisible = false;

  const response = await authenticated(
    request(app).get("/api/tasks/50/comments"),
    4,
  );

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "Görev bulunamadı");
});

test("visible task user can add a trimmed comment", async () => {
  const response = await authenticated(
    request(app)
      .post("/api/tasks/50/comments")
      .send({ yorumMetni: "  Plan gözden geçirildi.  " }),
    3,
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.comment.text, "Plan gözden geçirildi.");
  assert.equal(response.body.comment.version, 1);
  assert.equal(response.body.comment.canEdit, true);
  assert.equal(activity[0].action, "YorumEkleme");
});

test("empty comment text is rejected", async () => {
  const response = await authenticated(
    request(app)
      .post("/api/tasks/50/comments")
      .send({ yorumMetni: "   " }),
    3,
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "Yorum metni zorunludur");
});

test("completed task rejects new comments", async () => {
  currentTaskStatus = "Tamamlandi";

  const response = await authenticated(
    request(app)
      .post("/api/tasks/50/comments")
      .send({ yorumMetni: "Yeni yorum" }),
    1,
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /tamamlanmış/i);
});

test("comment author can edit with version history", async () => {
  seedComment();

  const response = await authenticated(
    request(app)
      .patch("/api/tasks/50/comments/70")
      .send({
        yorumMetni: "Güncel değerlendirme tamamlandı.",
        version: 1,
      }),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.comment.text, "Güncel değerlendirme tamamlandı.");
  assert.equal(response.body.comment.version, 2);
  assert.equal(response.body.comment.edited, true);
  assert.equal(commentHistory.length, 1);
  assert.equal(commentHistory[0].text, "İlk değerlendirme tamamlandı.");
  assert.equal(commentHistory[0].version, 1);
  assert.equal(activity[0].action, "YorumDuzenleme");
});

test("stale comment version is rejected without overwriting", async () => {
  seedComment({
    edited: true,
    text: "Başka oturumdaki güncel metin",
    version: 2,
  });

  const response = await authenticated(
    request(app)
      .patch("/api/tasks/50/comments/70")
      .send({ yorumMetni: "Eski ekrandaki metin", version: 1 }),
    3,
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /başka bir oturumda güncellendi/i);
  assert.equal(currentComment.text, "Başka oturumdaki güncel metin");
  assert.equal(commentHistory.length, 0);
});

test("unrelated user cannot edit another user's comment", async () => {
  seedComment();

  const response = await authenticated(
    request(app)
      .patch("/api/tasks/50/comments/70")
      .send({ yorumMetni: "Yetkisiz değişiklik", version: 1 }),
    4,
  );

  assert.equal(response.status, 403);
  assert.match(response.body.error, /kendi yorumunuzu/i);
  assert.equal(currentComment.text, "İlk değerlendirme tamamlandı.");
});

test("visible task user can view comment edit history", async () => {
  seedComment({ edited: true, version: 2 });
  commentHistory = [
    {
      id: 90,
      text: "İlk metin",
      version: 1,
      changedAt: new Date("2026-08-20T09:00:00.000Z"),
      editorId: 3,
      editorName: users[3].adsoyad,
    },
  ];

  const response = await authenticated(
    request(app).get("/api/tasks/50/comments/70/history"),
    4,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.history.length, 1);
  assert.equal(response.body.history[0].text, "İlk metin");
  assert.equal(response.body.history[0].version, 1);
});

test("task manager can archive another user's comment", async () => {
  seedComment();

  const response = await authenticated(
    request(app).delete("/api/tasks/50/comments/70"),
    2,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Yorum arşivlendi");
  assert.equal(currentComment.archived, true);
  assert.equal(activity[0].action, "YorumArsivleme");
});

test("comment author can list and restore an archived comment", async () => {
  seedComment({ archived: true });

  const listResponse = await authenticated(
    request(app).get("/api/tasks/50/comments?archived=true"),
    3,
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.archived, true);
  assert.equal(listResponse.body.comments.length, 1);
  assert.equal(listResponse.body.comments[0].canRestore, true);

  const restoreResponse = await authenticated(
    request(app).patch("/api/tasks/50/comments/70/restore"),
    3,
  );

  assert.equal(restoreResponse.status, 200);
  assert.equal(restoreResponse.body.message, "Yorum geri yüklendi");
  assert.equal(currentComment.archived, false);
  assert.equal(activity[0].action, "YorumGeriYukleme");
});

test("unrelated user cannot restore an archived comment", async () => {
  seedComment({ archived: true });

  const response = await authenticated(
    request(app).patch("/api/tasks/50/comments/70/restore"),
    4,
  );

  assert.equal(response.status, 403);
  assert.match(response.body.error, /geri yükleme yetkiniz/i);
  assert.equal(currentComment.archived, true);
});
