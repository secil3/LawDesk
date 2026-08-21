const fs = require("node:fs");
const path = require("node:path");

const db = require("../config/db");

const migrationPath = path.resolve(
  __dirname,
  "../../database/migrations/20260821_task_type_group_routing.sql",
);

const run = async () => {
  try {
    const migrationSql = fs.readFileSync(migrationPath, "utf8");
    await db.query(migrationSql);
    console.log("Görev tipi-grup yönlendirme migration'ı tamamlandı");
  } catch (error) {
    console.error(
      "Görev tipi-grup yönlendirme migration'ı başarısız:",
      error.message,
    );
    process.exitCode = 1;
  } finally {
    await db.close();
  }
};

run();
