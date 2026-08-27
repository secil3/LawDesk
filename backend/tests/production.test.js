const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  assertNoProductionPlaceholders,
} = require("../config/production");

test("production config rejects values copied from the example file", () => {
  assert.throws(
    () =>
      assertNoProductionPlaceholders({
        NODE_ENV: "production",
        APP_BASE_URL: "https://lawdesk.example.gov.tr",
      }),
    /APP_BASE_URL still contains an example value/,
  );
});
test("production placeholder check ignores real values and non-production", () => {
  assert.doesNotThrow(() =>
    assertNoProductionPlaceholders({
      NODE_ENV: "production",
      APP_BASE_URL: "https://lawdesk.kurum.gov.tr",
      AUTH_TOKEN_SECRET: "a".repeat(64),
      SMTP_HOST: "smtp.kurum.gov.tr",
    }),
  );

  assert.doesNotThrow(() =>
    assertNoProductionPlaceholders({
      NODE_ENV: "development",
      APP_BASE_URL: "https://lawdesk.example.gov.tr",
    }),
  );
});
