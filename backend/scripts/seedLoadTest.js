const argon2 = require("argon2");

const db = require("../config/db");

const parseInteger = (value, label, fallback, minimum, maximum) => {
  const parsed = Number(value || fallback);

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${label} must be an integer between ${minimum} and ${maximum}`,
    );
  }

  return parsed;
};

const assertSafeTarget = async () => {
  if (process.env.LOAD_TEST_SEED !== "true") {
    throw new Error("LOAD_TEST_SEED=true is required");
  }

  const identity = await db.query(
    `SELECT current_database() AS "databaseName"`,
  );
  const databaseName = identity.rows[0]?.databaseName || "";

  if (!databaseName.toLowerCase().endsWith("_test")) {
    throw new Error(
      "Load test database name must end with _test; refusing to seed it",
    );
  }
};

const seed = async () => {
  await assertSafeTarget();

  const userCount = parseInteger(
    process.env.LOAD_TEST_USER_COUNT,
    "LOAD_TEST_USER_COUNT",
    70,
    1,
    200,
  );
  const taskCount = parseInteger(
    process.env.LOAD_TEST_TASK_COUNT,
    "LOAD_TEST_TASK_COUNT",
    250,
    1,
    5000,
  );
  const password = process.env.LOAD_TEST_USER_PASSWORD;

  if (!password || password.length < 12 || password.length > 256) {
    throw new Error(
      "LOAD_TEST_USER_PASSWORD must be between 12 and 256 characters",
    );
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  await db.withTransaction(async (query) => {
    await query(
      `DELETE FROM gorevler
       WHERE baslik LIKE 'Yük testi görevi %'`,
    );
    await query(
      `DELETE FROM grupuyelikleri
       WHERE kullaniciid IN (
         SELECT kullaniciid
         FROM kullanicilar
         WHERE email LIKE 'load.user.%@lawdesk.test'
       )`,
    );
    await query(
      `DELETE FROM kullanicilar
       WHERE email LIKE 'load.user.%@lawdesk.test'`,
    );

    await query(
      `INSERT INTO kullanicilar
         (adsoyad, email, sifrehash, rol, aktifmi,
          aktivasyonbekliyormu, emaildogrulamatarihi)
       SELECT 'Yük Kullanıcısı ' || LPAD(series::text, 3, '0'),
              'load.user.' || LPAD(series::text, 3, '0') ||
                '@lawdesk.test',
              $1,
              'kullanici',
              TRUE,
              FALSE,
              NOW()
       FROM generate_series(1, $2::int) AS series`,
      [passwordHash, userCount],
    );

    await query(
      `INSERT INTO grupuyelikleri (grupid, kullaniciid, gruprolu)
       SELECT group_record.grupid,
              user_account.kullaniciid,
              'grup_uyesi'
       FROM kullanicilar user_account
       JOIN gruplar group_record
         ON group_record.grupadi =
            CASE
              WHEN RIGHT(SPLIT_PART(user_account.email, '@', 1), 1)::int % 2 = 0
                THEN 'Uyum'
              ELSE 'KVKK'
            END
       WHERE user_account.email LIKE 'load.user.%@lawdesk.test'`,
    );

    await query(
      `WITH numbered_types AS (
         SELECT tipid,
                grupid,
                ROW_NUMBER() OVER (ORDER BY tipid) AS row_number,
                COUNT(*) OVER () AS total
         FROM gorevtipleri
         WHERE aktifmi = TRUE
       )
       INSERT INTO gorevler
         (baslik, aciklama, tipid, oncelik, durum, bitistarihi,
          atanangrupid, gorunurluktipi, gorunurlukgrupid,
          olusturankullaniciid)
       SELECT 'Yük testi görevi ' || LPAD(series::text, 4, '0'),
              'Otomatik yük testi veri seti',
              task_type.tipid,
              (ARRAY['Kritik', 'Yuksek', 'Orta', 'Dusuk'])[
                ((series - 1) % 4) + 1
              ],
              (ARRAY['Yeni Atandi', 'Devam Ediyor', 'Beklemede'])[
                ((series - 1) % 3) + 1
              ],
              NOW() + (((series - 1) % 30) + 1) * INTERVAL '1 day',
              task_type.grupid,
              'Grup',
              task_type.grupid,
              creator.kullaniciid
       FROM generate_series(1, $1::int) AS series
       JOIN numbered_types task_type
         ON task_type.row_number = ((series - 1) % task_type.total) + 1
       JOIN LATERAL (
         SELECT user_account.kullaniciid
         FROM kullanicilar user_account
         JOIN grupuyelikleri membership
           ON membership.kullaniciid = user_account.kullaniciid
          AND membership.grupid = task_type.grupid
         WHERE user_account.email LIKE 'load.user.%@lawdesk.test'
         ORDER BY user_account.kullaniciid
         LIMIT 1
       ) creator ON TRUE`,
      [taskCount],
    );
  });

  console.log(
    `Load test seed completed: ${userCount} users, ${taskCount} tasks.`,
  );
};

seed()
  .catch((error) => {
    console.error(`Load test seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
