const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  runMigrationsWithRetry,
  transientCodeFor,
} = require("../services/startupService");

const errorWithCode = (code, message = code) =>
  Object.assign(new Error(message), { code });

test("database startup retries a transient connection failure", async () => {
  let attempts = 0;
  const delays = [];
  const retries = [];
  const expected = { applied: [], skipped: [] };

  const result = await runMigrationsWithRetry({
    migrate: async () => {
      attempts += 1;

      if (attempts < 3) {
        throw errorWithCode("ECONNREFUSED");
      }

      return expected;
    },
    wait: async (milliseconds) => delays.push(milliseconds),
    maxAttempts: 5,
    retryDelayMs: 25,
    onRetry: (retry) => retries.push(retry),
  });

  assert.equal(result, expected);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [25, 25]);
  assert.deepEqual(
    retries.map(({ attempt, code }) => ({ attempt, code })),
    [
      { attempt: 1, code: "ECONNREFUSED" },
      { attempt: 2, code: "ECONNREFUSED" },
    ],
  );
});

test("database startup does not retry a deterministic migration error", async () => {
  let attempts = 0;
  let waits = 0;

  await assert.rejects(
    runMigrationsWithRetry({
      migrate: async () => {
        attempts += 1;
        throw new Error("invalid migration SQL");
      },
      wait: async () => {
        waits += 1;
      },
      maxAttempts: 5,
    }),
    /invalid migration SQL/,
  );

  assert.equal(attempts, 1);
  assert.equal(waits, 0);
});

test("database startup stops after the configured retry limit", async () => {
  let attempts = 0;
  let waits = 0;

  await assert.rejects(
    runMigrationsWithRetry({
      migrate: async () => {
        attempts += 1;
        throw errorWithCode("57P03", "database is starting");
      },
      wait: async () => {
        waits += 1;
      },
      maxAttempts: 3,
      retryDelayMs: 1,
    }),
    /database is starting/,
  );

  assert.equal(attempts, 3);
  assert.equal(waits, 2);
});

test("transient database errors are found through wrapped causes", () => {
  const wrapped = new Error("migration failed", {
    cause: errorWithCode("ETIMEDOUT"),
  });

  assert.equal(transientCodeFor(wrapped), "ETIMEDOUT");
  assert.equal(transientCodeFor(new Error("syntax error")), null);
});
