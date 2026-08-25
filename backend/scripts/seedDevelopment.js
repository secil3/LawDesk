const fs = require("node:fs/promises");
const path = require("node:path");

const db = require("../config/db");

const seedPath = path.resolve(
  __dirname,
  "../../database/seeds/development.sql",
);

const run = async () => {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Geliştirme seed verisi production ortamında çalıştırılamaz",
      );
    }

    const seedSql = await fs.readFile(seedPath, "utf8");
    await db.query(seedSql);
    console.log("Geliştirme örnek verileri hazırlandı");
  } catch (error) {
    console.error("Geliştirme seed işlemi başarısız:", error.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
};

run();
