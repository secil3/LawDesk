const assert = require("node:assert/strict");
const { after, before, beforeEach, test } = require("node:test");

process.env.NODE_ENV = "test";
process.env.AUTH_TOKEN_SECRET = "health-test-secret-".repeat(4);
process.env.AUTH_TOKEN_TTL_HOURS = "1";
process.env.AUTH_COOKIE_NAME = "lawdesk_health_test";

const request = require("supertest");
const app = require("../app");
const db = require("../config/db");

const originalTestConnection = db.testConnection;
let server;
let address;

before(async () => {
  server = app.listen(0, "127.0.0.1");

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });

  address = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  db.testConnection = async () => {};
});

after(async () => {
  db.testConnection = originalTestConnection;

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

  await db.close();
});

test("liveness endpoint does not depend on the database", async () => {
  db.testConnection = async () => {
    throw new Error("database unavailable");
  };

  const response = await request(address).get("/api/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
  assert.equal(response.headers["x-powered-by"], undefined);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
});

test("readiness endpoint succeeds when PostgreSQL is reachable", async () => {
  const response = await request(address).get("/api/ready");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ready" });
});

test("readiness endpoint returns 503 without leaking an error", async () => {
  db.testConnection = async () => {
    throw new Error("password=should-not-leak");
  };

  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const response = await request(address).get("/api/ready");

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { status: "not_ready" });
    assert.equal(response.text.includes("should-not-leak"), false);
  } finally {
    console.error = originalConsoleError;
  }
});
