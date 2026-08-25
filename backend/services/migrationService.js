const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const db = require("../config/db");

const DEFAULT_MIGRATIONS_DIRECTORY = path.resolve(
  __dirname,
  "../../database/migrations",
);

const MIGRATION_LOCK_KEY = "lawdesk_schema_migrations";

const checksumFor = (content) =>
  crypto.createHash("sha256").update(content, "utf8").digest("hex");

const stripOuterTransaction = (content) => {
  const trimmed = content.trim();

  if (!/^BEGIN\s*;/i.test(trimmed) || !/COMMIT\s*;\s*$/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed
    .replace(/^BEGIN\s*;\s*/i, "")
    .replace(/\s*COMMIT\s*;\s*$/i, "");
};

const listMigrationFiles = async (migrationsDirectory) => {
  const entries = await fs.readdir(migrationsDirectory, {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
};

const ensureMigrationTable = async (client) => {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       migrationadi VARCHAR(255) PRIMARY KEY,
       checksum CHAR(64) NOT NULL,
       uygulanmatarihi TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  );
};

const runMigrations = async ({
  database = db,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIRECTORY,
  onApplied = () => undefined,
  onSkipped = () => undefined,
} = {}) => {
  const client = await database.connect();
  let lockAcquired = false;

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [
      MIGRATION_LOCK_KEY,
    ]);
    lockAcquired = true;
    await ensureMigrationTable(client);

    const migrationFiles = await listMigrationFiles(migrationsDirectory);
    const appliedResult = await client.query(
      `SELECT migrationadi AS "name", checksum
       FROM schema_migrations`,
    );
    const appliedMigrations = new Map(
      appliedResult.rows.map((migration) => [
        migration.name,
        migration.checksum.trim(),
      ]),
    );

    const result = {
      applied: [],
      skipped: [],
    };

    for (const migrationName of migrationFiles) {
      const migrationPath = path.join(
        migrationsDirectory,
        migrationName,
      );
      const migrationContent = await fs.readFile(migrationPath, "utf8");
      const checksum = checksumFor(migrationContent);
      const previousChecksum = appliedMigrations.get(migrationName);

      if (previousChecksum) {
        if (previousChecksum !== checksum) {
          throw new Error(
            `Uygulanmış migration değiştirilemez: ${migrationName}`,
          );
        }

        result.skipped.push(migrationName);
        onSkipped(migrationName);
        continue;
      }

      await client.query("BEGIN");

      try {
        await client.query(stripOuterTransaction(migrationContent));
        await client.query(
          `INSERT INTO schema_migrations (migrationadi, checksum)
           VALUES ($1, $2)`,
          [migrationName, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(
          `${migrationName} uygulanamadı: ${error.message}`,
          { cause: error },
        );
      }

      result.applied.push(migrationName);
      onApplied(migrationName);
    }

    return result;
  } finally {
    try {
      if (lockAcquired) {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
          MIGRATION_LOCK_KEY,
        ]);
      }
    } finally {
      client.release();
    }
  }
};

module.exports = {
  DEFAULT_MIGRATIONS_DIRECTORY,
  checksumFor,
  runMigrations,
  stripOuterTransaction,
};
