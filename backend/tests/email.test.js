const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const { getEmailConfig } = require("../services/emailService");

const ENV_KEYS = [
  "NODE_ENV",
  "SMTP_JSON_TRANSPORT",
  "SMTP_FROM",
  "APP_BASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_SECURE",
  "SMTP_REQUIRE_TLS",
];
const originalEnvironment = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

const configureProductionSmtp = () => {
  process.env.NODE_ENV = "production";
  process.env.SMTP_JSON_TRANSPORT = "false";
  process.env.SMTP_FROM = "LawDesk <lawdesk@example.com>";
  process.env.APP_BASE_URL = "https://lawdesk.example.com";
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  process.env.SMTP_SECURE = "false";
};

afterEach(() => {
  for (const key of ENV_KEYS) {
    const originalValue = originalEnvironment[key];

    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
});

test("production SMTP cannot disable both TLS modes", () => {
  configureProductionSmtp();
  process.env.SMTP_REQUIRE_TLS = "false";

  assert.throws(
    () => getEmailConfig(),
    /SMTP encryption is required in production/,
  );
});

test("production SMTP accepts STARTTLS enforcement", () => {
  configureProductionSmtp();
  process.env.SMTP_REQUIRE_TLS = "true";

  const config = getEmailConfig();

  assert.equal(config.secure, false);
  assert.equal(config.requireTLS, true);
});
