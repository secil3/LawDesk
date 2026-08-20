const argon2 = require("argon2");
const db = require("../config/db");

const ALLOWED_GROUP_ROLES = new Set([
  "grup_uyesi",
  "grup_yoneticisi",
]);

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

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseMemberships = (value) => {
  if (!Array.isArray(value)) {
    throw createHttpError(400, "memberships alanı dizi olmalıdır");
  }

  const seenGroupIds = new Set();

  return value.map((membership) => {
    const groupId = Number(membership?.grupId);
    const groupRole = normalizeGroupRole(membership?.grupRolu);

    if (!Number.isInteger(groupId) || groupId < 1) {
      throw createHttpError(400, "Geçerli bir grup seçiniz");
    }

    if (!ALLOWED_GROUP_ROLES.has(groupRole)) {
      throw createHttpError(400, "Geçerli bir grup rolü seçiniz");
    }

    if (seenGroupIds.has(groupId)) {
      throw createHttpError(400, "Aynı grup birden fazla kez seçilemez");
    }

    seenGroupIds.add(groupId);

    return {
      groupId,
      groupRole,
    };
  });
};

const membershipSummary = (memberships) => {
  if (!Array.isArray(memberships) || memberships.length === 0) {
    return "grup ataması yok";
  }

  return memberships
    .map(
      (membership) =>
        `${membership.grupAdi} (${membership.grupRolu})`,
    )
    .join(", ");
};

const recordUserActivity = async (
  query,
  { actor, action, detail },
) => {
  await query(
    `INSERT INTO aktiviteloglari
       (kullaniciid, gorevid, islem, detay)
     VALUES ($1, NULL, $2, $3)`,
    [actor.id, action, detail],
  );
};

exports.listGroups = async (req, res) => {
  const isSystemViewer = ["admin", "yonetici"].includes(req.user?.rol);
  const visibleGroupIds = Array.isArray(req.user?.groups)
    ? req.user.groups
        .map((group) => Number(group.grupId))
        .filter((groupId) => Number.isInteger(groupId) && groupId > 0)
    : [];

  try {
    let query = `
      SELECT g.grupid AS "id",
             g.grupadi AS "name",
             g.aciklama AS "description",
             COUNT(gu.grupuyelikid) FILTER (
               WHERE member.silindimi = FALSE
             )::int AS "memberCount",
             COUNT(gu.grupuyelikid) FILTER (
               WHERE gu.gruprolu = 'grup_yoneticisi'
                 AND member.silindimi = FALSE
             )::int AS "managerCount"
      FROM gruplar g
      LEFT JOIN grupuyelikleri gu
        ON gu.grupid = g.grupid
      LEFT JOIN kullanicilar member
        ON member.kullaniciid = gu.kullaniciid`;

    const params = [];

    if (!isSystemViewer) {
      if (visibleGroupIds.length === 0) {
        return res.json({ groups: [] });
      }

      query += ` WHERE g.grupid = ANY($1::int[])`;
      params.push([...new Set(visibleGroupIds)]);
    }

    query += ` GROUP BY g.grupid, g.grupadi, g.aciklama ORDER BY g.grupadi ASC`;

    const result = await db.query(query, params);

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

exports.createGroup = async (req, res) => {
  const name = normalizeText(req.body?.name, 100);
  const description = normalizeText(req.body?.description, 500);

  if (!name) {
    return res.status(400).json({
      error: "Grup adı zorunludur",
    });
  }

  try {
    const group = await db.withTransaction(async (transactionQuery) => {
      const duplicateResult = await transactionQuery(
        `SELECT grupid
         FROM gruplar
         WHERE LOWER(grupadi) = LOWER($1)`,
        [name],
      );

      if (duplicateResult.rows[0]) {
        throw createHttpError(409, "Bu grup adı zaten kullanılıyor");
      }

      const insertResult = await transactionQuery(
        `INSERT INTO gruplar (grupadi, aciklama)
         VALUES ($1, $2)
         RETURNING grupid AS "id",
                   grupadi AS "name",
                   aciklama AS "description"`,
        [name, description || null],
      );

      const createdGroup = insertResult.rows[0];

      await recordUserActivity(transactionQuery, {
        actor: req.user,
        action: "GrupOlusturma",
        detail: `${req.user.adSoyad}, "${createdGroup.name}" grubunu oluşturdu.`,
      });

      return {
        ...createdGroup,
        memberCount: 0,
        managerCount: 0,
      };
    });

    return res.status(201).json({
      group,
      message: "Grup oluşturuldu",
    });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    if (error?.code === "23505") {
      return res.status(409).json({
        error: "Bu grup adı zaten kullanılıyor",
      });
    }

    console.error("Create group failed:", error);

    return res.status(500).json({
      error: "Grup oluşturulamadı",
    });
  }
};

exports.updateGroup = async (req, res) => {
  const groupId = Number(req.params?.id);
  const name = normalizeText(req.body?.name, 100);
  const description = normalizeText(req.body?.description, 500);

  if (!Number.isInteger(groupId) || groupId < 1) {
    return res.status(400).json({
      error: "Geçersiz grup id",
    });
  }

  if (!name) {
    return res.status(400).json({
      error: "Grup adı zorunludur",
    });
  }

  try {
    const group = await db.withTransaction(async (transactionQuery) => {
      const currentResult = await transactionQuery(
        `SELECT grupid AS "id",
                grupadi AS "name",
                aciklama AS "description"
         FROM gruplar
         WHERE grupid = $1
         FOR UPDATE`,
        [groupId],
      );

      const currentGroup = currentResult.rows[0];

      if (!currentGroup) {
        throw createHttpError(404, "Güncellenecek grup bulunamadı");
      }

      const nextDescription = description || null;

      if (
        currentGroup.name === name &&
        (currentGroup.description || null) === nextDescription
      ) {
        throw createHttpError(409, "Grup bilgilerinde değişiklik yapılmadı");
      }

      const duplicateResult = await transactionQuery(
        `SELECT grupid
         FROM gruplar
         WHERE LOWER(grupadi) = LOWER($1)
           AND grupid <> $2`,
        [name, groupId],
      );

      if (duplicateResult.rows[0]) {
        throw createHttpError(409, "Bu grup adı zaten kullanılıyor");
      }

      const updateResult = await transactionQuery(
        `UPDATE gruplar
         SET grupadi = $1,
             aciklama = $2
         WHERE grupid = $3
         RETURNING grupid AS "id",
                   grupadi AS "name",
                   aciklama AS "description"`,
        [name, nextDescription, groupId],
      );

      const updatedGroup = updateResult.rows[0];

      await recordUserActivity(transactionQuery, {
        actor: req.user,
        action: "GrupGuncelleme",
        detail:
          `${req.user.adSoyad}, "${currentGroup.name}" grubunun ` +
          `bilgilerini güncelledi. Yeni adı: "${updatedGroup.name}".`,
      });

      return updatedGroup;
    });

    return res.json({
      group,
      message: "Grup bilgileri güncellendi",
    });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    if (error?.code === "23505") {
      return res.status(409).json({
        error: "Bu grup adı zaten kullanılıyor",
      });
    }

    console.error("Update group failed:", error);

    return res.status(500).json({
      error: "Grup bilgileri güncellenemedi",
    });
  }
};

exports.listUsers = async (req, res) => {
  const archived = req.query?.archived === "true";

  try {
    const result = await db.query(
      `SELECT k.kullaniciid AS "id",
              k.adsoyad AS "adSoyad",
              k.email,
              k.rol,
              k.aktifmi AS "aktifMi",
              k.silinmetarihi AS "archivedAt",
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
         AND k.silindimi = $1::boolean
       GROUP BY k.kullaniciid,
                k.adsoyad,
                k.email,
                k.rol,
                k.aktifmi,
                k.silinmetarihi
       ORDER BY k.kullaniciid ASC`,
      [archived],
    );

    return res.json({
      users: result.rows.map((user) => ({
        id: user.id,
        adSoyad: user.adSoyad,
        email: user.email,
        rol: user.rol,
        aktifMi: user.aktifMi,
        archivedAt: user.archivedAt,
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

exports.updateUserMemberships = async (req, res) => {
  const userId = Number(req.params?.id);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      error: "Geçersiz kullanıcı id",
    });
  }

  let memberships;

  try {
    memberships = parseMemberships(req.body?.memberships);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      error: error.message,
    });
  }

  try {
    const updatedUser = await db.withTransaction(
      async (transactionQuery) => {
        const userResult = await transactionQuery(
          `SELECT kullaniciid AS "id",
                  adsoyad AS "adSoyad",
                  email,
                  rol
           FROM kullanicilar
           WHERE kullaniciid = $1
             AND rol IN ('kullanici', 'yonetici')
             AND silindimi = FALSE
           FOR UPDATE`,
          [userId],
        );

        const targetUser = userResult.rows[0];

        if (!targetUser) {
          throw createHttpError(404, "Güncellenecek kullanıcı bulunamadı");
        }

        const currentResult = await transactionQuery(
          `SELECT gu.grupid AS "grupId",
                  g.grupadi AS "grupAdi",
                  gu.gruprolu AS "grupRolu"
           FROM grupuyelikleri gu
           JOIN gruplar g
             ON g.grupid = gu.grupid
           WHERE gu.kullaniciid = $1
           ORDER BY gu.grupid`,
          [userId],
        );

        let selectedGroups = [];

        if (memberships.length > 0) {
          const groupIds = memberships.map(
            (membership) => membership.groupId,
          );
          const groupsResult = await transactionQuery(
            `SELECT grupid AS "grupId",
                    grupadi AS "grupAdi"
             FROM gruplar
             WHERE grupid = ANY($1::int[])
             ORDER BY grupid`,
            [groupIds],
          );

          if (groupsResult.rows.length !== groupIds.length) {
            throw createHttpError(
              400,
              "Seçilen gruplardan biri bulunamadı",
            );
          }

          const groupsById = new Map(
            groupsResult.rows.map((group) => [
              Number(group.grupId),
              group,
            ]),
          );

          selectedGroups = memberships.map((membership) => ({
            grupId: membership.groupId,
            grupAdi: groupsById.get(membership.groupId).grupAdi,
            grupRolu: membership.groupRole,
          }));
        }

        const currentKey = currentResult.rows
          .map(
            (membership) =>
              `${Number(membership.grupId)}:${membership.grupRolu}`,
          )
          .sort()
          .join("|");
        const nextKey = selectedGroups
          .map(
            (membership) =>
              `${Number(membership.grupId)}:${membership.grupRolu}`,
          )
          .sort()
          .join("|");

        if (currentKey === nextKey) {
          throw createHttpError(
            409,
            "Kullanıcının grup üyeliklerinde değişiklik yapılmadı",
          );
        }

        await transactionQuery(
          `DELETE FROM grupuyelikleri
           WHERE kullaniciid = $1`,
          [userId],
        );

        for (const membership of selectedGroups) {
          await transactionQuery(
            `INSERT INTO grupuyelikleri
               (grupid, kullaniciid, gruprolu)
             VALUES ($1, $2, $3)`,
            [membership.grupId, userId, membership.grupRolu],
          );
        }

        await recordUserActivity(transactionQuery, {
          actor: req.user,
          action: "KullaniciGrupUyelikleriDegisikligi",
          detail:
            `${req.user.adSoyad}, ${targetUser.adSoyad} kullanıcısının ` +
            `grup üyeliklerini "${membershipSummary(currentResult.rows)}" ` +
            `değerinden "${membershipSummary(selectedGroups)}" değerine değiştirdi.`,
        });

        return {
          ...targetUser,
          groups: selectedGroups,
        };
      },
    );

    return res.json({
      user: updatedUser,
      message: "Kullanıcının grup üyelikleri güncellendi",
    });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    console.error("Update user memberships failed:", error);

    return res.status(500).json({
      error: "Kullanıcının grup üyelikleri güncellenemedi",
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
    const archivedUser = await db.withTransaction(
      async (transactionQuery) => {
        const result = await transactionQuery(
          `UPDATE kullanicilar
           SET silindimi = TRUE,
               silinmetarihi = NOW(),
               aktifmi = FALSE
           WHERE kullaniciid = $1
             AND rol IN ('kullanici', 'yonetici')
             AND silindimi = FALSE
           RETURNING kullaniciid AS "id",
                     adsoyad AS "adSoyad",
                     email,
                     silindimi AS "silindiMi",
                     silinmetarihi AS "silinmeTarihi"`,
          [userId],
        );

        if (result.rowCount === 0) {
          const notFoundError = new Error(
            "Arşivlenecek kullanıcı bulunamadı veya bu hesap arşivlenemez",
          );
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const targetUser = result.rows[0];

        await recordUserActivity(transactionQuery, {
          actor: req.user,
          action: "KullaniciArsivleme",
          detail:
            `${req.user.adSoyad}, ${targetUser.adSoyad} ` +
            `(${targetUser.email}) kullanıcısını arşivledi.`,
        });

        return targetUser;
      },
    );

    return res.json({
      archivedUserId: archivedUser.id,
      message: "Kullanıcı arşivlendi",
    });
  } catch (error) {
    if (error?.statusCode === 404) {
      return res.status(404).json({
        error: error.message,
      });
    }

    console.error("Archive user failed:", error);

    return res.status(500).json({
      error: "Kullanıcı arşivlenemedi",
    });
  }
};

exports.restoreUser = async (req, res) => {
  const userId = Number(req.params?.id);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      error: "Geçersiz kullanıcı id",
    });
  }

  try {
    const restoredUser = await db.withTransaction(
      async (transactionQuery) => {
        const result = await transactionQuery(
          `UPDATE kullanicilar
           SET silindimi = FALSE,
               silinmetarihi = NULL,
               aktifmi = FALSE
           WHERE kullaniciid = $1
             AND rol IN ('kullanici', 'yonetici')
             AND silindimi = TRUE
           RETURNING kullaniciid AS "id",
                     adsoyad AS "adSoyad",
                     email,
                     rol,
                     aktifmi AS "aktifMi"`,
          [userId],
        );

        if (result.rowCount === 0) {
          const notFoundError = new Error(
            "Geri yüklenecek kullanıcı bulunamadı",
          );
          notFoundError.statusCode = 404;
          throw notFoundError;
        }

        const targetUser = result.rows[0];

        await recordUserActivity(transactionQuery, {
          actor: req.user,
          action: "KullaniciGeriYukleme",
          detail:
            `${req.user.adSoyad}, ${targetUser.adSoyad} ` +
            `(${targetUser.email}) kullanıcısını pasif olarak geri yükledi.`,
        });

        return targetUser;
      },
    );

    return res.json({
      user: restoredUser,
      message: "Kullanıcı pasif olarak geri yüklendi",
    });
  } catch (error) {
    if (error?.statusCode === 404) {
      return res.status(404).json({
        error: error.message,
      });
    }

    console.error("Restore user failed:", error);

    return res.status(500).json({
      error: "Kullanıcı geri yüklenemedi",
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
