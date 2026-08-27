const assert = require("node:assert/strict");
const { test } = require("node:test");

const { getListenerConfig } = require("../config/listener");

test("development listener defaults to loopback", () => {
  assert.deepEqual(getListenerConfig({ NODE_ENV: "development" }), {
    host: "127.0.0.1",
    port: 3001,
  });
});

test("production listener requires an explicit bind address", () => {
  assert.throws(
    () => getListenerConfig({ NODE_ENV: "production", PORT: "3001" }),
    /BACKEND_BIND_ADDRESS is required/,
  );
});

test("listener accepts an explicit container address and port", () => {
  assert.deepEqual(
    getListenerConfig({
      NODE_ENV: "production",
      BACKEND_BIND_ADDRESS: "0.0.0.0",
      PORT: "3100",
    }),
    { host: "0.0.0.0", port: 3100 },
  );
});

test("listener rejects hostnames and partially numeric ports", () => {
  assert.throws(
    () => getListenerConfig({ BACKEND_BIND_ADDRESS: "localhost" }),
    /IPv4 or IPv6/,
  );
  assert.throws(
    () => getListenerConfig({ PORT: "3001abc" }),
    /PORT must be an integer/,
  );
});
