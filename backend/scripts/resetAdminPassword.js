const argon2 = require("argon2");
const db = require("../config/db");

const resetAdminPassword = async () => {
  const email =
    process.env.RESET_ADMIN_EMAIL
      ?.trim()
      .toLowerCase();

  const password =
    process.env.RESET_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "RESET_ADMIN_EMAIL and RESET_ADMIN_PASSWORD are required",
    );
  }

  if (email.length > 150) {
    throw new Error(
      "RESET_ADMIN_EMAIL is too long",
    );
  }

  if (password.length < 12 || password.length > 256) {
    throw new Error(
      "RESET_ADMIN_PASSWORD must be between 12 and 256 characters",
    );
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  const result = await db.query(
    `UPDATE kullanicilar
     SET sifrehash = $1
     WHERE LOWER(email) = LOWER($2)
       AND rol = 'admin'
       AND aktifmi = TRUE
     RETURNING kullaniciid`,
    [passwordHash, email],
  );

  if (result.rowCount !== 1) {
    throw new Error(
      "Active admin account was not found",
    );
  }

  console.log(
    "Admin password reset successfully",
  );
};

resetAdminPassword()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());