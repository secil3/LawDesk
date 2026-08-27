const crypto = require("node:crypto");

const db = require("../config/db");
const { getAuthConfig } = require("../config/auth");
const { sendActivationEmail } = require("./emailService");

const PAYLOAD_VERSION = "v1";
const PAYLOAD_KEY_SALT = "lawdesk-email-outbox-v1";
const PAYLOAD_KEY_CONTEXT = "activation-email-payload";
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

const parseInteger = (value, label, fallback, minimum, maximum) => {
  const normalized = String(value ?? "").trim();
  const parsed = Number(normalized || fallback);

  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  return parsed;
};

const getEmailOutboxConfig = (environment = process.env) => ({
  pollIntervalMs: parseInteger(
    environment.EMAIL_OUTBOX_POLL_INTERVAL_MS,
    "EMAIL_OUTBOX_POLL_INTERVAL_MS",
    30000,
    1000,
    600000,
  ),
  retryBaseMs: parseInteger(
    environment.EMAIL_OUTBOX_RETRY_BASE_MS,
    "EMAIL_OUTBOX_RETRY_BASE_MS",
    60000,
    1000,
    3600000,
  ),
  maxAttempts: parseInteger(
    environment.EMAIL_OUTBOX_MAX_ATTEMPTS,
    "EMAIL_OUTBOX_MAX_ATTEMPTS",
    10,
    1,
    20,
  ),
  lockTimeoutMs: parseInteger(
    environment.EMAIL_OUTBOX_LOCK_TIMEOUT_MS,
    "EMAIL_OUTBOX_LOCK_TIMEOUT_MS",
    300000,
    10000,
    3600000,
  ),
  batchSize: parseInteger(
    environment.EMAIL_OUTBOX_BATCH_SIZE,
    "EMAIL_OUTBOX_BATCH_SIZE",
    10,
    1,
    100,
  ),
});

const payloadKeyFor = (tokenSecret = getAuthConfig().tokenSecret) => {
  return Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(tokenSecret, "utf8"),
      Buffer.from(PAYLOAD_KEY_SALT, "utf8"),
      Buffer.from(PAYLOAD_KEY_CONTEXT, "utf8"),
      32,
    ),
  );
};

const encryptPayload = (
  payload,
  tokenSecret = getAuthConfig().tokenSecret,
) => {
  const initializationVector = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    payloadKeyFor(tokenSecret),
    initializationVector,
  );
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const authenticationTag = cipher.getAuthTag();

  return [
    PAYLOAD_VERSION,
    initializationVector.toString("base64url"),
    authenticationTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
};

const decryptPayload = (
  encryptedPayload,
  tokenSecret = getAuthConfig().tokenSecret,
) => {
  try {
    const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
      String(encryptedPayload || "").split(".");

    if (
      version !== PAYLOAD_VERSION ||
      !encodedIv ||
      !encodedTag ||
      !encodedCiphertext ||
      extra !== undefined
    ) {
      throw new Error("invalid envelope");
    }

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      payloadKeyFor(tokenSecret),
      Buffer.from(encodedIv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, "base64url")),
      decipher.final(),
    ]);
    const payload = JSON.parse(plaintext.toString("utf8"));

    if (
      typeof payload?.token !== "string" ||
      typeof payload?.expiresAt !== "string"
    ) {
      throw new Error("invalid payload");
    }

    return payload;
  } catch (error) {
    const invalidPayloadError = new Error(
      "Email outbox payload could not be decrypted",
      { cause: error },
    );
    invalidPayloadError.code = "EMAIL_OUTBOX_PAYLOAD_INVALID";
    throw invalidPayloadError;
  }
};

const retryDelayFor = (attemptCount, retryBaseMs) => {
  const exponent = Math.max(0, Number(attemptCount) - 1);
  return Math.min(
    retryBaseMs * 2 ** exponent,
    MAX_RETRY_DELAY_MS,
  );
};

const enqueueActivationEmail = async (
  query,
  {
    requestId,
    userId,
    activationTokenId,
    email,
    name,
    token,
    expiresAt,
  },
) => {
  if (typeof query !== "function") {
    throw new TypeError("query must be a function");
  }

  const encryptedPayload = encryptPayload({
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  });
  const result = await query(
    `INSERT INTO epostaoutbox
       (kayittalepid, kullaniciid, aktivasyontokenid, tur,
        aliciemail, aliciadi, sifreliicerik)
     VALUES ($1, $2, $3, 'Aktivasyon', $4, $5, $6)
     RETURNING epostaoutboxid AS "id"`,
    [
      requestId,
      userId,
      activationTokenId,
      email,
      name,
      encryptedPayload,
    ],
  );

  return Number(result.rows[0]?.id);
};

const cancelPendingActivationEmails = async (query, requestId) => {
  return query(
    `UPDATE epostaoutbox
     SET durum = 'Iptal',
         sifreliicerik = NULL,
         kilitlenmetarihi = NULL,
         guncellemetarihi = NOW()
     WHERE kayittalepid = $1
       AND tur = 'Aktivasyon'
       AND durum IN ('Bekliyor', 'Isleniyor')`,
    [requestId],
  );
};

const claimEmailOutboxJob = async ({
  jobId = null,
  database = db,
  lockTimeoutMs,
}) => {
  return database.withTransaction(async (query) => {
    const result = await query(
      `SELECT epostaoutboxid AS "id",
              kayittalepid AS "requestId",
              kullaniciid AS "userId",
              aktivasyontokenid AS "activationTokenId",
              aliciemail AS "email",
              aliciadi AS "name",
              sifreliicerik AS "encryptedPayload",
              denemesayisi AS "attemptCount"
       FROM epostaoutbox
       WHERE ($1::bigint IS NULL OR epostaoutboxid = $1)
         AND (
           (durum = 'Bekliyor' AND sonrakidenemetarihi <= NOW())
           OR
           (durum = 'Isleniyor'
            AND (
              kilitlenmetarihi IS NULL
              OR kilitlenmetarihi <
                 NOW() - ($2::bigint * INTERVAL '1 millisecond')
            ))
         )
       ORDER BY sonrakidenemetarihi, epostaoutboxid
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [jobId, lockTimeoutMs],
    );
    const job = result.rows[0];

    if (!job) {
      return null;
    }

    const nextAttemptCount = Number(job.attemptCount) + 1;
    await query(
      `UPDATE epostaoutbox
       SET durum = 'Isleniyor',
           denemesayisi = $2,
           kilitlenmetarihi = NOW(),
           guncellemetarihi = NOW()
       WHERE epostaoutboxid = $1`,
      [job.id, nextAttemptCount],
    );

    return {
      ...job,
      id: Number(job.id),
      requestId: Number(job.requestId),
      userId: Number(job.userId),
      activationTokenId: Number(job.activationTokenId),
      attemptCount: nextAttemptCount,
    };
  });
};

const activationIsDeliverable = async (database, job) => {
  const result = await database.query(
    `SELECT 1
     FROM kullaniciaktivasyontokenlari token
     JOIN kullanicilar user_account
       ON user_account.kullaniciid = token.kullaniciid
     WHERE token.tokenid = $1
       AND token.kullaniciid = $2
       AND token.kayittalepid = $3
       AND token.kullanilmatarihi IS NULL
       AND token.iptaltarihi IS NULL
       AND token.sonkullanmatarihi > NOW()
       AND user_account.aktivasyonbekliyormu = TRUE
       AND user_account.aktifmi = FALSE
       AND user_account.silindimi = FALSE`,
    [job.activationTokenId, job.userId, job.requestId],
  );

  return result.rowCount > 0;
};

const cancelClaimedJob = async (database, jobId) => {
  await database.query(
    `UPDATE epostaoutbox
     SET durum = 'Iptal',
         sifreliicerik = NULL,
         kilitlenmetarihi = NULL,
         guncellemetarihi = NOW()
     WHERE epostaoutboxid = $1
       AND durum = 'Isleniyor'`,
    [jobId],
  );
};

const recordDeliveryOutcome = async (
  database,
  job,
  { sent, error = null, retryDelayMs = 0, terminal = false },
) => {
  const internalError = String(error?.message || error || "")
    .trim()
    .slice(0, 500) || null;
  const publicError = terminal
    ? "Aktivasyon e-postası otomatik denemelerden sonra gönderilemedi. Yeniden gönderin."
    : "Aktivasyon e-postası gönderilemedi; otomatik yeniden denenecek.";

  return database.withTransaction(async (query) => {
    const outboxResult = sent
      ? await query(
          `UPDATE epostaoutbox
           SET durum = 'Gonderildi',
               sifreliicerik = NULL,
               kilitlenmetarihi = NULL,
               sonhata = NULL,
               gonderimtarihi = NOW(),
               guncellemetarihi = NOW()
           WHERE epostaoutboxid = $1
             AND durum = 'Isleniyor'`,
          [job.id],
        )
      : await query(
          `UPDATE epostaoutbox
           SET durum = $2,
               sifreliicerik = CASE WHEN $3::boolean THEN NULL ELSE sifreliicerik END,
               kilitlenmetarihi = NULL,
               sonhata = $4,
               sonrakidenemetarihi =
                 CASE
                   WHEN $3::boolean THEN sonrakidenemetarihi
                   ELSE NOW() + ($5::bigint * INTERVAL '1 millisecond')
                 END,
               guncellemetarihi = NOW()
           WHERE epostaoutboxid = $1
             AND durum = 'Isleniyor'`,
          [
            job.id,
            terminal ? "Basarisiz" : "Bekliyor",
            terminal,
            internalError,
            retryDelayMs,
          ],
        );

    if (outboxResult.rowCount === 0) {
      return false;
    }

    await query(
      `UPDATE kayit_talepleri
       SET aktivasyonepostagonderimtarihi =
             CASE
               WHEN $2::boolean THEN NOW()
               ELSE aktivasyonepostagonderimtarihi
             END,
           aktivasyonepostahatasi = $3
       WHERE kayittalepid = $1`,
      [job.requestId, sent, sent ? null : publicError],
    );

    return true;
  });
};

const deliverEmailOutboxJob = async (
  jobId = null,
  {
    database = db,
    sendEmail = sendActivationEmail,
    config = getEmailOutboxConfig(),
  } = {},
) => {
  const job = await claimEmailOutboxJob({
    jobId,
    database,
    lockTimeoutMs: config.lockTimeoutMs,
  });

  if (!job) {
    return { processed: false, sent: false };
  }

  if (!(await activationIsDeliverable(database, job))) {
    await cancelClaimedJob(database, job.id);
    return { processed: true, sent: false, cancelled: true, jobId: job.id };
  }

  try {
    const payload = decryptPayload(job.encryptedPayload);

    await sendEmail({
      to: job.email,
      name: job.name,
      token: payload.token,
      expiresAt: payload.expiresAt,
    });
    await recordDeliveryOutcome(database, job, { sent: true });

    return {
      processed: true,
      sent: true,
      jobId: job.id,
      attemptCount: job.attemptCount,
    };
  } catch (error) {
    const terminal =
      error?.code === "EMAIL_OUTBOX_PAYLOAD_INVALID" ||
      job.attemptCount >= config.maxAttempts;
    const retryDelayMs = retryDelayFor(
      job.attemptCount,
      config.retryBaseMs,
    );

    console.error(
      `Email outbox delivery failed (job ${job.id}, ` +
        `attempt ${job.attemptCount}/${config.maxAttempts}):`,
      error.message,
    );
    await recordDeliveryOutcome(database, job, {
      sent: false,
      error,
      retryDelayMs,
      terminal,
    });

    return {
      processed: true,
      sent: false,
      terminal,
      jobId: job.id,
      attemptCount: job.attemptCount,
    };
  }
};

const processEmailOutboxBatch = async ({
  database = db,
  sendEmail = sendActivationEmail,
  config = getEmailOutboxConfig(),
} = {}) => {
  const results = [];

  while (results.length < config.batchSize) {
    const result = await deliverEmailOutboxJob(null, {
      database,
      sendEmail,
      config,
    });

    if (!result.processed) {
      break;
    }

    results.push(result);
  }

  return results;
};

const startEmailOutboxWorker = ({
  database = db,
  sendEmail = sendActivationEmail,
  config = getEmailOutboxConfig(),
} = {}) => {
  let stopped = false;
  let runningPromise = null;

  const run = () => {
    if (stopped || runningPromise) {
      return runningPromise;
    }

    runningPromise = processEmailOutboxBatch({
      database,
      sendEmail,
      config,
    })
      .catch((error) => {
        console.error("Email outbox worker failed:", error.message);
      })
      .finally(() => {
        runningPromise = null;
      });

    return runningPromise;
  };

  const timer = setInterval(run, config.pollIntervalMs);
  timer.unref?.();
  void run();

  return async () => {
    stopped = true;
    clearInterval(timer);

    if (runningPromise) {
      await runningPromise;
    }
  };
};

module.exports = {
  cancelPendingActivationEmails,
  deliverEmailOutboxJob,
  enqueueActivationEmail,
  getEmailOutboxConfig,
  processEmailOutboxBatch,
  startEmailOutboxWorker,
  _private: {
    decryptPayload,
    encryptPayload,
    payloadKeyFor,
    retryDelayFor,
  },
};
