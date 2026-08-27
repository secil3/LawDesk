const assert = require("node:assert/strict");
const { after, test } = require("node:test");

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "outbox-test-secret-".repeat(4);
process.env.AUTH_TOKEN_TTL_HOURS = "8";
process.env.AUTH_COOKIE_NAME = "lawdesk_outbox_test_session";

const db = require("../config/db");
const emailOutboxService = require(
  "../services/emailOutboxService",
);

const TOKEN = "A".repeat(43);
const EXPIRES_AT = "2026-08-28T12:00:00.000Z";

after(async () => {
  await db.close();
});

test("outbox payload uses authenticated encryption and round-trips", () => {
  const payload = { token: TOKEN, expiresAt: EXPIRES_AT };
  const encrypted = emailOutboxService._private.encryptPayload(payload);

  assert.match(encrypted, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(encrypted.includes(TOKEN), false);
  assert.deepEqual(
    emailOutboxService._private.decryptPayload(encrypted),
    payload,
  );
});

test("outbox payload rejects tampering", () => {
  const encrypted = emailOutboxService._private.encryptPayload({
    token: TOKEN,
    expiresAt: EXPIRES_AT,
  });
  const segments = encrypted.split(".");
  const replacement = segments[3][0] === "A" ? "B" : "A";
  segments[3] = `${replacement}${segments[3].slice(1)}`;
  const tampered = segments.join(".");

  assert.throws(
    () => emailOutboxService._private.decryptPayload(tampered),
    (error) => error.code === "EMAIL_OUTBOX_PAYLOAD_INVALID",
  );
});

test("activation enqueue stores ciphertext instead of the raw token", async () => {
  let inserted;
  const id = await emailOutboxService.enqueueActivationEmail(
    async (text, params) => {
      inserted = { text: String(text), params };
      return { rows: [{ id: "44" }], rowCount: 1 };
    },
    {
      requestId: 12,
      userId: 23,
      activationTokenId: 34,
      email: "aday@example.com",
      name: "Aday Kullanıcı",
      token: TOKEN,
      expiresAt: EXPIRES_AT,
    },
  );

  assert.equal(id, 44);
  assert.match(inserted.text, /INSERT INTO epostaoutbox/);
  assert.deepEqual(inserted.params.slice(0, 5), [
    12,
    23,
    34,
    "aday@example.com",
    "Aday Kullanıcı",
  ]);
  assert.equal(inserted.params[5].includes(TOKEN), false);
  assert.deepEqual(
    emailOutboxService._private.decryptPayload(inserted.params[5]),
    { token: TOKEN, expiresAt: EXPIRES_AT },
  );
});

const createDeliveryDatabase = ({ attemptCount = 0 } = {}) => {
  const encryptedPayload = emailOutboxService._private.encryptPayload({
    token: TOKEN,
    expiresAt: EXPIRES_AT,
  });
  const queries = [];
  let claimed = false;

  const transactionQuery = async (text, params = []) => {
    const sql = String(text);
    const normalized = sql.toLowerCase();
    queries.push({ sql, params });

    if (normalized.includes("select epostaoutboxid")) {
      if (claimed) {
        return { rows: [], rowCount: 0 };
      }

      claimed = true;
      return {
        rows: [
          {
            id: "51",
            requestId: 12,
            userId: 23,
            activationTokenId: 34,
            email: "aday@example.com",
            name: "Aday Kullanıcı",
            encryptedPayload,
            attemptCount,
          },
        ],
        rowCount: 1,
      };
    }

    if (normalized.includes("update epostaoutbox")) {
      return { rows: [], rowCount: 1 };
    }

    if (normalized.includes("update kayit_talepleri")) {
      return { rows: [], rowCount: 1 };
    }

    throw new Error(`Unexpected transaction query: ${sql}`);
  };

  return {
    queries,
    database: {
      async withTransaction(callback) {
        return callback(transactionQuery);
      },
      async query(text, params = []) {
        const sql = String(text);
        queries.push({ sql, params });

        if (sql.includes("FROM kullaniciaktivasyontokenlari token")) {
          return { rows: [{ exists: 1 }], rowCount: 1 };
        }

        throw new Error(`Unexpected database query: ${sql}`);
      },
    },
  };
};

test("delivery marks a claimed email as sent and clears ciphertext", async () => {
  const fake = createDeliveryDatabase();
  let delivered;

  const result = await emailOutboxService.deliverEmailOutboxJob(51, {
    database: fake.database,
    sendEmail: async (message) => {
      delivered = message;
    },
    config: {
      lockTimeoutMs: 300000,
      maxAttempts: 10,
      retryBaseMs: 60000,
      batchSize: 10,
      pollIntervalMs: 30000,
    },
  });

  assert.equal(result.sent, true);
  assert.equal(result.attemptCount, 1);
  assert.deepEqual(delivered, {
    to: "aday@example.com",
    name: "Aday Kullanıcı",
    token: TOKEN,
    expiresAt: EXPIRES_AT,
  });

  const sentUpdate = fake.queries.find((query) =>
    query.sql.includes("durum = 'Gonderildi'"),
  );
  assert.ok(sentUpdate);
  assert.match(sentUpdate.sql, /sifreliicerik = NULL/);

  const requestUpdate = fake.queries.find((query) =>
    query.sql.includes("UPDATE kayit_talepleri"),
  );
  assert.deepEqual(requestUpdate.params, [12, true, null]);
});

test("temporary SMTP failure schedules an exponential retry", async () => {
  const fake = createDeliveryDatabase({ attemptCount: 2 });
  const originalConsoleError = console.error;
  console.error = () => undefined;

  try {
    const result = await emailOutboxService.deliverEmailOutboxJob(51, {
      database: fake.database,
      sendEmail: async () => {
        throw new Error("SMTP temporarily unavailable");
      },
      config: {
        lockTimeoutMs: 300000,
        maxAttempts: 10,
        retryBaseMs: 60000,
        batchSize: 10,
        pollIntervalMs: 30000,
      },
    });

    assert.equal(result.sent, false);
    assert.equal(result.terminal, false);
    assert.equal(result.attemptCount, 3);
  } finally {
    console.error = originalConsoleError;
  }

  const retryUpdate = fake.queries.find((query) =>
    query.sql.includes("SET durum = $2"),
  );
  assert.deepEqual(retryUpdate.params, [
    51,
    "Bekliyor",
    false,
    "SMTP temporarily unavailable",
    240000,
  ]);

  const requestUpdate = fake.queries.find((query) =>
    query.sql.includes("UPDATE kayit_talepleri"),
  );
  assert.match(requestUpdate.params[2], /otomatik yeniden denenecek/);
});

test("retry delay is capped at one hour", () => {
  assert.equal(emailOutboxService._private.retryDelayFor(1, 60000), 60000);
  assert.equal(emailOutboxService._private.retryDelayFor(4, 60000), 480000);
  assert.equal(
    emailOutboxService._private.retryDelayFor(20, 60000),
    3600000,
  );
});
