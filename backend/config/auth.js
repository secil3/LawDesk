const TOKEN_ISSUER = "lawdesk-backend";
const TOKEN_AUDIENCE = "lawdesk-web";

const getAuthConfig = () => {
  const tokenSecret = process.env.AUTH_TOKEN_SECRET;
  const tokenTtlHours = Number.parseInt(
    process.env.AUTH_TOKEN_TTL_HOURS || "8",
    10,
  );
  const cookieName =
    process.env.AUTH_COOKIE_NAME || "lawdesk_session";

  if (!tokenSecret) {
    throw new Error("AUTH_TOKEN_SECRET is required");
  }

  if (tokenSecret.length < 64) {
    throw new Error(
      "AUTH_TOKEN_SECRET must contain at least 64 characters",
    );
  }

  if (
    !Number.isInteger(tokenTtlHours) ||
    tokenTtlHours < 1 ||
    tokenTtlHours > 24
  ) {
    throw new Error(
      "AUTH_TOKEN_TTL_HOURS must be an integer between 1 and 24",
    );
  }

  return {
    tokenSecret,
    tokenTtlHours,
    tokenTtlSeconds: tokenTtlHours * 60 * 60,
    cookieName,
    tokenIssuer: TOKEN_ISSUER,
    tokenAudience: TOKEN_AUDIENCE,

    cookieOptions: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: tokenTtlHours * 60 * 60 * 1000,
    },

    clearCookieOptions: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
};

module.exports = { getAuthConfig };