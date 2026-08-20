const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { getAuthConfig } = require("../config/auth");

const clearSessionCookie = (res, config) => {
  res.clearCookie(
    config.cookieName,
    config.clearCookieOptions,
  );
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
         AND aktifmi = TRUE
         AND silindimi = FALSE`,
      [userId],
    );

    const user = result.rows[0];

    if (!user) {
      clearSessionCookie(res, config);

      return res.status(401).json({
        error: "Oturum geçersiz",
      });
    }

    const memberships = await db.query(
      `SELECT gu.grupid AS "grupId",
              g.grupadi AS "grupAdi",
              gu.gruprolu AS "grupRolu"
       FROM grupuyelikleri gu
       JOIN gruplar g ON g.grupid = gu.grupid
       WHERE gu.kullaniciid = $1`,
      [userId],
    );

    req.user = {
      id: user.kullaniciid,
      adSoyad: user.adsoyad,
      email: user.email,
      rol: user.rol,
      groups: memberships.rows.map((row) => ({
        grupId: row.grupId,
        grupAdi: row.grupAdi,
        grupRolu: normalizeGroupRole(row.grupRolu),
      })),
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

const canAccessGroups = (user) => {
  if (!user) {
    return false;
  }

  if (["admin", "yonetici", "kullanici"].includes(user.rol)) {
    return true;
  }

  return (
    Array.isArray(user.groups) &&
    user.groups.some((group) =>
      ["grup_uyesi", "grup_yoneticisi"].includes(
        normalizeGroupRole(group.grupRolu),
      ),
    )
  );
};

const requireGroupAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Giriş yapmanız gerekiyor",
    });
  }

  if (!canAccessGroups(req.user)) {
    return res.status(403).json({
      error: "Bu işlem için yetkiniz bulunmuyor",
    });
  }

  return next();
};

const requireGroupRole =
  (groupId, requiredRole) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Giriş yapmanız gerekiyor",
      });
    }

    const membership =
      req.user.groups?.find(
        (group) => Number(group.grupId) === Number(groupId),
      ) || null;

    if (!membership) {
      return res.status(403).json({
        error: "Bu grup için gerekli yetki bulunmuyor",
      });
    }

    if (normalizeGroupRole(membership.grupRolu) !== normalizeGroupRole(requiredRole)) {
      return res.status(403).json({
        error: "Bu grup için gerekli yetki bulunmuyor",
      });
    }

    return next();
  };

module.exports = {
  requireAuth,
  requireSystemRole,
  requireGroupAccess,
  requireGroupRole,
};