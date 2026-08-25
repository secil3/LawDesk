const argon2 = require("argon2");
const jwt = require("jsonwebtoken");

const db = require("../config/db");
const { getAuthConfig } = require("../config/auth");

// Bilinmeyen, pasif ve aktivasyon bekleyen hesaplarda da aynı pahalı
// doğrulama çalıştırılarak e-posta varlığının süre ölçümüyle anlaşılması
// zorlaştırılır. Bu sabit gerçek bir hesaba ait değildir.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$" +
  "yExmJRxMLGFBm3yd5pOLRw$" +
  "1fya7OndUskMHwIHb7JQ9DFvomUkIiDiGMvLXx37V98";

const publicUser = (user) => ({
  id: user.kullaniciid,
  adSoyad: user.adsoyad,
  email: user.email,
  rol: user.rol,
  groups: user.groups || [],
});

const invalidCredentials = (res) =>
  res.status(401).json({
    error: "E-posta veya şifre hatalı",
  });

exports.login = async (req, res) => {
  const email =
    typeof req.body.email === "string"
      ? req.body.email.trim()
      : "";

  const password =
    typeof req.body.password === "string"
      ? req.body.password
      : "";

  if (!email || !password) {
    return res.status(400).json({
      error: "E-posta ve şifre zorunludur",
    });
  }

  if (email.length > 150 || password.length > 256) {
    return res.status(400).json({
      error: "Giriş bilgileri geçersiz",
    });
  }

  try {
    const result = await db.query(
      `SELECT
         k.kullaniciid,
         k.adsoyad,
         k.email,
         k.sifrehash,
         k.rol,
         k.aktifmi,
         COALESCE(
           (
             SELECT json_agg(
               json_build_object(
                 'grupId', gu.grupid,
                 'grupAdi', g.grupadi,
                 'grupRolu',
                 CASE gu.gruprolu
                   WHEN 'uye' THEN 'grup_uyesi'
                   WHEN 'yonetici' THEN 'grup_yoneticisi'
                   ELSE gu.gruprolu
                 END
               )
               ORDER BY g.grupadi
             )
             FROM grupuyelikleri gu
             JOIN gruplar g
               ON g.grupid = gu.grupid
             WHERE gu.kullaniciid = k.kullaniciid
           ),
           '[]'::json
         ) AS "groups"
       FROM kullanicilar k
       WHERE LOWER(k.email) = LOWER($1)
         AND k.silindimi = FALSE
       LIMIT 1`,
      [email],
    );

    const user = result.rows[0];

    let passwordMatches = false;

    try {
      passwordMatches = await argon2.verify(
        typeof user?.sifrehash === "string"
          ? user.sifrehash
          : DUMMY_PASSWORD_HASH,
        password,
      );
    } catch {
      passwordMatches = false;
    }

    if (!user || !user.aktifmi || !passwordMatches) {
      return invalidCredentials(res);
    }

    const config = getAuthConfig();

    const token = jwt.sign({}, config.tokenSecret, {
      subject: String(user.kullaniciid),
      issuer: config.tokenIssuer,
      audience: config.tokenAudience,
      expiresIn: config.tokenTtlSeconds,
      algorithm: "HS256",
    });

    res.cookie(
      config.cookieName,
      token,
      config.cookieOptions,
    );

    return res.json({
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login failed:", error);

    return res.status(500).json({
      error: "Giriş işlemi tamamlanamadı",
    });
  }
};

exports.me = (req, res) => {
  return res.json({
    user: req.user,
  });
};

exports.logout = (req, res) => {
  const config = getAuthConfig();

  res.clearCookie(
    config.cookieName,
    config.clearCookieOptions,
  );

  return res.json({
    message: "Çıkış başarılı",
  });
};
