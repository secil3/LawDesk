const assert = require("node:assert/strict");
const fs = require("node:fs");
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

const argon2 = require("argon2");
const request = require("supertest");

const db = require("../config/db");
const expressApp = require("../app");

const TEST_PASSWORD = "GuvenliEntegrasyonSifresi123!";
const SCHEMA_PATH = path.resolve(
  __dirname,
  "../../database/GYS_Database_Schema_Simple.sql",
);

let passwordHash;

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
       ('Operasyonel', 'Entegrasyon testi görev tipi', 1, 1)`,
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
});

beforeEach(async () => {
  await seedDatabase();
});

after(async () => {
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
