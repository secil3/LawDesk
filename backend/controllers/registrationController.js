const crypto = require("node:crypto");

const argon2 = require("argon2");

const db = require("../config/db");
const { REGISTRATION_RESPONSE } = require(
  "../middleware/registrationRateLimit",
);
const { sendActivationEmail } = require("../services/emailService");
const { createNotification } = require("./notificationController");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const ALLOWED_STATUSES = new Set([
  "Bekliyor",
  "Onaylandi",
  "Reddedildi",
]);
const ALLOWED_SYSTEM_ROLES = new Set(["kullanici", "yonetici"]);
const ALLOWED_GROUP_ROLES = new Set([
  "grup_uyesi",
  "grup_yoneticisi",
]);

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeName = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
};

const normalizeEmail = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
};

const validRegistrationInput = (name, email) => {
  return (
    name.length >= 2 &&
    name.length <= 150 &&
    email.length <= 150 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
};

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseRequestId = (value) => {
  const requestId = Number(value);

  if (!Number.isInteger(requestId) || requestId < 1) {
    throw createHttpError(400, "Geçersiz kayıt talebi id");
  }

  return requestId;
};

const normalizeGroupRole = (value) => {
  if (value === "uye") {
    return "grup_uyesi";
  }

  if (value === "yonetici") {
    return "grup_yoneticisi";
  }

  return value;
};

const parseMemberships = (value) => {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw createHttpError(400, "Grup üyelikleri dizi olmalıdır");
  }

  const seen = new Set();

  return value.map((membership) => {
    const groupId = Number(membership?.grupId);
    const groupRole = normalizeGroupRole(membership?.grupRolu);

    if (!Number.isInteger(groupId) || groupId < 1) {
      throw createHttpError(400, "Geçerli bir grup seçiniz");
    }

    if (!ALLOWED_GROUP_ROLES.has(groupRole)) {
      throw createHttpError(400, "Geçerli bir grup rolü seçiniz");
    }

    if (seen.has(groupId)) {
      throw createHttpError(400, "Aynı grup birden fazla seçilemez");
    }

    seen.add(groupId);
    return { groupId, groupRole };
  });
};

const tokenHashFor = (token) =>
  crypto.createHash("sha256").update(token, "utf8").digest("hex");

const createActivationToken = () => {
  const token = crypto.randomBytes(32).toString("base64url");
  const ttlHours = Math.min(
    positiveInteger(process.env.ACTIVATION_TOKEN_TTL_HOURS, 24),
    168,
  );

  return {
    token,
    tokenHash: tokenHashFor(token),
    expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
  };
};

const publicRequest = (row) => ({
  id: row.id,
  adSoyad: row.adSoyad,
  email: row.email,
  status: row.status,
  createdAt: row.createdAt,
  reviewedAt: row.reviewedAt,
  reviewerName: row.reviewerName,
  rejectionReason: row.rejectionReason,
  approvedRole: row.approvedRole,
  createdUserId: row.createdUserId,
  activationPending: row.activationPending,
  emailSentAt: row.emailSentAt,
  emailError: row.emailError,
});

const REQUEST_SELECT = `
  SELECT request.kayittalepid AS "id",
         request.adsoyad AS "adSoyad",
         request.email,
         request.durum AS "status",
         request.olusturmatarihi AS "createdAt",
         request.incelemetarihi AS "reviewedAt",
         reviewer.adsoyad AS "reviewerName",
         request.rednedeni AS "rejectionReason",
         request.onaylananrol AS "approvedRole",
         request.olusturulankullaniciid AS "createdUserId",
         created_user.aktivasyonbekliyormu AS "activationPending",
         request.aktivasyonepostagonderimtarihi AS "emailSentAt",
         request.aktivasyonepostahatasi AS "emailError"
  FROM kayit_talepleri request
  LEFT JOIN kullanicilar reviewer
    ON reviewer.kullaniciid = request.inceleyenkullaniciid
  LEFT JOIN kullanicilar created_user
    ON created_user.kullaniciid = request.olusturulankullaniciid
`;

const recordEmailOutcome = async (
  requestId,
  { sent, errorMessage = null },
) => {
  await db.query(
    `UPDATE kayit_talepleri
     SET aktivasyonepostagonderimtarihi =
           CASE WHEN $2::boolean THEN NOW() ELSE aktivasyonepostagonderimtarihi END,
         aktivasyonepostahatasi = $3
     WHERE kayittalepid = $1`,
    [requestId, sent, errorMessage?.slice(0, 500) || null],
  );
};

const deliverActivationEmail = async (activation) => {
  try {
    await sendActivationEmail({
      to: activation.email,
      name: activation.name,
      token: activation.token,
      expiresAt: activation.expiresAt,
    });
  } catch (error) {
    console.error("Activation email failed:", error);
    await recordEmailOutcome(activation.requestId, {
      sent: false,
      errorMessage: "Aktivasyon e-postası gönderilemedi",
    }).catch((recordError) => {
      console.error("Activation email failure could not be recorded:", recordError);
    });
    return { sent: false };
  }

  await recordEmailOutcome(activation.requestId, { sent: true }).catch(
    (recordError) => {
      console.error(
        "Activation email success could not be recorded:",
        recordError,
      );
    },
  );
  return { sent: true };
};

exports.submitRegistrationRequest = async (req, res) => {
  const name = normalizeName(req.body?.adSoyad);
  const email = normalizeEmail(req.body?.email);

  if (!validRegistrationInput(name, email)) {
    return res.status(202).json(REGISTRATION_RESPONSE);
  }

  try {
    await db.withTransaction(async (query) => {
      const existingUser = await query(
        `SELECT 1
         FROM kullanicilar
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email],
      );

      if (existingUser.rowCount > 0) {
        return;
      }

      const inserted = await query(
        `INSERT INTO kayit_talepleri (adsoyad, email)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING kayittalepid AS "id"`,
        [name, email],
      );
      const requestId = inserted.rows[0]?.id;

      if (!requestId) {
        return;
      }

      const admins = await query(
        `SELECT kullaniciid AS "id"
         FROM kullanicilar
         WHERE rol = 'admin'
           AND aktifmi = TRUE
           AND silindimi = FALSE`,
      );

      for (const admin of admins.rows) {
        await createNotification(query, {
          userId: admin.id,
          registrationRequestId: requestId,
          type: "KayitTalebi",
          message: `${name} adına yeni kayıt talebi oluşturuldu.`,
        });
      }
    });
  } catch (error) {
    console.error("Registration request failed:", error);
  }

  return res.status(202).json(REGISTRATION_RESPONSE);
};

exports.listRegistrationRequests = async (req, res) => {
  const requestedPage = positiveInteger(req.query?.page, DEFAULT_PAGE);
  const limit = Math.min(
    positiveInteger(req.query?.limit, DEFAULT_LIMIT),
    MAX_LIMIT,
  );
  const status = ALLOWED_STATUSES.has(req.query?.status)
    ? req.query.status
    : "Bekliyor";

  try {
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS "total"
       FROM kayit_talepleri
       WHERE durum = $1`,
      [status],
    );
    const total = Number(countResult.rows[0]?.total || 0);
    const totalPages = Math.ceil(total / limit);
    const page = totalPages > 0
      ? Math.min(requestedPage, totalPages)
      : 1;
    const result = await db.query(
      `${REQUEST_SELECT}
       WHERE request.durum = $1
       ORDER BY request.olusturmatarihi DESC, request.kayittalepid DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, (page - 1) * limit],
    );

    return res.json({
      requests: result.rows.map(publicRequest),
      status,
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error("List registration requests failed:", error);
    return res.status(500).json({
      error: "Kayıt talepleri getirilemedi",
    });
  }
};

exports.getRegistrationRequest = async (req, res) => {
  let requestId;

  try {
    requestId = parseRequestId(req.params?.id);
  } catch (error) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  try {
    const result = await db.query(
      `${REQUEST_SELECT}
       WHERE request.kayittalepid = $1`,
      [requestId],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Kayıt talebi bulunamadı" });
    }

    const memberships = result.rows[0].createdUserId
      ? await db.query(
          `SELECT gu.grupid AS "grupId",
                  g.grupadi AS "grupAdi",
                  gu.gruprolu AS "grupRolu"
           FROM grupuyelikleri gu
           JOIN gruplar g ON g.grupid = gu.grupid
           WHERE gu.kullaniciid = $1
           ORDER BY g.grupadi`,
          [result.rows[0].createdUserId],
        )
      : { rows: [] };

    return res.json({
      request: {
        ...publicRequest(result.rows[0]),
        memberships: memberships.rows,
      },
    });
  } catch (error) {
    console.error("Get registration request failed:", error);
    return res.status(500).json({ error: "Kayıt talebi getirilemedi" });
  }
};

exports.approveRegistrationRequest = async (req, res) => {
  let requestId;
  let memberships;

  try {
    requestId = parseRequestId(req.params?.id);
    memberships = parseMemberships(req.body?.memberships);
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
  }

  const systemRole = req.body?.systemRole;

  if (!ALLOWED_SYSTEM_ROLES.has(systemRole)) {
    return res.status(400).json({
      error: "Geçerli bir sistem rolü seçiniz",
    });
  }

  const generatedToken = createActivationToken();

  try {
    const activation = await db.withTransaction(async (query) => {
      const requestResult = await query(
        `SELECT kayittalepid AS "id", adsoyad, email, durum
         FROM kayit_talepleri
         WHERE kayittalepid = $1
         FOR UPDATE`,
        [requestId],
      );
      const registrationRequest = requestResult.rows[0];

      if (!registrationRequest) {
        throw createHttpError(404, "Kayıt talebi bulunamadı");
      }

      if (registrationRequest.durum !== "Bekliyor") {
        throw createHttpError(409, "Kayıt talebi daha önce sonuçlandırılmış");
      }

      const existingUser = await query(
        `SELECT 1 FROM kullanicilar WHERE LOWER(email) = LOWER($1)`,
        [registrationRequest.email],
      );

      if (existingUser.rowCount > 0) {
        throw createHttpError(409, "Bu e-posta için kullanıcı hesabı zaten var");
      }

      const groupIds = memberships.map((membership) => membership.groupId);
      const groupsResult = groupIds.length > 0
        ? await query(
            `SELECT grupid AS "id" FROM gruplar
             WHERE grupid = ANY($1::int[])`,
            [groupIds],
          )
        : { rows: [] };

      if (groupsResult.rows.length !== groupIds.length) {
        throw createHttpError(400, "Seçilen gruplardan biri bulunamadı");
      }

      const createdUserResult = await query(
        `INSERT INTO kullanicilar
           (adsoyad, email, sifrehash, rol, aktifmi, aktivasyonbekliyormu)
         VALUES ($1, $2, NULL, $3, FALSE, TRUE)
         RETURNING kullaniciid AS "id"`,
        [registrationRequest.adsoyad, registrationRequest.email, systemRole],
      );
      const userId = createdUserResult.rows[0].id;

      for (const membership of memberships) {
        await query(
          `INSERT INTO grupuyelikleri (grupid, kullaniciid, gruprolu)
           VALUES ($1, $2, $3)`,
          [membership.groupId, userId, membership.groupRole],
        );
      }

      await query(
        `INSERT INTO kullaniciaktivasyontokenlari
           (kullaniciid, kayittalepid, tokenhash, sonkullanmatarihi,
            olusturankullaniciid)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          userId,
          requestId,
          generatedToken.tokenHash,
          generatedToken.expiresAt,
          req.user.id,
        ],
      );

      await query(
        `UPDATE kayit_talepleri
         SET durum = 'Onaylandi',
             inceleyenkullaniciid = $2,
             incelemetarihi = NOW(),
             onaylananrol = $3,
             olusturulankullaniciid = $4,
             rednedeni = NULL,
             aktivasyonepostahatasi = NULL
         WHERE kayittalepid = $1`,
        [requestId, req.user.id, systemRole, userId],
      );

      await query(
        `INSERT INTO aktiviteloglari
           (kullaniciid, gorevid, islem, detay)
         VALUES ($1, NULL, 'KayitTalebiOnaylama', $2)`,
        [
          req.user.id,
          `${req.user.adSoyad}, ${registrationRequest.adsoyad} ` +
            `(${registrationRequest.email}) kayıt talebini onayladı.`,
        ],
      );

      return {
        requestId,
        userId,
        name: registrationRequest.adsoyad,
        email: registrationRequest.email,
        token: generatedToken.token,
        expiresAt: generatedToken.expiresAt,
      };
    });

    const emailResult = await deliverActivationEmail(activation);

    if (!emailResult.sent) {
      return res.status(502).json({
        error:
          "Hesap oluşturuldu ancak aktivasyon e-postası gönderilemedi. Yeniden gönderin.",
        approved: true,
        requestId,
      });
    }

    return res.status(201).json({
      message: "Kayıt talebi onaylandı ve aktivasyon e-postası gönderildi",
      requestId,
      userId: activation.userId,
    });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    if (error?.code === "23505") {
      return res.status(409).json({
        error: "Bu e-posta için kullanıcı hesabı veya aktif token zaten var",
      });
    }

    console.error("Approve registration request failed:", error);
    return res.status(500).json({ error: "Kayıt talebi onaylanamadı" });
  }
};

exports.rejectRegistrationRequest = async (req, res) => {
  let requestId;

  try {
    requestId = parseRequestId(req.params?.id);
  } catch (error) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  const reason = typeof req.body?.reason === "string"
    ? req.body.reason.trim().slice(0, 500)
    : "";

  try {
    await db.withTransaction(async (query) => {
      const requestResult = await query(
        `SELECT adsoyad, email, durum
         FROM kayit_talepleri
         WHERE kayittalepid = $1
         FOR UPDATE`,
        [requestId],
      );
      const registrationRequest = requestResult.rows[0];

      if (!registrationRequest) {
        throw createHttpError(404, "Kayıt talebi bulunamadı");
      }

      if (registrationRequest.durum !== "Bekliyor") {
        throw createHttpError(409, "Kayıt talebi daha önce sonuçlandırılmış");
      }

      await query(
        `UPDATE kayit_talepleri
         SET durum = 'Reddedildi',
             inceleyenkullaniciid = $2,
             incelemetarihi = NOW(),
             rednedeni = NULLIF($3, '')
         WHERE kayittalepid = $1`,
        [requestId, req.user.id, reason],
      );
      await query(
        `INSERT INTO aktiviteloglari
           (kullaniciid, gorevid, islem, detay)
         VALUES ($1, NULL, 'KayitTalebiReddetme', $2)`,
        [
          req.user.id,
          `${req.user.adSoyad}, ${registrationRequest.adsoyad} ` +
            `(${registrationRequest.email}) kayıt talebini reddetti.`,
        ],
      );
    });

    return res.json({ message: "Kayıt talebi reddedildi" });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error("Reject registration request failed:", error);
    return res.status(500).json({ error: "Kayıt talebi reddedilemedi" });
  }
};

exports.resendActivationEmail = async (req, res) => {
  let requestId;

  try {
    requestId = parseRequestId(req.params?.id);
  } catch (error) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  const generatedToken = createActivationToken();

  try {
    const activation = await db.withTransaction(async (query) => {
      const requestResult = await query(
        `SELECT request.adsoyad,
                request.email,
                request.durum,
                request.olusturulankullaniciid AS "userId",
                user_account.aktivasyonbekliyormu AS "activationPending"
         FROM kayit_talepleri request
         JOIN kullanicilar user_account
           ON user_account.kullaniciid = request.olusturulankullaniciid
         WHERE request.kayittalepid = $1
         FOR UPDATE OF request, user_account`,
        [requestId],
      );
      const registrationRequest = requestResult.rows[0];

      if (!registrationRequest) {
        throw createHttpError(404, "Kayıt talebi bulunamadı");
      }

      if (
        registrationRequest.durum !== "Onaylandi" ||
        !registrationRequest.activationPending
      ) {
        throw createHttpError(409, "Hesap artık aktivasyon beklemiyor");
      }

      await query(
        `UPDATE kullaniciaktivasyontokenlari
         SET iptaltarihi = NOW()
         WHERE kullaniciid = $1
           AND kullanilmatarihi IS NULL
           AND iptaltarihi IS NULL`,
        [registrationRequest.userId],
      );
      await query(
        `INSERT INTO kullaniciaktivasyontokenlari
           (kullaniciid, kayittalepid, tokenhash, sonkullanmatarihi,
            olusturankullaniciid)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          registrationRequest.userId,
          requestId,
          generatedToken.tokenHash,
          generatedToken.expiresAt,
          req.user.id,
        ],
      );
      await query(
        `UPDATE kayit_talepleri
         SET aktivasyonepostahatasi = NULL
         WHERE kayittalepid = $1`,
        [requestId],
      );

      return {
        requestId,
        userId: registrationRequest.userId,
        name: registrationRequest.adsoyad,
        email: registrationRequest.email,
        token: generatedToken.token,
        expiresAt: generatedToken.expiresAt,
      };
    });

    const emailResult = await deliverActivationEmail(activation);

    if (!emailResult.sent) {
      return res.status(502).json({
        error: "Aktivasyon e-postası gönderilemedi",
      });
    }

    return res.json({ message: "Yeni aktivasyon e-postası gönderildi" });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error("Resend activation email failed:", error);
    return res.status(500).json({ error: "Aktivasyon e-postası gönderilemedi" });
  }
};

const findValidActivation = async (tokenHash) => {
  return db.query(
    `SELECT token.tokenid AS "tokenId",
            token.kullaniciid AS "userId",
            token.kayittalepid AS "requestId",
            user_account.email,
            user_account.aktivasyonbekliyormu AS "activationPending"
     FROM kullaniciaktivasyontokenlari token
     JOIN kullanicilar user_account
       ON user_account.kullaniciid = token.kullaniciid
     WHERE token.tokenhash = $1
       AND token.kullanilmatarihi IS NULL
       AND token.iptaltarihi IS NULL
       AND token.sonkullanmatarihi > NOW()
       AND user_account.aktivasyonbekliyormu = TRUE
       AND user_account.aktifmi = FALSE
       AND user_account.silindimi = FALSE`,
    [tokenHash],
  );
};

const normalizeToken = (value) => {
  if (
    typeof value !== "string" ||
    value.length !== 43 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    return "";
  }

  return value;
};

const maskEmail = (email) => {
  const [local, domain] = String(email).split("@");
  return `${local?.slice(0, 1) || "*"}***@${domain || "***"}`;
};

exports.validateActivationToken = async (req, res) => {
  const token = normalizeToken(req.body?.token);

  if (!token) {
    return res.status(400).json({ error: "Aktivasyon bağlantısı geçersiz veya süresi dolmuş" });
  }

  try {
    const result = await findValidActivation(tokenHashFor(token));

    if (!result.rows[0]) {
      return res.status(400).json({ error: "Aktivasyon bağlantısı geçersiz veya süresi dolmuş" });
    }

    return res.json({ valid: true, email: maskEmail(result.rows[0].email) });
  } catch (error) {
    console.error("Validate activation token failed:", error);
    return res.status(500).json({ error: "Aktivasyon bağlantısı doğrulanamadı" });
  }
};

exports.activateAccount = async (req, res) => {
  const token = normalizeToken(req.body?.token);
  const password = typeof req.body?.password === "string"
    ? req.body.password
    : "";
  const passwordConfirmation =
    typeof req.body?.passwordConfirmation === "string"
      ? req.body.passwordConfirmation
      : "";

  if (!token) {
    return res.status(400).json({ error: "Aktivasyon bağlantısı geçersiz veya süresi dolmuş" });
  }

  if (password !== passwordConfirmation) {
    return res.status(400).json({ error: "Parolalar eşleşmiyor" });
  }

  if (password.length < 12 || password.length > 256) {
    return res.status(400).json({
      error: "Parola 12 ile 256 karakter arasında olmalıdır",
    });
  }

  const tokenHash = tokenHashFor(token);

  try {
    const preliminary = await findValidActivation(tokenHash);

    if (!preliminary.rows[0]) {
      return res.status(400).json({ error: "Aktivasyon bağlantısı geçersiz veya süresi dolmuş" });
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    await db.withTransaction(async (query) => {
      const tokenResult = await query(
        `SELECT token.tokenid AS "tokenId",
                token.kullaniciid AS "userId"
         FROM kullaniciaktivasyontokenlari token
         JOIN kullanicilar user_account
           ON user_account.kullaniciid = token.kullaniciid
         WHERE token.tokenhash = $1
           AND token.kullanilmatarihi IS NULL
           AND token.iptaltarihi IS NULL
           AND token.sonkullanmatarihi > NOW()
           AND user_account.aktivasyonbekliyormu = TRUE
           AND user_account.aktifmi = FALSE
           AND user_account.silindimi = FALSE
         FOR UPDATE OF token, user_account`,
        [tokenHash],
      );
      const activation = tokenResult.rows[0];

      if (!activation) {
        throw createHttpError(409, "Aktivasyon bağlantısı daha önce kullanılmış veya süresi dolmuş");
      }

      await query(
        `UPDATE kullanicilar
         SET sifrehash = $2,
             aktivasyonbekliyormu = FALSE,
             emaildogrulamatarihi = NOW(),
             aktifmi = TRUE
         WHERE kullaniciid = $1`,
        [activation.userId, passwordHash],
      );
      await query(
        `UPDATE kullaniciaktivasyontokenlari
         SET kullanilmatarihi = NOW()
         WHERE tokenid = $1`,
        [activation.tokenId],
      );
      await query(
        `UPDATE kullaniciaktivasyontokenlari
         SET iptaltarihi = NOW()
         WHERE kullaniciid = $1
           AND tokenid <> $2
           AND kullanilmatarihi IS NULL
           AND iptaltarihi IS NULL`,
        [activation.userId, activation.tokenId],
      );
      await query(
        `INSERT INTO aktiviteloglari
           (kullaniciid, gorevid, islem, detay)
         VALUES ($1, NULL, 'KullaniciAktivasyonu',
                 'Kullanıcı e-posta adresini doğruladı ve hesabını aktifleştirdi.')`,
        [activation.userId],
      );
    });

    return res.json({
      message: "Hesabınız aktifleştirildi. E-posta adresiniz ve parolanızla giriş yapabilirsiniz.",
    });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error("Account activation failed:", error);
    return res.status(500).json({ error: "Hesap aktifleştirilemedi" });
  }
};

exports._private = {
  createActivationToken,
  normalizeEmail,
  normalizeName,
  parseMemberships,
  tokenHashFor,
  validRegistrationInput,
};
