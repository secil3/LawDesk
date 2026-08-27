const db = require("../config/db");
const { runMigrations } = require("../services/migrationService");
const {
  runMigrationsWithRetry,
} = require("../services/startupService");

const start = async () => {
  const result = await runMigrationsWithRetry({
    migrate: () =>
      runMigrations({
        onApplied: (name) => console.log(`Uygulandı: ${name}`),
        onSkipped: (name) => console.log(`Zaten uygulanmış: ${name}`),
      }),
    onRetry: ({ attempt, code, maxAttempts, retryDelayMs }) => {
      console.warn(
        `Database is not ready (${code}); retrying migration in ` +
          `${retryDelayMs} ms (attempt ${attempt}/${maxAttempts}).`,
      );
    },
  });

  console.log(
    `Migration tamamlandı: ${result.applied.length} yeni, ` +
      `${result.skipped.length} önceden uygulanmış.`,
  );

  require("../server");
};

start().catch(async (error) => {
  console.error("Production startup failed:", error.message);

  try {
    await db.close();
  } catch (closeError) {
    console.error("Database pool shutdown failed:", closeError.message);
  }

  process.exitCode = 1;
});
