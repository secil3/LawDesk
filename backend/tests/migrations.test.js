const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { afterEach, test } = require("node:test");

const {
  checksumFor,
  runMigrations,
  stripOuterTransaction,
} = require("../services/migrationService");

const temporaryDirectories = [];

const createMigrationDirectory = async (files) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "lawdesk-migrations-"),
  );
  temporaryDirectories.push(directory);

  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(directory, name), content, "utf8");
  }

  return directory;
};

const createFakeDatabase = ({ applied = [] } = {}) => {
  const queries = [];
  let released = false;
  const client = {
    async query(text, params = []) {
      const sql = String(text);
      queries.push({ sql, params });

      if (sql.includes('AS "name", checksum')) {
        return { rows: applied };
      }

      return { rows: [], rowCount: 0 };
    },
    release() {
      released = true;
    },
  };

  return {
    database: {
      async connect() {
        return client;
      },
    },
    get released() {
      return released;
    },
    queries,
  };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

test("migration checksum is deterministic and sensitive to content", () => {
  assert.equal(checksumFor("SELECT 1;"), checksumFor("SELECT 1;"));
  assert.notEqual(checksumFor("SELECT 1;"), checksumFor("SELECT 2;"));
});

test("outer transaction wrapper is removed before runner transaction", () => {
  assert.equal(
    stripOuterTransaction("BEGIN;\nSELECT 1;\nCOMMIT;"),
    "SELECT 1;",
  );
  assert.equal(stripOuterTransaction("SELECT 1;"), "SELECT 1;");
});

test("migrations run in filename order and are tracked", async () => {
  const directory = await createMigrationDirectory({
    "002_second.sql": "BEGIN;\nSELECT 2;\nCOMMIT;\n",
    "001_first.sql": "SELECT 1;\n",
    "README.md": "ignored",
  });
  const fake = createFakeDatabase();
  const applied = [];

  const result = await runMigrations({
    database: fake.database,
    migrationsDirectory: directory,
    onApplied: (name) => applied.push(name),
  });

  assert.deepEqual(result, {
    applied: ["001_first.sql", "002_second.sql"],
    skipped: [],
  });
  assert.deepEqual(applied, result.applied);
  assert.equal(fake.released, true);

  const executedSql = fake.queries.map((query) => query.sql);
  assert.ok(executedSql.indexOf("SELECT 1;\n") < executedSql.indexOf("SELECT 2;"));
  assert.equal(executedSql.filter((sql) => sql === "BEGIN").length, 2);
  assert.equal(executedSql.filter((sql) => sql === "COMMIT").length, 2);

  const trackingInserts = fake.queries.filter((query) =>
    query.sql.includes("INSERT INTO schema_migrations"),
  );
  assert.deepEqual(
    trackingInserts.map((query) => query.params[0]),
    ["001_first.sql", "002_second.sql"],
  );
});

test("already applied migrations are skipped", async () => {
  const content = "SELECT 1;\n";
  const directory = await createMigrationDirectory({
    "001_first.sql": content,
  });
  const fake = createFakeDatabase({
    applied: [
      {
        name: "001_first.sql",
        checksum: checksumFor(content),
      },
    ],
  });

  const result = await runMigrations({
    database: fake.database,
    migrationsDirectory: directory,
  });

  assert.deepEqual(result, {
    applied: [],
    skipped: ["001_first.sql"],
  });
  assert.equal(
    fake.queries.some((query) => query.sql === "BEGIN"),
    false,
  );
});

test("an applied migration cannot be silently edited", async () => {
  const directory = await createMigrationDirectory({
    "001_first.sql": "SELECT 2;\n",
  });
  const fake = createFakeDatabase({
    applied: [
      {
        name: "001_first.sql",
        checksum: checksumFor("SELECT 1;\n"),
      },
    ],
  });

  await assert.rejects(
    runMigrations({
      database: fake.database,
      migrationsDirectory: directory,
    }),
    /Uygulanmış migration değiştirilemez: 001_first\.sql/,
  );
  assert.equal(fake.released, true);
});

test("a failed advisory lock is not followed by an unlock attempt", async () => {
  const queries = [];
  let released = false;
  const database = {
    async connect() {
      return {
        async query(text) {
          const sql = String(text);
          queries.push(sql);

          if (sql.includes("pg_advisory_lock")) {
            throw new Error("database unavailable");
          }

          return { rows: [], rowCount: 0 };
        },
        release() {
          released = true;
        },
      };
    },
  };

  await assert.rejects(
    runMigrations({ database }),
    /database unavailable/,
  );
  assert.equal(released, true);
  assert.equal(
    queries.some((sql) => sql.includes("pg_advisory_unlock")),
    false,
  );
});
