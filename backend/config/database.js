const fs = require("node:fs");

const SSL_MODES = new Set([
  "disable",
  "require",
  "verify-full",
]);

const optionalValue = (value) => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};

const parseInteger = (
  value,
  label,
  defaultValue,
  minimum,
  maximum,
) => {
  const normalized = optionalValue(value);

  if (normalized === undefined) {
    return defaultValue;
  }

  const parsed = Number(normalized);

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

const getSslConfig = (environment) => {
  const production = environment.NODE_ENV === "production";
  const configuredMode = optionalValue(environment.DB_SSL_MODE);

  if (production && !configuredMode) {
    throw new Error("DB_SSL_MODE is required in production");
  }

  const mode = (configuredMode || "disable").toLowerCase();

  if (!SSL_MODES.has(mode)) {
    throw new Error(
      "DB_SSL_MODE must be disable, require or verify-full",
    );
  }

  const caPath = optionalValue(environment.DB_SSL_CA_PATH);

  if (caPath && mode !== "verify-full") {
    throw new Error(
      "DB_SSL_CA_PATH can only be used with DB_SSL_MODE=verify-full",
    );
  }

  if (mode === "disable") {
    return false;
  }

  if (mode === "require") {
    return { rejectUnauthorized: false };
  }

  return {
    rejectUnauthorized: true,
    ...(caPath ? { ca: fs.readFileSync(caPath, "utf8") } : {}),
  };
};

const getDatabaseConfig = (environment = process.env) => {
  const production = environment.NODE_ENV === "production";
  const connectionString = optionalValue(environment.DATABASE_URL);
  const individualSettings = {
    DB_HOST: {
      poolKey: "host",
      value: optionalValue(environment.DB_HOST),
    },
    DB_NAME: {
      poolKey: "database",
      value: optionalValue(environment.DB_NAME),
    },
    DB_USER: {
      poolKey: "user",
      value: optionalValue(environment.DB_USER),
    },
    DB_PASSWORD: {
      poolKey: "password",
      value: optionalValue(environment.DB_PASSWORD),
    },
  };

  if (production && !connectionString) {
    const missing = Object.entries(individualSettings)
      .filter(([, setting]) => setting.value === undefined)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `DATABASE_URL or all DB_* connection settings are required in production (missing: ${missing.join(", ")})`,
      );
    }
  }

  const config = {
    ssl: getSslConfig(environment),
    max: parseInteger(
      environment.DB_POOL_MAX,
      "DB_POOL_MAX",
      10,
      1,
      100,
    ),
    idleTimeoutMillis: parseInteger(
      environment.DB_IDLE_TIMEOUT_MS,
      "DB_IDLE_TIMEOUT_MS",
      30000,
      1000,
      600000,
    ),
    connectionTimeoutMillis: parseInteger(
      environment.DB_CONNECTION_TIMEOUT_MS,
      "DB_CONNECTION_TIMEOUT_MS",
      5000,
      1000,
      120000,
    ),
  };

  if (connectionString) {
    config.connectionString = connectionString;
    return config;
  }

  for (const { poolKey, value } of Object.values(individualSettings)) {
    if (value !== undefined) {
      config[poolKey] = value;
    }
  }

  if (individualSettings.DB_HOST.value) {
    config.port = parseInteger(
      environment.DB_PORT,
      "DB_PORT",
      5432,
      1,
      65535,
    );
  }

  return config;
};

module.exports = {
  getDatabaseConfig,
};
