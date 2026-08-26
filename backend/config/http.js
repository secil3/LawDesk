const DEVELOPMENT_ORIGINS = [
  "http://localhost:5175",
  "http://127.0.0.1:5175",
];

const normalizedOrigin = (value, label) => {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must contain a valid URL`);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${label} must use http or https`);
  }

  return parsed.origin;
};

const parseTrustProxyHops = (value) => {
  const parsed = Number(value ?? 0);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
  }

  return parsed;
};

const getHttpConfig = () => {
  const production = process.env.NODE_ENV === "production";
  const appBaseUrl = process.env.APP_BASE_URL?.trim();

  if (production && !appBaseUrl) {
    throw new Error("APP_BASE_URL is required in production");
  }

  const appOrigin = appBaseUrl
    ? normalizedOrigin(appBaseUrl, "APP_BASE_URL")
    : null;
  const configuredOrigins = [
    ...(appOrigin ? [appOrigin] : []),
    ...(process.env.CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ...(!production ? DEVELOPMENT_ORIGINS : []),
  ];
  const allowedOrigins = new Set(
    configuredOrigins.map((origin, index) =>
      normalizedOrigin(origin, `Allowed origin ${index + 1}`),
    ),
  );

  if (
    production &&
    [...allowedOrigins].some((origin) => !origin.startsWith("https://"))
  ) {
    throw new Error("Production allowed origins must use https");
  }

  return {
    allowedOrigins,
    trustProxyHops: parseTrustProxyHops(process.env.TRUST_PROXY_HOPS),
  };
};

const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) {
    return true;
  }

  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
};

module.exports = {
  getHttpConfig,
  isOriginAllowed,
};
