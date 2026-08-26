const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const {
  getHttpConfig,
  isOriginAllowed,
} = require("../config/http");

const ORIGINAL_ENV = {
  APP_BASE_URL: process.env.APP_BASE_URL,
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  NODE_ENV: process.env.NODE_ENV,
  TRUST_PROXY_HOPS: process.env.TRUST_PROXY_HOPS,
};

const restoreEnvironmentValue = (name, value) => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
};

afterEach(() => {
  for (const [name, value] of Object.entries(ORIGINAL_ENV)) {
    restoreEnvironmentValue(name, value);
  }
});

test("production HTTP config requires an application URL", () => {
  process.env.NODE_ENV = "production";
  delete process.env.APP_BASE_URL;
  delete process.env.CORS_ALLOWED_ORIGINS;

  assert.throws(
    () => getHttpConfig(),
    /APP_BASE_URL is required in production/,
  );
});

test("production HTTP config rejects insecure origins", () => {
  process.env.NODE_ENV = "production";
  process.env.APP_BASE_URL = "http://lawdesk.example.com";

  assert.throws(
    () => getHttpConfig(),
    /Production allowed origins must use https/,
  );
});

test("HTTP config allows only normalized configured origins", () => {
  process.env.NODE_ENV = "production";
  process.env.APP_BASE_URL = "https://lawdesk.example.com/activation";
  process.env.CORS_ALLOWED_ORIGINS =
    "https://admin.example.com/path, https://lawdesk.example.com";
  process.env.TRUST_PROXY_HOPS = "1";

  const config = getHttpConfig();

  assert.deepEqual([...config.allowedOrigins].sort(), [
    "https://admin.example.com",
    "https://lawdesk.example.com",
  ]);
  assert.equal(config.trustProxyHops, 1);
  assert.equal(
    isOriginAllowed("https://admin.example.com/settings", config.allowedOrigins),
    true,
  );
  assert.equal(
    isOriginAllowed("https://evil.example.com", config.allowedOrigins),
    false,
  );
});

test("HTTP config rejects an unsafe trust proxy value", () => {
  process.env.NODE_ENV = "test";
  process.env.TRUST_PROXY_HOPS = "all";

  assert.throws(
    () => getHttpConfig(),
    /TRUST_PROXY_HOPS must be an integer between 0 and 10/,
  );
});
