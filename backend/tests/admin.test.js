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
const originalWithTransaction = db.withTransaction;
const adminEmail = "admin.test@sirket.com";
const testPassword = "GuvenliTestSifresi123!";
let activityActions;
let recorded;

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
  activityActions = [];
  recorded = {
    createdGroupParams: null,
    updatedGroupParams: null,
    deletedMembershipUserId: null,
    insertedMemberships: [],
  };

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
            adSoyad: "Örnek Kullanıcı",
            email: "ornek@sirket.com",
            silindiMi: true,
          },
        ],
      };
    }

    if (t.includes("set silindimi = false")) {
      return {
        rowCount: 1,
        rows: [
          {
            id: params[0],
            adSoyad: "Örnek Kullanıcı",
            email: "ornek@sirket.com",
            rol: "kullanici",
            aktifMi: false,
          },
        ],
      };
    }

    if (t.includes("insert into aktiviteloglari")) {
      activityActions.push(params[1]);
      return { rows: [] };
    }

    if (t.includes("insert into gruplar")) {
      recorded.createdGroupParams = params;
      return {
        rows: [
          {
            id: 3,
            name: params[0],
            description: params[1],
          },
        ],
      };
    }

    if (
      t.includes("from gruplar") &&
      t.includes("lower(grupadi)")
    ) {
      return { rows: [] };
    }

    if (
      t.includes("from gruplar") &&
      t.includes("where grupid = $1") &&
      t.includes("for update")
    ) {
      return {
        rows: [
          {
            id: Number(params[0]),
            name: "Uyum",
            description: "Uyum ekibi",
          },
        ],
      };
    }

    if (
      t.startsWith("update gruplar") ||
      t.includes("set grupadi = $1")
    ) {
      recorded.updatedGroupParams = params;
      return {
        rowCount: 1,
        rows: [
          {
            id: Number(params[2]),
            name: params[0],
            description: params[1],
          },
        ],
      };
    }

    if (
      t.includes("from kullanicilar") &&
      t.includes('adsoyad as "adsoyad"') &&
      t.includes("for update")
    ) {
      return {
        rows: [
          {
            id: Number(params[0]),
            adSoyad: "Örnek Kullanıcı",
            email: "ornek@sirket.com",
            rol: "kullanici",
          },
        ],
      };
    }

    if (
      t.includes("from grupuyelikleri gu") &&
      t.includes("order by gu.grupid")
    ) {
      return {
        rows: [
          {
            grupId: 1,
            grupAdi: "Uyum",
            grupRolu: "grup_uyesi",
          },
        ],
      };
    }

    if (
      t.includes("from gruplar") &&
      t.includes("where grupid = any")
    ) {
      return {
        rows: params[0].map((groupId) => ({
          grupId: groupId,
          grupAdi: Number(groupId) === 1 ? "Uyum" : "KVKK",
        })),
      };
    }

    if (t.startsWith("delete from grupuyelikleri")) {
      recorded.deletedMembershipUserId = params[0];
      return { rowCount: 1, rows: [] };
    }

    if (t.includes("insert into grupuyelikleri")) {
      recorded.insertedMemberships.push(params);
      return { rowCount: 1, rows: [] };
    }

    if (
      t.includes("from kullanicilar k") &&
      t.includes("k.silindimi = $1::boolean")
    ) {
      return {
        rows: [
          {
            id: 2,
            adSoyad: params[0]
              ? "Arşivdeki Kullanıcı"
              : "Aktif Kullanıcı",
            email: params[0]
              ? "arsiv@sirket.com"
              : "aktif@sirket.com",
            rol: "kullanici",
            aktifMi: false,
            archivedAt: params[0]
              ? new Date("2026-08-13T10:00:00.000Z")
              : null,
            groups: [],
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
            memberCount: 2,
            managerCount: 1,
          },
          {
            id: 1,
            name: "Uyum",
            description: "Uyum ekibi",
            memberCount: 3,
            managerCount: 1,
          },
        ],
      };
    }

    return {
      rows: [],
    };
  };

  db.withTransaction = async (callback) => callback(db.query);
});

after(async () => {
  db.query = originalQuery;
  db.withTransaction = originalWithTransaction;
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
    assert.deepEqual(activityActions, ["KullaniciArsivleme"]);
  },
);

test(
  "admin can list archived users",
  async () => {
    const token = createAdminToken();

    const response = await request(app)
      .get("/api/admin/users?archived=true")
      .set(
        "Cookie",
        `${process.env.AUTH_COOKIE_NAME}=${token}`,
      );

    assert.equal(response.status, 200);
    assert.equal(response.body.users.length, 1);
    assert.equal(response.body.users[0].adSoyad, "Arşivdeki Kullanıcı");
    assert.ok(response.body.users[0].archivedAt);
  },
);

test(
  "admin restores an archived user as inactive",
  async () => {
    const token = createAdminToken();

    const response = await request(app)
      .patch("/api/admin/users/2/restore")
      .set(
        "Cookie",
        `${process.env.AUTH_COOKIE_NAME}=${token}`,
      );

    assert.equal(response.status, 200);
    assert.equal(response.body.user.aktifMi, false);
    assert.equal(
      response.body.message,
      "Kullanıcı pasif olarak geri yüklendi",
    );
    assert.deepEqual(activityActions, ["KullaniciGeriYukleme"]);
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
        memberCount: 2,
        managerCount: 1,
      },
      {
        id: 1,
        name: "Uyum",
        description: "Uyum ekibi",
        memberCount: 3,
        managerCount: 1,
      },
    ]);
  },
);

test("admin can create a group", async () => {
  const token = createAdminToken();

  const response = await request(app)
    .post("/api/admin/groups")
    .set(
      "Cookie",
      `${process.env.AUTH_COOKIE_NAME}=${token}`,
    )
    .send({
      name: "Sözleşmeler",
      description: "Sözleşme ekibi",
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.group.name, "Sözleşmeler");
  assert.deepEqual(recorded.createdGroupParams, [
    "Sözleşmeler",
    "Sözleşme ekibi",
  ]);
  assert.deepEqual(activityActions, ["GrupOlusturma"]);
});

test("admin can update group information", async () => {
  const token = createAdminToken();

  const response = await request(app)
    .patch("/api/admin/groups/1")
    .set(
      "Cookie",
      `${process.env.AUTH_COOKIE_NAME}=${token}`,
    )
    .send({
      name: "Uyum ve Denetim",
      description: "Güncel ekip açıklaması",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.group.name, "Uyum ve Denetim");
  assert.deepEqual(recorded.updatedGroupParams, [
    "Uyum ve Denetim",
    "Güncel ekip açıklaması",
    1,
  ]);
  assert.deepEqual(activityActions, ["GrupGuncelleme"]);
});

test("admin can replace user group memberships and roles", async () => {
  const token = createAdminToken();

  const response = await request(app)
    .put("/api/admin/users/2/memberships")
    .set(
      "Cookie",
      `${process.env.AUTH_COOKIE_NAME}=${token}`,
    )
    .send({
      memberships: [
        {
          grupId: 1,
          grupRolu: "grup_yoneticisi",
        },
        {
          grupId: 2,
          grupRolu: "grup_uyesi",
        },
      ],
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.user.groups.length, 2);
  assert.equal(recorded.deletedMembershipUserId, 2);
  assert.deepEqual(recorded.insertedMemberships, [
    [1, 2, "grup_yoneticisi"],
    [2, 2, "grup_uyesi"],
  ]);
  assert.deepEqual(activityActions, [
    "KullaniciGrupUyelikleriDegisikligi",
  ]);
});

test("membership update rejects duplicate groups", async () => {
  const token = createAdminToken();

  const response = await request(app)
    .put("/api/admin/users/2/memberships")
    .set(
      "Cookie",
      `${process.env.AUTH_COOKIE_NAME}=${token}`,
    )
    .send({
      memberships: [
        { grupId: 1, grupRolu: "grup_uyesi" },
        { grupId: 1, grupRolu: "grup_yoneticisi" },
      ],
    });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /birden fazla kez/i);
  assert.equal(recorded.deletedMembershipUserId, null);
});
