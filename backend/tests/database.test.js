const assert = require("node:assert/strict");
const { test } = require("node:test");

const { getDatabaseConfig } = require("../config/database");

const productionEnvironment = (overrides = {}) => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://lawdesk:secret@db:5432/lawdesk",
  DB_SSL_MODE: "verify-full",
  ...overrides,
});

test("production database config requires an explicit TLS mode", () => {
  const environment = productionEnvironment();
  delete environment.DB_SSL_MODE;

  assert.throws(
    () => getDatabaseConfig(environment),
    /DB_SSL_MODE is required in production/,
  );
});

test("production database config supports verified TLS", () => {
  const config = getDatabaseConfig(productionEnvironment());

  assert.equal(
    config.connectionString,
    "postgresql://lawdesk:secret@db:5432/lawdesk",
  );
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.equal(config.max, 10);
  assert.equal(config.connectionTimeoutMillis, 5000);
});

test("production database config supports individual connection settings", () => {
  const config = getDatabaseConfig({
    NODE_ENV: "production",
    DB_HOST: "postgres",
    DB_PORT: "5433",
    DB_NAME: "gys_lawdesk",
    DB_USER: "lawdesk",
    DB_PASSWORD: "secret",
    DB_SSL_MODE: "disable",
    DB_POOL_MAX: "12",
  });

  assert.equal(config.host, "postgres");
  assert.equal(config.port, 5433);
  assert.equal(config.database, "gys_lawdesk");
  assert.equal(config.user, "lawdesk");
  assert.equal(config.password, "secret");
  assert.equal(config.ssl, false);
  assert.equal(config.max, 12);
});

test("production database config rejects incomplete individual settings", () => {
  assert.throws(
    () =>
      getDatabaseConfig({
        NODE_ENV: "production",
        DB_HOST: "postgres",
        DB_NAME: "gys_lawdesk",
        DB_USER: "lawdesk",
        DB_SSL_MODE: "disable",
      }),
    /DB_PASSWORD/,
  );
});

test("database pool limits reject unsafe values", () => {
  assert.throws(
    () =>
      getDatabaseConfig({
        NODE_ENV: "test",
        DB_POOL_MAX: "0",
      }),
    /DB_POOL_MAX must be an integer between 1 and 100/,
  );
});
