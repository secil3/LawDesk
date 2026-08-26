const PLACEHOLDER_PATTERN =
  /(DEGISTIRIN|SIFRENIZ|PAROLANIZ|GERCEK_DEGER|ORNEK_DEGER|example\.gov\.tr|example\.com)/i;

const PRODUCTION_VALUE_KEYS = [
  "APP_BASE_URL",
  "DATABASE_URL",
  "DB_HOST",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "AUTH_TOKEN_SECRET",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "INITIAL_ADMIN_NAME",
  "INITIAL_ADMIN_EMAIL",
  "INITIAL_ADMIN_PASSWORD",
];

const assertNoProductionPlaceholders = (environment = process.env) => {
  if (environment.NODE_ENV !== "production") {
    return;
  }

  for (const key of PRODUCTION_VALUE_KEYS) {
    const value = String(environment[key] ?? "").trim();

    if (value && PLACEHOLDER_PATTERN.test(value)) {
      throw new Error(`${key} still contains an example value`);
    }
  }
};

module.exports = {
  assertNoProductionPlaceholders,
};
