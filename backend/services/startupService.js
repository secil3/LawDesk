const TRANSIENT_DATABASE_ERROR_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "53300",
  "57P01",
  "57P02",
  "57P03",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
]);

const DEFAULT_MAX_ATTEMPTS = 30;
const DEFAULT_RETRY_DELAY_MS = 2000;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const errorChain = (error) => {
  const errors = [];
  const visited = new Set();
  let current = error;

  while (current && !visited.has(current)) {
    errors.push(current);
    visited.add(current);
    current = current.cause;
  }

  return errors;
};

const transientCodeFor = (error) => {
  for (const candidate of errorChain(error)) {
    if (TRANSIENT_DATABASE_ERROR_CODES.has(candidate.code)) {
      return candidate.code;
    }
  }

  return null;
};

const runMigrationsWithRetry = async ({
  migrate,
  wait = sleep,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  onRetry = () => undefined,
}) => {
  if (typeof migrate !== "function") {
    throw new TypeError("migrate must be a function");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await migrate();
    } catch (error) {
      const code = transientCodeFor(error);

      if (!code || attempt === maxAttempts) {
        throw error;
      }

      onRetry({
        attempt,
        code,
        maxAttempts,
        retryDelayMs,
      });
      await wait(retryDelayMs);
    }
  }

  throw new Error("Database startup retry loop ended unexpectedly");
};

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_RETRY_DELAY_MS,
  runMigrationsWithRetry,
  transientCodeFor,
};
