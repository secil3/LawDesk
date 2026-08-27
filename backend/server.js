const app = require("./app");
const db = require("./config/db");

const PORT = process.env.PORT || 3001;
const SHUTDOWN_TIMEOUT_MS = 10000;

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

let shutdownStarted = false;

const shutdown = (signal) => {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;
  console.log(`${signal} received; shutting down gracefully`);

  const timeout = setTimeout(() => {
    console.error("Graceful shutdown timed out");
    server.closeAllConnections?.();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  timeout.unref();

  server.close(async (serverError) => {
    try {
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
