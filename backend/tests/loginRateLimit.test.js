const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const express = require("express");
const request = require("supertest");

const {
  createLoginRateLimit,
} = require("../middleware/loginRateLimit");

let app;
let testServer;

before(async () => {
  const expressApp = express();
  expressApp.post(
    "/login",
    createLoginRateLimit({
      windowMinutes: 1,
      maxAttempts: 2,
    }),
    (req, res) => {
      if (req.get("x-test-success") === "true") {
        return res.json({ ok: true });
      }

      return res.status(401).json({ error: "invalid" });
    },
  );

  testServer = expressApp.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    testServer.once("error", reject);
    testServer.once("listening", resolve);
  });

  const address = testServer.address();
  app = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!testServer) {
    return;
  }

  await new Promise((resolve, reject) => {
    testServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

test("login rate limiter blocks repeated failures", async () => {
  const first = await request(app).post("/login");
  const second = await request(app).post("/login");
  const blocked = await request(app).post("/login");

  assert.equal(first.status, 401);
  assert.equal(second.status, 401);
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /çok fazla başarısız giriş/i);
  assert.ok(blocked.headers["ratelimit-policy"]);
});
