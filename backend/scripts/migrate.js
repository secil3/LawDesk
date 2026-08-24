const db = require("../config/db");
const { runMigrations } = require("../services/migrationService");

const run = async () => {
  try {
    const result = await runMigrations({
      onApplied: (name) => console.log(`Uygulandı: ${name}`),
      onSkipped: (name) => console.log(`Zaten uygulanmış: ${name}`),
    });

    console.log(
      `Migration tamamlandı: ${result.applied.length} yeni, ` +
        `${result.skipped.length} önceden uygulanmış.`,
    );
  } catch (error) {
    console.error("Migration başarısız:", error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
};

run();
