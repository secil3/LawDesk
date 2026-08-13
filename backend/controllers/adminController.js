const argon2 = require("argon2");
const db = require("../config/db");

const publicUser = (user) => ({
  id: user.kullaniciid,
  adSoyad: user.adsoyad,
  email: user.email,
  rol: user.rol,
  groups: user.groups || [],
});

const normalizeGroupRole = (value) => {
  if (value === "uye") {
    return "grup_uyesi";
  }

  if (value === "yonetici") {
    return "grup_yoneticisi";
  }

  return value;
};

const normalizeText = (value, maxLength) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

exports.listGroups = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT grupid AS "id",
              grupadi AS "name",
              aciklama AS "description"
       FROM gruplar
       ORDER BY grupadi ASC`,
    );

    return res.json({
      groups: result.rows,
    });
  } catch (error) {
    console.error("List groups failed:", error);

    return res.status(500).json({
      error: "Grup listesi getirilemedi",
    });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT k.kullaniciid AS "id",
              k.adsoyad AS "adSoyad",
              k.email,
              k.rol,
              k.aktifmi AS "aktifMi",
              COALESCE(
                json_agg(
                  json_build_object(
                    'grupId', gu.grupid,
                    'grupAdi', g.grupadi,
                    'grupRolu', gu.gruprolu
                  )
                ) FILTER (
                  WHERE gu.grupid IS NOT NULL
                ),
                '[]'::json
              ) AS groups
       FROM kullanicilar k
       LEFT JOIN grupuyelikleri gu
         ON gu.kullaniciid = k.kullaniciid
       LEFT JOIN gruplar g
         ON g.grupid = gu.grupid
       WHERE k.rol IN ('kullanici', 'yonetici')
         AND k.silindimi = FALSE
       GROUP BY k.kullaniciid,
                k.adsoyad,
                k.email,
                k.rol,
                k.aktifmi
       ORDER BY k.kullaniciid ASC`,
    );

    return res.json({
      users: result.rows.map((user) => ({
        id: user.id,
        adSoyad: user.adSoyad,
        email: user.email,
        rol: user.rol,
        aktifMi: user.aktifMi,
        groups: Array.isArray(user.groups)
          ? user.groups
          : [],
      })),
    });
  } catch (error) {
    console.error("List users failed:", error);

    return res.status(500).json({
      error: "Kullanıcı listesi getirilemedi",
    });
  }
};

exports.deleteUser = async (req, res) => {
  const userId = Number(req.params?.id);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      error: "Geçersiz kullanıcı id",
    });
  }

  try {
    const result = await db.query(
      `UPDATE kullanicilar
       SET silindimi = TRUE,
           silinmetarihi = NOW(),
           aktifmi = FALSE
       WHERE kullaniciid = $1
         AND rol IN ('kullanici', 'yonetici')
         AND silindimi = FALSE
       RETURNING kullaniciid AS "id",
                 email,
                 silindimi AS "silindiMi",
                 silinmetarihi AS "silinmeTarihi"`,
      [userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error:
          "Arşivlenecek kullanıcı bulunamadı veya bu hesap arşivlenemez",
      });
    }

    return res.json({
      archivedUserId: result.rows[0].id,
      message: "Kullanıcı arşivlendi",
    });
  } catch (error) {
    console.error("Archive user failed:", error);

    return res.status(500).json({
      error: "Kullanıcı arşivlenemedi",
    });
  }
};

exports.updateUserActive = async (req, res) => {
  const userId = Number(req.params?.id);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      error: "Geçersiz kullanıcı id",
    });
  }

  const aktifMi = typeof req.body?.aktifMi === "boolean" ? req.body.aktifMi : null;

  if (aktifMi === null) {
    return res.status(400).json({
      error: "aktifMi alanı boolean olmalıdır",
    });
  }

  try {
    const result = await db.query(
      `UPDATE kullanicilar
       SET aktifmi = $1
       WHERE kullaniciid = $2
         AND rol IN ('kullanici', 'yonetici')
         AND silindimi = FALSE
       RETURNING kullaniciid AS "id", email, aktifmi`,
      [aktifMi, userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Güncellenecek kullanıcı bulunamadı veya yetkisiz işlem",
      });
    }

    return res.json({
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        aktifMi: result.rows[0].aktifmi,
      },
      message: "Kullanıcı güncellendi",
    });
  } catch (error) {
    console.error("Update user active failed:", error);
    return res.status(500).json({
      error: "Kullanıcı durumu güncellenemedi",
    });
  }
};

exports.createUser = async (req, res) => {
  const adSoyad = normalizeText(req.body?.adSoyad, 150);
  const email = normalizeText(
    req.body?.email,
    150,
  ).toLowerCase();

  const password =
    typeof req.body?.password === "string"
      ? req.body.password
      : "";

  const roleMode =
    typeof req.body?.roleMode === "string"
      ? req.body.roleMode.trim()
      : "";

  const allowedRoleModes = [
    "kullanici",
    "grup_uyesi",
    "grup_yoneticisi",
    "yonetici",
  ];

  if (!allowedRoleModes.includes(roleMode)) {
    return res.status(400).json({
      error: "Geçerli bir kullanıcı tipi seçiniz",
    });
  }

  const rol =
    roleMode === "yonetici"
      ? "yonetici"
      : "kullanici";

  const aktifMi = req.body?.aktifMi !== false;
  const grupIdsRaw = req.body?.grupIds;

  const grupIds = Array.isArray(grupIdsRaw)
    ? [
        ...new Set(
          grupIdsRaw
            .map((value) => Number(value))
            .filter(
              (value) =>
                Number.isInteger(value) && value > 0,
            ),
        ),
      ]
    : [];

  const isGroupRole = [
    "grup_uyesi",
    "grup_yoneticisi",
  ].includes(roleMode);

  const grupRolu = isGroupRole
    ? normalizeGroupRole(roleMode)
    : null;

  if (isGroupRole && grupIds.length === 0) {
    return res.status(400).json({
      error:
        "Grup üyeleri ve grup yöneticileri için en az bir grup seçimi zorunludur",
    });
  }

  if (!adSoyad || !email || !password) {
    return res.status(400).json({
      error: "Ad soyad, e-posta ve şifre zorunludur",
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: "Geçerli bir e-posta adresi giriniz",
    });
  }

  if (password.length < 8 || password.length > 256) {
    return res.status(400).json({
      error: "Şifre en az 8 karakter olmalıdır",
    });
  }

  try {
    const sifreHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });

    const transactionResult =
      await db.withTransaction(
        async (transactionQuery) => {
          let selectedGroups = [];

          if (isGroupRole) {
            const groupsResult =
              await transactionQuery(
                `SELECT grupid AS "grupId",
                        grupadi AS "grupAdi"
                 FROM gruplar
                 WHERE grupid = ANY($1::int[])
                 ORDER BY grupid`,
                [grupIds],
              );

            selectedGroups = groupsResult.rows;

            if (
              selectedGroups.length !== grupIds.length
            ) {
              const invalidGroupError = new Error(
                "Invalid group selection",
              );

              invalidGroupError.statusCode = 400;
              throw invalidGroupError;
            }
          }

          const insertUserResult =
            await transactionQuery(
              `INSERT INTO kullanicilar
                 (adsoyad, email, sifrehash, rol, aktifmi)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING kullaniciid,
                         adsoyad,
                         email,
                         rol,
                         aktifmi`,
              [
                adSoyad,
                email,
                sifreHash,
                rol,
                aktifMi,
              ],
            );

          const createdUser =
            insertUserResult.rows[0];

          if (!createdUser) {
            throw new Error(
              "User insert did not return a created row",
            );
          }

          for (const group of selectedGroups) {
            await transactionQuery(
              `INSERT INTO grupuyelikleri
                 (grupid, kullaniciid, gruprolu)
               VALUES ($1, $2, $3)`,
              [
                group.grupId,
                createdUser.kullaniciid,
                grupRolu,
              ],
            );
          }

          return {
            createdUser,
            userGroups: selectedGroups.map(
              (group) => ({
                grupId: group.grupId,
                grupAdi: group.grupAdi,
                grupRolu,
              }),
            ),
          };
        },
      );

    return res.status(201).json({
      user: publicUser({
        ...transactionResult.createdUser,
        groups: transactionResult.userGroups,
      }),
      message: "Kullanıcı hesabı oluşturuldu",
    });
  } catch (error) {
    if (error?.statusCode === 400) {
      return res.status(400).json({
        error:
          "Seçilen gruplardan biri bulunamadı",
      });
    }

    if (error?.code === "23505") {
      return res.status(409).json({
        error:
          "Bu e-posta adresi ile daha önce kayıt oluşturulmuş",
      });
    }

    console.error("User creation failed:", error);

    return res.status(500).json({
      error: "Kullanıcı oluşturulamadı",
    });
  }
};