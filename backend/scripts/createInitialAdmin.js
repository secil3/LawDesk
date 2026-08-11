const argon2 = require("argon2");
const db = require("../config/db");

const createInitialAdmin = async () => {
  const name =
    process.env.INITIAL_ADMIN_NAME?.trim();

  const email =
    process.env.INITIAL_ADMIN_EMAIL
      ?.trim()
      .toLowerCase();

  const password =
    process.env.INITIAL_ADMIN_PASSWORD;

  if (!name || !email || !password) {
    throw new Error(
      "INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL and " +
        "INITIAL_ADMIN_PASSWORD are required",
    );
  }

  if (name.length > 150 || email.length > 150) {
    throw new Error(
      "Admin name or e-mail is too long",
    );
  }

  if (password.length < 12 || password.length > 256) {
    throw new Error(
      "INITIAL_ADMIN_PASSWORD must be between 12 and 256 characters",
    );
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  const existing = await db.query(
    `SELECT kullaniciid, sifrehash
     FROM kullanicilar
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email],
  );

  if (existing.rowCount > 0) {
    const user = existing.rows[0];

    if (user.sifrehash !== "HASH_PLACEHOLDER") {
      throw new Error(
        "An account with this e-mail already exists",
      );
    }

    await db.query(
      `UPDATE kullanicilar
       SET adsoyad = $1,
           sifrehash = $2,
           rol = 'admin',
           aktifmi = TRUE
       WHERE kullaniciid = $3`,
      [name, passwordHash, user.kullaniciid],
    );

    console.log(
      "Initial admin placeholder updated successfully",
    );

    return;
  }

  await db.query(
    `INSERT INTO kullanicilar
       (adsoyad, email, sifrehash, rol, aktifmi)
     VALUES ($1, $2, $3, 'admin', TRUE)`,
    [name, email, passwordHash],
  );

  console.log(
    "Initial admin created successfully",
  );
};

createInitialAdmin()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());