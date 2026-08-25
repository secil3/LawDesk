const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  after,
  before,
  beforeEach,
  test,
} = require("node:test");

const dotenv = require("dotenv");

dotenv.config();

const integrationDatabaseUrl =
  process.env.INTEGRATION_DATABASE_URL?.trim();

if (!integrationDatabaseUrl) {
  throw new Error(
    "INTEGRATION_DATABASE_URL is required for PostgreSQL integration tests",
  );
}

let parsedDatabaseUrl;

try {
  parsedDatabaseUrl = new URL(integrationDatabaseUrl);
} catch {
  throw new Error("INTEGRATION_DATABASE_URL must be a valid PostgreSQL URL");
}

if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
  throw new Error("INTEGRATION_DATABASE_URL must use postgres:// or postgresql://");
}

const integrationDatabaseName = decodeURIComponent(
  parsedDatabaseUrl.pathname.replace(/^\//, ""),
);

if (!integrationDatabaseName.toLowerCase().endsWith("_test")) {
  throw new Error(
    "Integration database name must end with _test; refusing to reset a non-test database",
  );
}

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = integrationDatabaseUrl;
process.env.AUTH_TOKEN_SECRET = "integration-test-secret-".repeat(4);
process.env.AUTH_TOKEN_TTL_HOURS = "1";
process.env.AUTH_COOKIE_NAME = "lawdesk_integration_session";
process.env.REGISTRATION_RATE_LIMIT_MAX = "1000";
process.env.SMTP_JSON_TRANSPORT = "true";
process.env.SMTP_FROM = "LawDesk Test <lawdesk@integration.test>";
process.env.APP_BASE_URL = "http://localhost:5175";
process.env.ATTACHMENT_STORAGE_DIR = path.join(
  os.tmpdir(),
  `lawdesk-postgresql-attachments-${process.pid}`,
);

const argon2 = require("argon2");
const request = require("supertest");

const db = require("../config/db");
const expressApp = require("../app");
const {
  DEFAULT_MIGRATIONS_DIRECTORY,
  runMigrations,
} = require("../services/migrationService");

const TEST_PASSWORD = "GuvenliEntegrasyonSifresi123!";
const SCHEMA_PATH = path.resolve(
  __dirname,
  "../../database/GYS_Database_Schema_Simple.sql",
);

let passwordHash;
let initialMigrationResult;

const sortedTitles = (response) => {
  return response.body.tasks
    .map((task) => task.title)
    .sort();
};

const loginAs = async (email) => {
  const agent = request.agent(expressApp);
  const response = await agent
    .post("/api/auth/login")
    .send({
      email,
      password: TEST_PASSWORD,
    });

  assert.equal(response.status, 200);
  return { agent, response };
};

const resetSchema = async () => {
  const identityResult = await db.query(
    `SELECT current_database() AS "databaseName"`,
  );

  assert.equal(
    identityResult.rows[0]?.databaseName,
    integrationDatabaseName,
  );

  await db.query(`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.query(`CREATE SCHEMA public`);

  const schemaSql = fs.readFileSync(SCHEMA_PATH, "utf8");
  await db.query(schemaSql);
};

const seedDatabase = async () => {
  await db.query(
    `TRUNCATE TABLE
       aktiviteloglari,
       bildirimler,
       kullaniciaktivasyontokenlari,
       kayit_talepleri,
       ekler,
       yorumgecmisi,
       yorumlar,
       gorevatamagecmisi,
       gorevetiketleri,
       gorevler,
       etiketler,
       gorevtipleri,
       ayarlar,
       grupuyelikleri,
       gruplar,
       kullanicilar
     RESTART IDENTITY CASCADE`,
  );

  await db.query(
    `INSERT INTO kullanicilar
       (adsoyad, email, sifrehash, rol, aktifmi)
     VALUES
       ('Entegrasyon Admin', 'admin.integration@lawdesk.test', $1, 'admin', TRUE),
       ('Uyum Yöneticisi', 'manager.integration@lawdesk.test', $1, 'kullanici', TRUE),
       ('Uyum Üyesi', 'member.integration@lawdesk.test', $1, 'kullanici', TRUE),
       ('Bağımsız Kullanıcı', 'outsider.integration@lawdesk.test', $1, 'kullanici', TRUE),
       ('KVKK Üyesi', 'kvkk.integration@lawdesk.test', $1, 'kullanici', TRUE),
       ('Pasif Kullanıcı', 'passive.integration@lawdesk.test', $1, 'kullanici', FALSE)`,
    [passwordHash],
  );

  await db.query(
    `INSERT INTO gruplar (grupadi, aciklama)
     VALUES
       ('Uyum', 'Entegrasyon testi Uyum grubu'),
       ('KVKK', 'Entegrasyon testi KVKK grubu')`,
  );

  await db.query(
    `INSERT INTO grupuyelikleri (grupid, kullaniciid, gruprolu)
     VALUES
       (1, 2, 'grup_yoneticisi'),
       (1, 3, 'grup_uyesi'),
       (2, 5, 'grup_uyesi')`,
  );

  await db.query(
    `INSERT INTO gorevtipleri
       (tipadi, aciklama, grupid, olusturankullaniciid)
     VALUES
       ('Operasyonel', 'Entegrasyon testi görev tipi', 1, 1),
       ('KVKK Talebi', 'KVKK grubuna yönlenen görev tipi', 2, 1)`,
  );

  await db.query(
    `INSERT INTO gorevler
       (baslik,
        aciklama,
        tipid,
        oncelik,
        durum,
        bitistarihi,
        tamamlanmatarihi,
        atanankullaniciid,
        atanangrupid,
        gorunurluktipi,
        gorunurlukkullaniciid,
        gorunurlukgrupid,
        olusturankullaniciid,
        olusturmatarihi,
        arsivlendimi,
        arsivlenmetarihi,
        arsivleyenkullaniciid)
     VALUES
       ('Admin özel görevi', 'Yalnızca sistem yöneticisine görünür', 1,
        'Orta', 'Yeni Atandi', NOW() + INTERVAL '30 days', NULL,
        NULL, NULL, 'Kisi', 1, NULL, 1, NOW() - INTERVAL '8 days',
        FALSE, NULL, NULL),
       ('Uyum grup görevi', 'Uyum grubuna atanmış açık görev', 1,
        'Yuksek', 'Yeni Atandi', NOW() + INTERVAL '3 days', NULL,
        NULL, 1, 'Grup', NULL, 1, 2, NOW() - INTERVAL '7 days',
        FALSE, NULL, NULL),
       ('Üyeye doğrudan görev', 'Uyum üyesine doğrudan atanmış görev', 1,
        'Orta', 'Yeni Atandi', NULL, NULL,
        3, NULL, 'Kisi', 3, NULL, 1, NOW() - INTERVAL '6 days',
        FALSE, NULL, NULL),
       ('Bağımsız kullanıcı görevi', 'Başka gruplara kapalı görev', 1,
        'Dusuk', 'Yeni Atandi', NOW() + INTERVAL '10 days', NULL,
        NULL, NULL, 'Kisi', 4, NULL, 4, NOW() - INTERVAL '5 days',
        FALSE, NULL, NULL),
       ('Tamamlanan Uyum görevi', 'Üyeden gizlenen tamamlanmış görev', 1,
        'Orta', 'Tamamlandi', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day',
        NULL, 1, 'Grup', NULL, 1, 2, NOW() - INTERVAL '10 days',
        TRUE, NOW() - INTERVAL '1 day', 2),
       ('Geciken Uyum görevi', 'Takip edilmesi gereken gecikmiş görev', 1,
        'Kritik', 'Devam Ediyor', NOW() - INTERVAL '2 days', NULL,
        NULL, 1, 'Grup', NULL, 1, 2, NOW() - INTERVAL '4 days',
        FALSE, NULL, NULL),
       ('Arşivlenen Uyum görevi', 'Yalnızca yetkili arşivinde görünür', 1,
        'Orta', 'Yeni Atandi', NOW() + INTERVAL '20 days', NULL,
        NULL, 1, 'Grup', NULL, 1, 2, NOW() - INTERVAL '12 days',
        TRUE, NOW() - INTERVAL '1 day', 2),
       ('KVKK grup görevi', 'Uyum grubundan gizlenen görev', 1,
        'Yuksek', 'Yeni Atandi', NOW() + INTERVAL '5 days', NULL,
        NULL, 2, 'Grup', NULL, 2, 5, NOW() - INTERVAL '3 days',
        FALSE, NULL, NULL)`,
  );
};

before(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
  });

  await resetSchema();
  initialMigrationResult = await runMigrations();
});

beforeEach(async () => {
  fs.rmSync(process.env.ATTACHMENT_STORAGE_DIR, {
    recursive: true,
    force: true,
  });
  await seedDatabase();
});

after(async () => {
  fs.rmSync(process.env.ATTACHMENT_STORAGE_DIR, {
    recursive: true,
    force: true,
  });
  await db.close();
});

test("integration database uses the current schema and report indexes", async () => {
  const tablesResult = await db.query(
    `SELECT to_regclass('public.kullanicilar') AS "usersTable",
            to_regclass('public.gorevler') AS "tasksTable",
            to_regclass('public.aktiviteloglari') AS "activityTable"`,
  );

  assert.equal(tablesResult.rows[0]?.usersTable, "kullanicilar");
  assert.equal(tablesResult.rows[0]?.tasksTable, "gorevler");
  assert.equal(tablesResult.rows[0]?.activityTable, "aktiviteloglari");

  const indexesResult = await db.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname IN (
         'idx_gorevler_dashboard_risk',
         'idx_gorevler_rapor_olusturma',
         'idx_gorevler_rapor_tamamlanma'
       )
     ORDER BY indexname`,
  );

  assert.deepEqual(
    indexesResult.rows.map((row) => row.indexname),
    [
      "idx_gorevler_dashboard_risk",
      "idx_gorevler_rapor_olusturma",
      "idx_gorevler_rapor_tamamlanma",
    ],
  );
});

test("migration runner tracks every SQL migration and safely skips reruns", async () => {
  const migrationFiles = fs.readdirSync(DEFAULT_MIGRATIONS_DIRECTORY)
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right, "en"));

  assert.deepEqual(initialMigrationResult.applied, migrationFiles);
  assert.deepEqual(initialMigrationResult.skipped, []);

  const trackingResult = await db.query(
    `SELECT migrationadi AS "name", checksum
     FROM schema_migrations
     ORDER BY migrationadi`,
  );

  assert.deepEqual(
    trackingResult.rows.map((migration) => migration.name),
    migrationFiles,
  );
  assert.ok(
    trackingResult.rows.every((migration) =>
      /^[a-f0-9]{64}$/.test(migration.checksum.trim()),
    ),
  );

  const rerun = await runMigrations();
  assert.deepEqual(rerun.applied, []);
  assert.deepEqual(rerun.skipped, migrationFiles);
});

test("real PostgreSQL login creates a session with normalized memberships", async () => {
  const { agent, response } = await loginAs(
    "manager.integration@lawdesk.test",
  );

  assert.match(
    response.headers["set-cookie"]?.[0] || "",
    /lawdesk_integration_session=/,
  );
  assert.match(
    response.headers["set-cookie"]?.[0] || "",
    /HttpOnly/i,
  );
  assert.deepEqual(response.body.user.groups, [
    {
      grupId: 1,
      grupAdi: "Uyum",
      grupRolu: "grup_yoneticisi",
    },
  ]);

  const meResponse = await agent.get("/api/auth/me");
  assert.equal(meResponse.status, 200);
  assert.equal(meResponse.body.user.email, "manager.integration@lawdesk.test");
  assert.equal(
    meResponse.body.user.groups[0]?.grupRolu,
    "grup_yoneticisi",
  );
});

test("passive user cannot log in through the real database query", async () => {
  const response = await request(expressApp)
    .post("/api/auth/login")
    .send({
      email: "passive.integration@lawdesk.test",
      password: TEST_PASSWORD,
    });

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "E-posta veya şifre hatalı");
});

test("public registration persists one pending request and notifies active admins", async () => {
  const expectedBody = {
    message:
      "Başvurunuz alınmıştır. İnceleme sonucunda e-posta gönderilecektir.",
  };
  const payload = {
    adSoyad: "  PostgreSQL   Adayı  ",
    email: "ADAY.REGISTRATION@LAWDesk.Test",
  };

  const firstResponse = await request(expressApp)
    .post("/api/registration-requests")
    .send(payload);

  assert.equal(firstResponse.status, 202);
  assert.deepEqual(firstResponse.body, expectedBody);

  const requestResult = await db.query(
    `SELECT kayittalepid AS "id",
            adsoyad AS "name",
            email,
            durum AS "status"
     FROM kayit_talepleri`,
  );
  assert.deepEqual(requestResult.rows, [
    {
      id: 1,
      name: "PostgreSQL Adayı",
      email: "aday.registration@lawdesk.test",
      status: "Bekliyor",
    },
  ]);

  const notificationResult = await db.query(
    `SELECT kullaniciid AS "userId",
            kayittalepid AS "registrationRequestId",
            bildirimtipi AS "type",
            okundumu AS "read"
     FROM bildirimler`,
  );
  assert.deepEqual(notificationResult.rows, [
    {
      userId: 1,
      registrationRequestId: 1,
      type: "KayitTalebi",
      read: false,
    },
  ]);

  const duplicateResponse = await request(expressApp)
    .post("/api/registration-requests")
    .send(payload);
  const invalidResponse = await request(expressApp)
    .post("/api/registration-requests")
    .send({ adSoyad: "", email: "geçersiz" });

  assert.equal(duplicateResponse.status, 202);
  assert.deepEqual(duplicateResponse.body, expectedBody);
  assert.equal(invalidResponse.status, 202);
  assert.deepEqual(invalidResponse.body, expectedBody);

  const countsResult = await db.query(
    `SELECT (SELECT COUNT(*)::int FROM kayit_talepleri) AS "requests",
            (SELECT COUNT(*)::int FROM bildirimler) AS "notifications"`,
  );
  assert.deepEqual(countsResult.rows[0], {
    requests: 1,
    notifications: 1,
  });
});

test("admin approval creates a pending account and one-use activation enables login", async () => {
  const email = "approved.registration@lawdesk.test";
  const registrationResponse = await request(expressApp)
    .post("/api/registration-requests")
    .send({
      adSoyad: "Onaylanan Aday",
      email,
    });
  assert.equal(registrationResponse.status, 202);

  const requestResult = await db.query(
    `SELECT kayittalepid AS "id"
     FROM kayit_talepleri
     WHERE email = $1`,
    [email],
  );
  const registrationRequestId = Number(requestResult.rows[0]?.id);
  assert.ok(registrationRequestId > 0);

  const { agent: adminAgent } = await loginAs(
    "admin.integration@lawdesk.test",
  );
  const approvalResponse = await adminAgent
    .post(
      `/api/admin/registration-requests/${registrationRequestId}/approve`,
    )
    .send({
      systemRole: "kullanici",
      memberships: [
        { grupId: 1, grupRolu: "grup_uyesi" },
      ],
    });

  assert.equal(approvalResponse.status, 201);
  assert.match(approvalResponse.body.message, /aktivasyon e-postası gönderildi/);

  const pendingAccountResult = await db.query(
    `SELECT request.durum AS "requestStatus",
            request.aktivasyonepostagonderimtarihi AS "emailSentAt",
            user_account.kullaniciid AS "userId",
            user_account.sifrehash AS "passwordHash",
            user_account.aktifmi AS "active",
            user_account.aktivasyonbekliyormu AS "activationPending",
            membership.gruprolu AS "groupRole",
            token.tokenid AS "tokenId",
            token.tokenhash AS "tokenHash",
            EXTRACT(EPOCH FROM (token.sonkullanmatarihi - NOW())) / 3600
              AS "hoursRemaining"
     FROM kayit_talepleri request
     JOIN kullanicilar user_account
       ON user_account.kullaniciid = request.olusturulankullaniciid
     JOIN grupuyelikleri membership
       ON membership.kullaniciid = user_account.kullaniciid
      AND membership.grupid = 1
     JOIN kullaniciaktivasyontokenlari token
       ON token.kayittalepid = request.kayittalepid
     WHERE request.kayittalepid = $1`,
    [registrationRequestId],
  );
  const pendingAccount = pendingAccountResult.rows[0];

  assert.equal(pendingAccount.requestStatus, "Onaylandi");
  assert.ok(pendingAccount.emailSentAt);
  assert.equal(pendingAccount.passwordHash, null);
  assert.equal(pendingAccount.active, false);
  assert.equal(pendingAccount.activationPending, true);
  assert.equal(pendingAccount.groupRole, "grup_uyesi");
  assert.match(pendingAccount.tokenHash.trim(), /^[a-f0-9]{64}$/);
  assert.ok(Number(pendingAccount.hoursRemaining) > 23.9);
  assert.ok(Number(pendingAccount.hoursRemaining) <= 24);

  const activationToken = "B".repeat(43);
  const activationTokenHash = crypto
    .createHash("sha256")
    .update(activationToken, "utf8")
    .digest("hex");
  await db.query(
    `UPDATE kullaniciaktivasyontokenlari
     SET tokenhash = $2
     WHERE tokenid = $1`,
    [pendingAccount.tokenId, activationTokenHash],
  );

  const validationResponse = await request(expressApp)
    .post("/api/registration-requests/activation/validate")
    .send({ token: activationToken });
  assert.equal(validationResponse.status, 200);
  assert.equal(validationResponse.body.valid, true);
  assert.equal(validationResponse.body.email, "a***@lawdesk.test");

  const activatedPassword = "YeniGuvenliPostgreSQLParolasi123!";
  const activationResponse = await request(expressApp)
    .post("/api/registration-requests/activation/complete")
    .send({
      token: activationToken,
      password: activatedPassword,
      passwordConfirmation: activatedPassword,
    });
  assert.equal(activationResponse.status, 200);

  const activatedResult = await db.query(
    `SELECT user_account.sifrehash AS "passwordHash",
            user_account.aktifmi AS "active",
            user_account.aktivasyonbekliyormu AS "activationPending",
            user_account.emaildogrulamatarihi AS "emailVerifiedAt",
            token.kullanilmatarihi AS "usedAt"
     FROM kullanicilar user_account
     JOIN kullaniciaktivasyontokenlari token
       ON token.kullaniciid = user_account.kullaniciid
     WHERE user_account.kullaniciid = $1`,
    [pendingAccount.userId],
  );
  const activated = activatedResult.rows[0];
  assert.equal(activated.active, true);
  assert.equal(activated.activationPending, false);
  assert.ok(activated.emailVerifiedAt);
  assert.ok(activated.usedAt);
  assert.match(activated.passwordHash, /^\$argon2id\$/);
  assert.equal(
    await argon2.verify(activated.passwordHash, activatedPassword),
    true,
  );

  const reusedResponse = await request(expressApp)
    .post("/api/registration-requests/activation/complete")
    .send({
      token: activationToken,
      password: activatedPassword,
      passwordConfirmation: activatedPassword,
    });
  assert.equal(reusedResponse.status, 400);

  const loginResponse = await request(expressApp)
    .post("/api/auth/login")
    .send({ email, password: activatedPassword });
  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.body.user.email, email);
});

test("task lists enforce member manager and system visibility in PostgreSQL", async () => {
  const { agent: memberAgent } = await loginAs(
    "member.integration@lawdesk.test",
  );
  const { agent: managerAgent } = await loginAs(
    "manager.integration@lawdesk.test",
  );
  const { agent: adminAgent } = await loginAs(
    "admin.integration@lawdesk.test",
  );

  const memberTasks = await memberAgent.get("/api/tasks");
  assert.equal(memberTasks.status, 200);
  assert.deepEqual(sortedTitles(memberTasks), [
    "Geciken Uyum görevi",
    "Uyum grup görevi",
    "Üyeye doğrudan görev",
  ].sort());

  const managerTasks = await managerAgent.get("/api/tasks");
  assert.equal(managerTasks.status, 200);
  assert.deepEqual(sortedTitles(managerTasks), [
    "Geciken Uyum görevi",
    "Uyum grup görevi",
    "Üyeye doğrudan görev",
  ].sort());

  const managerArchive = await managerAgent.get(
    "/api/tasks?archived=true",
  );
  assert.equal(managerArchive.status, 200);
  assert.deepEqual(sortedTitles(managerArchive), [
    "Arşivlenen Uyum görevi",
    "Tamamlanan Uyum görevi",
  ]);

  const adminTasks = await adminAgent.get("/api/tasks");
  assert.equal(adminTasks.status, 200);
  assert.equal(adminTasks.body.tasks.length, 6);
  assert.ok(
    adminTasks.body.tasks.some((task) => task.title === "KVKK grup görevi"),
  );
});

test("task creation without a direct assignee routes to the type group", async () => {
  const { agent: outsiderAgent } = await loginAs(
    "outsider.integration@lawdesk.test",
  );

  const response = await outsiderAgent
    .post("/api/tasks")
    .send({
      baslik: "Otomatik grup yönlendirme görevi",
      aciklama: "Görev tipi grubuna otomatik atanır",
      tipId: 1,
      oncelik: "Orta",
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.task.assignedUserId, null);
  assert.equal(response.body.task.assignedGroupId, 1);
  assert.equal(response.body.task.assignedGroupName, "Uyum");

  const persistedResult = await db.query(
    `SELECT atanankullaniciid AS "assignedUserId",
            atanangrupid AS "assignedGroupId",
            gorunurluktipi AS "visibilityType",
            gorunurlukgrupid AS "visibilityGroupId"
     FROM gorevler
     WHERE gorevid = $1`,
    [response.body.task.id],
  );

  assert.deepEqual(persistedResult.rows[0], {
    assignedUserId: null,
    assignedGroupId: 1,
    visibilityType: "Grup",
    visibilityGroupId: 1,
  });
});

test("task creation commits task assignment history and activity atomically", async () => {
  const { agent: managerAgent } = await loginAs(
    "manager.integration@lawdesk.test",
  );

  const response = await managerAgent
    .post("/api/tasks")
    .send({
      baslik: "Transaction entegrasyon görevi",
      aciklama: "Gerçek PostgreSQL transaction kontrolü",
      tipId: 1,
      oncelik: "Yuksek",
      bitisTarihi: new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      atananKullaniciId: 3,
    });

  assert.equal(response.status, 201);
  const taskId = Number(response.body.task?.id);
  assert.ok(Number.isInteger(taskId) && taskId > 0);

  const persistedResult = await db.query(
    `SELECT g.atanankullaniciid AS "assignedUserId",
            g.gorunurlukkullaniciid AS "visibleUserId",
            g.olusturankullaniciid AS "creatorId",
            assignment.atayankullaniciid AS "assignedById",
            activity.kullaniciid AS "activityActorId",
            activity.islem AS "activityAction"
     FROM gorevler g
     JOIN gorevatamagecmisi assignment
       ON assignment.gorevid = g.gorevid
     JOIN aktiviteloglari activity
       ON activity.gorevid = g.gorevid
      AND activity.islem = 'GorevOlusturma'
     WHERE g.gorevid = $1`,
    [taskId],
  );

  assert.deepEqual(persistedResult.rows[0], {
    assignedUserId: 3,
    visibleUserId: 3,
    creatorId: 2,
    assignedById: 2,
    activityActorId: 2,
    activityAction: "GorevOlusturma",
  });

  const { agent: memberAgent } = await loginAs(
    "member.integration@lawdesk.test",
  );
  const detailResponse = await memberAgent.get(`/api/tasks/${taskId}`);
  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.task.title, "Transaction entegrasyon görevi");
});

test("task type changes and reassignment preserve responsible group routing", async () => {
  const { agent: managerAgent } = await loginAs(
    "manager.integration@lawdesk.test",
  );

  const createResponse = await managerAgent
    .post("/api/tasks")
    .send({
      baslik: "Grup yönlendirme bütünlüğü",
      tipId: 1,
      atananKullaniciId: 3,
    });

  assert.equal(createResponse.status, 201);
  const taskId = Number(createResponse.body.task.id);

  const typeChangeResponse = await managerAgent
    .patch(`/api/tasks/${taskId}`)
    .send({ tipId: 2 });

  assert.equal(typeChangeResponse.status, 200);
  assert.equal(typeChangeResponse.body.task.typeName, "KVKK Talebi");
  assert.equal(typeChangeResponse.body.task.assignedUserId, null);
  assert.equal(typeChangeResponse.body.task.assignedGroupId, 2);
  assert.equal(typeChangeResponse.body.task.assignedGroupName, "KVKK");

  const { agent: adminAgent } = await loginAs(
    "admin.integration@lawdesk.test",
  );
  const invalidUserResponse = await adminAgent
    .patch(`/api/tasks/${taskId}/assignment`)
    .send({ atananKullaniciId: 3 });

  assert.equal(invalidUserResponse.status, 400);
  assert.match(invalidUserResponse.body.error, /sorumlu grubunda/i);

  const directUserResponse = await adminAgent
    .patch(`/api/tasks/${taskId}/assignment`)
    .send({ atananKullaniciId: 5 });

  assert.equal(directUserResponse.status, 200);
  assert.equal(directUserResponse.body.assignment.assignedUserId, 5);
  assert.equal(directUserResponse.body.assignment.assignedGroupId, null);

  const automaticGroupResponse = await adminAgent
    .patch(`/api/tasks/${taskId}/assignment`)
    .send({});

  assert.equal(automaticGroupResponse.status, 200);
  assert.equal(automaticGroupResponse.body.assignment.assignedUserId, null);
  assert.equal(automaticGroupResponse.body.assignment.assignedGroupId, 2);

  const persistedResult = await db.query(
    `SELECT tipid AS "typeId",
            atanankullaniciid AS "assignedUserId",
            atanangrupid AS "assignedGroupId",
            gorunurluktipi AS "visibilityType",
            gorunurlukgrupid AS "visibilityGroupId"
     FROM gorevler
     WHERE gorevid = $1`,
    [taskId],
  );

  assert.deepEqual(persistedResult.rows[0], {
    typeId: 2,
    assignedUserId: null,
    assignedGroupId: 2,
    visibilityType: "Grup",
    visibilityGroupId: 2,
  });
});

test("comments persist edit history and notify the task creator", async () => {
  const { agent: memberAgent } = await loginAs(
    "member.integration@lawdesk.test",
  );
  const createResponse = await memberAgent
    .post("/api/tasks/3/comments")
    .send({ yorumMetni: "  PostgreSQL yorumu oluşturuldu.  " });

  assert.equal(createResponse.status, 201);
  assert.equal(
    createResponse.body.comment.text,
    "PostgreSQL yorumu oluşturuldu.",
  );
  assert.equal(createResponse.body.comment.version, 1);
  const commentId = Number(createResponse.body.comment.id);

  const updateResponse = await memberAgent
    .patch(`/api/tasks/3/comments/${commentId}`)
    .send({
      yorumMetni: "PostgreSQL yorumu düzenlendi.",
      version: 1,
    });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body.comment.version, 2);
  assert.equal(
    updateResponse.body.comment.text,
    "PostgreSQL yorumu düzenlendi.",
  );

  const historyResponse = await memberAgent.get(
    `/api/tasks/3/comments/${commentId}/history`,
  );
  assert.equal(historyResponse.status, 200);
  assert.deepEqual(
    historyResponse.body.history.map((entry) => ({
      text: entry.text,
      version: entry.version,
      editorId: entry.editorId,
    })),
    [
      {
        text: "PostgreSQL yorumu oluşturuldu.",
        version: 1,
        editorId: 3,
      },
    ],
  );

  const persistenceResult = await db.query(
    `SELECT comment.yorummetni AS "text",
            comment.versiyon AS "version",
            comment.duzenlendimi AS "edited",
            history.oncekimetin AS "previousText",
            history.oncekiversiyon AS "previousVersion"
     FROM yorumlar comment
     JOIN yorumgecmisi history
       ON history.yorumid = comment.yorumid
     WHERE comment.yorumid = $1`,
    [commentId],
  );
  assert.deepEqual(persistenceResult.rows[0], {
    text: "PostgreSQL yorumu düzenlendi.",
    version: 2,
    edited: true,
    previousText: "PostgreSQL yorumu oluşturuldu.",
    previousVersion: 1,
  });

  const { agent: adminAgent } = await loginAs(
    "admin.integration@lawdesk.test",
  );
  const notificationsResponse = await adminAgent.get(
    "/api/notifications?unread=true",
  );
  assert.equal(notificationsResponse.status, 200);
  assert.ok(
    notificationsResponse.body.notifications.some(
      (notification) =>
        notification.taskId === 3 &&
        notification.type === "Guncelleme" &&
        notification.read === false,
    ),
  );
});

test("attachment upload, persistence, download, archive and restore use PostgreSQL", async () => {
  const { agent: memberAgent } = await loginAs(
    "member.integration@lawdesk.test",
  );
  const pdfBytes = Buffer.from(
    "%PDF-1.7\nLawDesk PostgreSQL attachment integration test\n",
  );

  const uploadResponse = await memberAgent
    .post("/api/tasks/3/attachments")
    .attach("file", pdfBytes, {
      filename: "postgresql-kanit.pdf",
      contentType: "application/pdf",
    });

  assert.equal(uploadResponse.status, 201);
  assert.equal(
    uploadResponse.body.attachment.fileName,
    "postgresql-kanit.pdf",
  );
  const attachmentId = Number(uploadResponse.body.attachment.id);

  const persistenceResult = await db.query(
    `SELECT dosyaadi AS "fileName",
            dosyayolu AS "storedName",
            dosyaverisi AS "fileBytes",
            dosyaboyutubyte AS "size",
            silindimi AS "removed"
     FROM ekler
     WHERE ekid = $1`,
    [attachmentId],
  );
  const persisted = persistenceResult.rows[0];
  assert.equal(persisted.fileName, "postgresql-kanit.pdf");
  assert.deepEqual(persisted.fileBytes, pdfBytes);
  assert.equal(Number(persisted.size), pdfBytes.length);
  assert.equal(persisted.removed, false);
  assert.equal(
    fs.existsSync(
      path.join(process.env.ATTACHMENT_STORAGE_DIR, persisted.storedName),
    ),
    true,
  );

  const downloadResponse = await memberAgent.get(
    `/api/tasks/3/attachments/${attachmentId}/download`,
  );
  assert.equal(downloadResponse.status, 200);
  assert.deepEqual(downloadResponse.body, pdfBytes);

  const removeResponse = await memberAgent.delete(
    `/api/tasks/3/attachments/${attachmentId}`,
  );
  assert.equal(removeResponse.status, 200);

  const removedDownload = await memberAgent.get(
    `/api/tasks/3/attachments/${attachmentId}/download`,
  );
  assert.equal(removedDownload.status, 404);

  const restoreResponse = await memberAgent.patch(
    `/api/tasks/3/attachments/${attachmentId}/restore`,
  );
  assert.equal(restoreResponse.status, 200);

  const restoredResult = await db.query(
    `SELECT silindimi AS "removed",
            silinmetarihi AS "removedAt",
            silenkullaniciid AS "removedById"
     FROM ekler
     WHERE ekid = $1`,
    [attachmentId],
  );
  assert.deepEqual(restoredResult.rows[0], {
    removed: false,
    removedAt: null,
    removedById: null,
  });
});

test("global tags are assigned, filtered and archived without losing task history", async () => {
  const { agent: adminAgent } = await loginAs(
    "admin.integration@lawdesk.test",
  );
  const createResponse = await adminAgent
    .post("/api/tasks/tags")
    .send({ etiketAdi: "  Acil   İnceleme  " });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.tag.name, "Acil İnceleme");
  const tagId = Number(createResponse.body.tag.id);

  const { agent: managerAgent } = await loginAs(
    "manager.integration@lawdesk.test",
  );
  const assignmentResponse = await managerAgent
    .put("/api/tasks/2/tags")
    .send({ etiketIds: [tagId] });

  assert.equal(assignmentResponse.status, 200);
  assert.deepEqual(
    assignmentResponse.body.tags.map((tag) => tag.id),
    [tagId],
  );

  const filteredResponse = await managerAgent.get(
    `/api/tasks?tagId=${tagId}`,
  );
  assert.equal(filteredResponse.status, 200);
  assert.deepEqual(
    filteredResponse.body.tasks.map((task) => Number(task.id)),
    [2],
  );

  const archiveResponse = await adminAgent.delete(
    `/api/tasks/tags/${tagId}`,
  );
  assert.equal(archiveResponse.status, 200);

  const taskTagsResponse = await managerAgent.get("/api/tasks/2/tags");
  assert.equal(taskTagsResponse.status, 200);
  assert.deepEqual(taskTagsResponse.body.tags, [
    { id: tagId, name: "Acil İnceleme", active: false },
  ]);

  const relationResult = await db.query(
    `SELECT COUNT(*)::int AS "count"
     FROM gorevetiketleri
     WHERE gorevid = 2
       AND etiketid = $1`,
    [tagId],
  );
  assert.equal(relationResult.rows[0]?.count, 1);
});

test("subtasks inherit parent routing and PostgreSQL prevents a second level", async () => {
  const { agent: managerAgent } = await loginAs(
    "manager.integration@lawdesk.test",
  );
  const createResponse = await managerAgent
    .post("/api/tasks/2/subtasks")
    .send({
      baslik: "PostgreSQL alt görevi",
      aciklama: "Ana görevin atama ve görünürlüğünü devralır",
      oncelik: "Yuksek",
      bitisTarihi: new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.subtask.parentTaskId, 2);
  assert.equal(createResponse.body.subtask.assignedGroupId, 1);
  const subtaskId = Number(createResponse.body.subtask.id);

  const persistenceResult = await db.query(
    `SELECT child.ustgorevid AS "parentTaskId",
            child.atanankullaniciid AS "assignedUserId",
            child.atanangrupid AS "assignedGroupId",
            child.gorunurluktipi AS "visibilityType",
            child.gorunurlukgrupid AS "visibilityGroupId",
            assignment.atanangrupid AS "historyGroupId",
            activity.islem AS "activityAction"
     FROM gorevler child
     JOIN gorevatamagecmisi assignment
       ON assignment.gorevid = child.gorevid
     JOIN aktiviteloglari activity
       ON activity.gorevid = child.gorevid
      AND activity.islem = 'AltGorevOlusturma'
     WHERE child.gorevid = $1`,
    [subtaskId],
  );
  assert.deepEqual(persistenceResult.rows[0], {
    parentTaskId: 2,
    assignedUserId: null,
    assignedGroupId: 1,
    visibilityType: "Grup",
    visibilityGroupId: 1,
    historyGroupId: 1,
    activityAction: "AltGorevOlusturma",
  });

  const { agent: memberAgent } = await loginAs(
    "member.integration@lawdesk.test",
  );
  const listResponse = await memberAgent.get("/api/tasks/2/subtasks");
  assert.equal(listResponse.status, 200);
  assert.ok(
    listResponse.body.subtasks.some(
      (subtask) => Number(subtask.id) === subtaskId,
    ),
  );

  const nestedResponse = await managerAgent
    .post(`/api/tasks/${subtaskId}/subtasks`)
    .send({ baslik: "İkinci seviye alt görev" });
  assert.equal(nestedResponse.status, 409);
  assert.match(nestedResponse.body.error, /yeni bir görev katmanı oluşturulamaz/);
});

test("notification unread and ownership lifecycle is enforced in PostgreSQL", async () => {
  const { agent: managerAgent } = await loginAs(
    "manager.integration@lawdesk.test",
  );
  const assignmentResponse = await managerAgent
    .patch("/api/tasks/2/assignment")
    .send({ atananKullaniciId: 3 });
  assert.equal(assignmentResponse.status, 200);

  const { agent: memberAgent } = await loginAs(
    "member.integration@lawdesk.test",
  );
  const unreadBefore = await memberAgent.get(
    "/api/notifications/unread-count",
  );
  assert.equal(unreadBefore.status, 200);
  assert.equal(unreadBefore.body.unreadCount, 1);

  const listResponse = await memberAgent.get(
    "/api/notifications?unread=true",
  );
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.notifications.length, 1);
  const notification = listResponse.body.notifications[0];
  assert.equal(notification.taskId, 2);
  assert.equal(notification.type, "Atama");
  assert.equal(notification.read, false);

  const { agent: outsiderAgent } = await loginAs(
    "outsider.integration@lawdesk.test",
  );
  const unauthorizedRead = await outsiderAgent.patch(
    `/api/notifications/${notification.id}/read`,
  );
  assert.equal(unauthorizedRead.status, 404);

  const readResponse = await memberAgent.patch(
    `/api/notifications/${notification.id}/read`,
  );
  assert.equal(readResponse.status, 200);
  assert.equal(readResponse.body.notification.read, true);

  const unreadAfter = await memberAgent.get(
    "/api/notifications/unread-count",
  );
  assert.equal(unreadAfter.status, 200);
  assert.equal(unreadAfter.body.unreadCount, 0);
});

test("terminal task status is atomically archived and restore reopens it", async () => {
  const { agent } = await loginAs("manager.integration@lawdesk.test");

  const cancelResponse = await agent
    .patch("/api/tasks/2/status")
    .send({
      durum: "Iptal Edildi",
      iptalNedeni: "İhtiyaç sahibi talebi geri çekti.",
    });

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelResponse.body.task.status, "Iptal Edildi");
  assert.equal(cancelResponse.body.task.archived, true);
  assert.equal(
    cancelResponse.body.task.cancellationReason,
    "İhtiyaç sahibi talebi geri çekti.",
  );

  const archivedResult = await db.query(
    `SELECT durum AS "status",
            iptalnedeni AS "cancellationReason",
            arsivlendimi AS "archived",
            arsivlenmetarihi AS "archivedAt"
     FROM gorevler
     WHERE gorevid = 2`,
  );
  assert.equal(archivedResult.rows[0]?.status, "Iptal Edildi");
  assert.equal(archivedResult.rows[0]?.archived, true);
  assert.ok(archivedResult.rows[0]?.archivedAt);
  assert.equal(
    archivedResult.rows[0]?.cancellationReason,
    "İhtiyaç sahibi talebi geri çekti.",
  );

  const activeList = await agent.get("/api/tasks");
  assert.equal(activeList.status, 200);
  assert.ok(
    !activeList.body.tasks.some((task) => Number(task.id) === 2),
  );

  const archiveList = await agent.get("/api/tasks?archived=true");
  assert.equal(archiveList.status, 200);
  const archivedTask = archiveList.body.tasks.find(
    (task) => Number(task.id) === 2,
  );
  assert.equal(archivedTask?.status, "Iptal Edildi");
  assert.equal(
    archivedTask?.cancellationReason,
    "İhtiyaç sahibi talebi geri çekti.",
  );

  const restoreResponse = await agent.patch("/api/tasks/2/restore");
  assert.equal(restoreResponse.status, 200);
  assert.equal(restoreResponse.body.task.status, "Devam Ediyor");
  assert.equal(restoreResponse.body.task.archived, false);
  assert.equal(restoreResponse.body.task.cancellationReason, null);

  const restoredResult = await db.query(
    `SELECT durum AS "status",
            iptalnedeni AS "cancellationReason",
            arsivlendimi AS "archived"
     FROM gorevler
     WHERE gorevid = 2`,
  );
  assert.equal(restoredResult.rows[0]?.status, "Devam Ediyor");
  assert.equal(restoredResult.rows[0]?.cancellationReason, null);
  assert.equal(restoredResult.rows[0]?.archived, false);
});

test("dashboard metrics execute real scoped SQL for member and manager", async () => {
  const { agent: memberAgent } = await loginAs(
    "member.integration@lawdesk.test",
  );
  const { agent: managerAgent } = await loginAs(
    "manager.integration@lawdesk.test",
  );

  const memberResponse = await memberAgent.get(
    "/api/tasks/dashboard-summary?period=all",
  );
  assert.equal(memberResponse.status, 200);
  assert.equal(memberResponse.body.totalTasks, 3);
  assert.equal(memberResponse.body.openTasks, 3);
  assert.equal(memberResponse.body.archivedTasks, 0);
  assert.equal(memberResponse.body.canViewArchive, false);
  assert.equal(memberResponse.body.groupCount, 1);
  assert.deepEqual(memberResponse.body.riskCounts, {
    overdue: 1,
    dueSoon: 1,
    withoutDueDate: 1,
  });

  const managerResponse = await managerAgent.get(
    "/api/tasks/dashboard-summary?period=all",
  );
  assert.equal(managerResponse.status, 200);
  assert.equal(managerResponse.body.totalTasks, 5);
  assert.equal(managerResponse.body.activeTasks, 3);
  assert.equal(managerResponse.body.archivedTasks, 2);
  assert.equal(managerResponse.body.openTasks, 3);
  assert.equal(managerResponse.body.closedTasks, 1);
  assert.equal(managerResponse.body.canViewArchive, true);
  assert.equal(managerResponse.body.statusCounts.Tamamlandi, 1);
});

test("dashboard CSV export uses real scoped aggregates", async () => {
  const { agent: memberAgent } = await loginAs(
    "member.integration@lawdesk.test",
  );

  const response = await memberAgent.get(
    "/api/tasks/dashboard-report/export?period=all",
  );

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /^text\/csv; charset=utf-8/);
  assert.match(
    response.headers["content-disposition"],
    /lawdesk-gorev-raporu-all-\d{4}-\d{2}-\d{2}\.csv/,
  );
  assert.equal(response.text.charCodeAt(0), 0xfeff);
  assert.ok(
    response.text.includes(
      '"Özet";"Toplam görünür görev";"3";""',
    ),
  );
  assert.ok(!response.text.includes('"Özet";"Arşivlenmiş görev"'));
});
