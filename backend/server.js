const app = require("./app");
const db = require("./config/db");
const { getListenerConfig } = require("./config/listener");
const {
  startEmailOutboxWorker,
} = require("./services/emailOutboxService");

const SHUTDOWN_TIMEOUT_MS = 10000;
const listener = getListenerConfig();

const server = app.listen(listener.port, listener.host, () => {
  console.log(
    `Server is running on ${listener.host}:${listener.port}`,
  );
});
const stopEmailOutboxWorker = startEmailOutboxWorker();

let shutdownStarted = false;

const shutdown = (signal) => {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;
  console.log(`${signal} received; shutting down gracefully`);
  const workerShutdown = stopEmailOutboxWorker();

  const timeout = setTimeout(() => {
    console.error("Graceful shutdown timed out");
    server.closeAllConnections?.();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  timeout.unref();

  server.close(async (serverError) => {
    try {
      await workerShutdown;
      await db.close();
    } catch (databaseError) {
      console.error(
        "Database pool shutdown failed:",
        databaseError.message,
      );
      process.exitCode = 1;
    } finally {
      clearTimeout(timeout);

      if (serverError) {
        console.error("HTTP server shutdown failed:", serverError.message);
        process.exitCode = 1;
      }

      process.exit();
    }
  });
};

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
