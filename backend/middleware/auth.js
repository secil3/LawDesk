const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { getAuthConfig } = require("../config/auth");

const clearSessionCookie = (res, config) => {
  res.clearCookie(
    config.cookieName,
    config.clearCookieOptions,
  );
};

const requireAuth = async (req, res, next) => {
  const config = getAuthConfig();
  const token = req.cookies?.[config.cookieName];

  if (!token) {
    return res.status(401).json({
      error: "Giriş yapmanız gerekiyor",
    });
  }

  try {
    const payload = jwt.verify(
      token,
      config.tokenSecret,
      {
        issuer: config.tokenIssuer,
        audience: config.tokenAudience,
        algorithms: ["HS256"],
      },
    );

    const userId = Number.parseInt(payload.sub, 10);

    if (!Number.isInteger(userId) || userId < 1) {
      clearSessionCookie(res, config);

      return res.status(401).json({
        error: "Oturum geçersiz",
      });
    }

    const result = await db.query(
      `SELECT kullaniciid, adsoyad, email, rol
       FROM kullanicilar
       WHERE kullaniciid = $1
         AND aktifmi = TRUE`,
      [userId],
    );

    const user = result.rows[0];

    if (!user) {
      clearSessionCookie(res, config);

      return res.status(401).json({
        error: "Oturum geçersiz",
      });
    }

    req.user = {
      id: user.kullaniciid,
      adSoyad: user.adsoyad,
      email: user.email,
      rol: user.rol,
    };

    return next();
  } catch (error) {
    if (
      error.name !== "JsonWebTokenError" &&
      error.name !== "TokenExpiredError"
    ) {
      console.error("Authentication failed:", error);
    }

    clearSessionCookie(res, config);

    return res.status(401).json({
      error: "Oturum geçersiz veya süresi dolmuş",
    });
  }
};

const requireSystemRole =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Giriş yapmanız gerekiyor",
      });
    }

    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({
        error: "Bu işlem için yetkiniz bulunmuyor",
      });
    }

    return next();
  };

module.exports = {
  requireAuth,
  requireSystemRole,
};