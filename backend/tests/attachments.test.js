const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  after,
  afterEach,
  beforeEach,
  test,
} = require("node:test");

const TEST_STORAGE_ROOT = path.join(
  os.tmpdir(),
  `lawdesk-attachment-tests-${process.pid}`,
);

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "test-secret-".repeat(8);
process.env.AUTH_TOKEN_TTL_HOURS = "8";
process.env.AUTH_COOKIE_NAME = "lawdesk_test_session";
process.env.ATTACHMENT_STORAGE_DIR = TEST_STORAGE_ROOT;

const jwt = require("jsonwebtoken");
const request = require("supertest");

const app = require("../app");
const db = require("../config/db");

const originalQuery = db.query;
const originalWithTransaction = db.withTransaction;

const users = {
  1: {
    kullaniciid: 1,
    adsoyad: "Test Admin",
    email: "admin.test@sirket.com",
    rol: "admin",
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

let currentAttachment;
let taskVisible;
let currentTaskStatus;
let currentTaskArchived;
let activity;

const createStoredPdf = async () => {
  await fs.mkdir(TEST_STORAGE_ROOT, { recursive: true });
  const storedName = "11111111-1111-4111-8111-111111111111.pdf";
  await fs.writeFile(
    path.join(TEST_STORAGE_ROOT, storedName),
    Buffer.from("%PDF-1.7\nLawDesk test attachment\n"),
  );

  currentAttachment = {
    id: 70,
    fileName: "denetim.pdf",
    storedName,
    size: "35",
    mimeType: "application/pdf",
    uploaderId: 3,
    uploaderName: "Görev Üyesi",
    uploadedAt: new Date("2026-08-19T08:00:00.000Z"),
    deleted: false,
  };
};

beforeEach(async () => {
  await fs.rm(TEST_STORAGE_ROOT, { recursive: true, force: true });
  currentAttachment = null;
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
            canManage: Number(params[1]) === 1,
          },
        ],
      };
    }

    if (
      normalized.includes("from ekler e") &&
      normalized.includes("join kullanicilar uploader")
    ) {
      return {
        rows:
          currentAttachment && !currentAttachment.deleted
            ? [currentAttachment]
            : [],
      };
    }

    if (
      normalized.includes('select count(*) as "count"') &&
      normalized.includes("from ekler")
    ) {
      return {
        rows: [
          {
            count:
              currentAttachment && !currentAttachment.deleted ? "1" : "0",
          },
        ],
      };
    }

    if (normalized.includes("insert into ekler")) {
      currentAttachment = {
        id: 71,
        fileName: params[1],
        storedName: params[2],
        size: String(params[3]),
        mimeType: params[4],
        uploaderId: Number(params[5]),
        uploaderName: users[Number(params[5])].adsoyad,
        uploadedAt: new Date("2026-08-19T09:00:00.000Z"),
        deleted: false,
      };

      return { rows: [currentAttachment] };
    }

    if (
      normalized.includes('dosyayolu as "storedname"') &&
      normalized.includes("from ekler")
    ) {
      return {
        rows:
          currentAttachment && !currentAttachment.deleted
            ? [currentAttachment]
            : [],
      };
    }

    if (
      normalized.includes('yukleyenkullaniciid as "uploaderid"') &&
      normalized.includes("from ekler") &&
      normalized.includes("for update")
    ) {
      return {
        rows:
          currentAttachment && !currentAttachment.deleted
            ? [currentAttachment]
            : [],
      };
    }

    if (
      normalized.includes("update ekler") &&
      normalized.includes("set silindimi = true")
    ) {
      if (!currentAttachment || currentAttachment.deleted) {
        return { rowCount: 0, rows: [] };
      }

      currentAttachment.deleted = true;
      return { rowCount: 1, rows: [] };
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

    throw new Error(`Unexpected database query in attachment test: ${sql}`);
  };

  db.withTransaction = async (callback) => callback(db.query);
});

afterEach(async () => {
  await fs.rm(TEST_STORAGE_ROOT, { recursive: true, force: true });
});

after(async () => {
  db.query = originalQuery;
  db.withTransaction = originalWithTransaction;
  await fs.rm(TEST_STORAGE_ROOT, { recursive: true, force: true });
  await db.close();
});

test("attachment routes require authentication", async () => {
  const response = await request(app).get("/api/tasks/50/attachments");

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Giriş yapmanız gerekiyor");
});

test("visible task user can list attachments", async () => {
  await createStoredPdf();

  const response = await authenticated(
    request(app).get("/api/tasks/50/attachments"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.attachments.length, 1);
  assert.equal(response.body.attachments[0].fileName, "denetim.pdf");
  assert.equal(response.body.attachments[0].canDelete, true);
  assert.equal(response.body.canUpload, true);
  assert.equal(response.body.limits.maxFileSizeMb, 25);
});

test("user outside task visibility cannot list attachments", async () => {
  taskVisible = false;

  const response = await authenticated(
    request(app).get("/api/tasks/50/attachments"),
    4,
  );

  assert.equal(response.status, 404);
  assert.equal(response.body.error, "Görev bulunamadı");
});

test("visible user can upload a validated PDF attachment", async () => {
  const response = await authenticated(
    request(app)
      .post("/api/tasks/50/attachments")
      .attach(
        "file",
        Buffer.from("%PDF-1.7\nLawDesk upload test\n"),
        {
          filename: "denetim raporu.pdf",
          contentType: "application/pdf",
        },
      ),
    3,
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.attachment.fileName, "denetim raporu.pdf");
  assert.equal(response.body.attachment.canDelete, true);
  assert.equal(activity[0].action, "EkYukleme");

  const storedFile = await fs.readFile(
    path.join(TEST_STORAGE_ROOT, currentAttachment.storedName),
    "utf8",
  );
  assert.match(storedFile, /^%PDF-/);
});

test("upload rejects content that does not match its extension", async () => {
  const response = await authenticated(
    request(app)
      .post("/api/tasks/50/attachments")
      .attach("file", Buffer.from("MZ executable content"), {
        filename: "zararli.pdf",
        contentType: "application/pdf",
      }),
    3,
  );

  assert.equal(response.status, 400);
  assert.match(response.body.error, /içeriği.*eşleşmiyor/i);
  assert.equal(currentAttachment, null);

  const storedFiles = await fs.readdir(TEST_STORAGE_ROOT);
  assert.deepEqual(storedFiles, []);
});

test("completed task rejects new attachment uploads", async () => {
  currentTaskStatus = "Tamamlandi";

  const response = await authenticated(
    request(app)
      .post("/api/tasks/50/attachments")
      .attach("file", Buffer.from("%PDF-1.7\nclosed\n"), {
        filename: "kapali.pdf",
        contentType: "application/pdf",
      }),
    1,
  );

  assert.equal(response.status, 409);
  assert.match(response.body.error, /tamamlanmış/i);
});

test("visible user can download an attachment", async () => {
  await createStoredPdf();

  const response = await authenticated(
    request(app).get("/api/tasks/50/attachments/70/download"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "application/pdf");
  assert.match(response.headers["content-disposition"], /attachment/i);
  assert.match(response.body.toString("utf8"), /^%PDF-/);
});

test("unrelated user cannot remove another user's attachment", async () => {
  await createStoredPdf();

  const response = await authenticated(
    request(app).delete("/api/tasks/50/attachments/70"),
    4,
  );

  assert.equal(response.status, 403);
  assert.match(response.body.error, /kaldırma yetkiniz/i);
  assert.equal(currentAttachment.deleted, false);
});

test("uploader can soft remove an attachment", async () => {
  await createStoredPdf();

  const response = await authenticated(
    request(app).delete("/api/tasks/50/attachments/70"),
    3,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Ek görevden kaldırıldı");
  assert.equal(currentAttachment.deleted, true);
  assert.equal(activity[0].action, "EkKaldirma");
});
