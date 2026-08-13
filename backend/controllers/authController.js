const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { getAuthConfig } = require("../config/auth");

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
      `SELECT kullaniciid, adsoyad, email, sifrehash, rol, aktifmi
       FROM kullanicilar
       WHERE LOWER(email) = LOWER($1)
        AND silindimi = FALSE
       LIMIT 1`,
      [email],
    );

    const user = result.rows[0];

    if (!user || !user.aktifmi) {
      return invalidCredentials(res);
    }

    let passwordMatches = false;

    try {
      passwordMatches = await argon2.verify(
        user.sifrehash,
        password,
      );
    } catch {
      passwordMatches = false;
    }

    if (!passwordMatches) {
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