const fs = require("node:fs/promises");
const path = require("node:path");

const db = require("../config/db");
const { runMigrations } = require("../services/migrationService");

const SCHEMA_PATH = path.resolve(
  __dirname,
  "../../database/GYS_Database_Schema_Simple.sql",
);

const assertSafeTarget = () => {
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.E2E_DATABASE_RESET !== "true"
  ) {
    throw new Error(
      "E2E database reset requires NODE_ENV=test and E2E_DATABASE_RESET=true",
    );
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the E2E database reset");
  }

  const parsedUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(
    parsedUrl.pathname.replace(/^\//, ""),
  );

  if (!databaseName.toLowerCase().endsWith("_test")) {
    throw new Error(
      "E2E database name must end with _test; refusing to reset it",
    );
  }

  return databaseName;
};

const reset = async () => {
  const expectedDatabaseName = assertSafeTarget();
  const identity = await db.query(
    `SELECT current_database() AS "databaseName"`,
  );

  if (identity.rows[0]?.databaseName !== expectedDatabaseName) {
    throw new Error("Connected database does not match DATABASE_URL");
  }

  await db.query("DROP SCHEMA IF EXISTS public CASCADE");
  await db.query("CREATE SCHEMA public");
  await db.query(await fs.readFile(SCHEMA_PATH, "utf8"));

  const migrationResult = await runMigrations();
  console.log(
    `E2E database reset completed: ${migrationResult.applied.length} ` +
      `migrations applied.`,
  );
};

reset()
  .catch((error) => {
    console.error(`E2E database reset failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
