const argon2 = require("argon2");
const db = require("../config/db");

const parseBoolean = (value) => String(value).toLowerCase() === "true";

const createInitialAdmin = async () => {
  const name =
    process.env.INITIAL_ADMIN_NAME?.trim();

  const email =
    process.env.INITIAL_ADMIN_EMAIL
      ?.trim()
      .toLowerCase();

  const password =
    process.env.INITIAL_ADMIN_PASSWORD;
  const emailOwnershipVerified = parseBoolean(
    process.env.INITIAL_ADMIN_EMAIL_VERIFIED,
  );

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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INITIAL_ADMIN_EMAIL must be a valid e-mail address");
  }

  if (process.env.NODE_ENV === "production" && !emailOwnershipVerified) {
    throw new Error(
      "INITIAL_ADMIN_EMAIL_VERIFIED must be true in production after " +
        "the institutional mailbox ownership is verified",
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
           aktifmi = TRUE,
           aktivasyonbekliyormu = FALSE,
           emaildogrulamatarihi =
             CASE WHEN $3::boolean THEN NOW() ELSE NULL END
       WHERE kullaniciid = $4`,
      [
        name,
        passwordHash,
        emailOwnershipVerified,
        user.kullaniciid,
      ],
    );

    console.log(
      "Initial admin placeholder updated successfully",
    );

    return;
  }

  await db.query(
    `INSERT INTO kullanicilar
       (adsoyad, email, sifrehash, rol, aktifmi,
        aktivasyonbekliyormu, emaildogrulamatarihi)
     VALUES (
       $1, $2, $3, 'admin', TRUE, FALSE,
       CASE WHEN $4::boolean THEN NOW() ELSE NULL END
     )`,
    [name, email, passwordHash, emailOwnershipVerified],
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
