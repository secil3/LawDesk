const db = require("../config/db");

const ALLOWED_GROUP_ROLES = new Set([
  "grup_uyesi",
  "grup_yoneticisi",
]);

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

const normalizePositiveInteger = (value, fallback) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const paginationFor = (requestedPage, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  const page = totalPages === 0
    ? 1
    : Math.min(requestedPage, totalPages);

  return {
    page,
    limit,
    total,
    totalPages,
  };
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
  const hasPagination =
    req.query?.page !== undefined || req.query?.limit !== undefined;
  const requestedPage = normalizePositiveInteger(req.query?.page, 1);
  const limit = Math.min(
    normalizePositiveInteger(req.query?.limit, 10),
    100,
  );
  const search = normalizeText(req.query?.q, 100);

  try {
    let query = `SELECT g.grupid AS "id",
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
    const conditions = [];

    if (!isSystemViewer) {
      if (visibleGroupIds.length === 0) {
        return res.json({
          groups: [],
          ...(hasPagination
            ? {
                pagination: {
                  page: 1,
                  limit,
                  total: 0,
                  totalPages: 0,
                },
              }
            : {}),
        });
      }

      params.push([...new Set(visibleGroupIds)]);
      conditions.push(`g.grupid = ANY($${params.length}::int[])`);
    }

    if (search) {
      params.push(`%${search}%`);
      conditions.push(
        `(g.grupadi ILIKE $${params.length} OR COALESCE(g.aciklama, '') ILIKE $${params.length})`,
      );
    }

    const whereSql = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    query += ` ${whereSql} GROUP BY g.grupid, g.grupadi, g.aciklama ORDER BY g.grupadi ASC`;

    if (!hasPagination) {
      const result = await db.query(query, params);

      return res.json({ groups: result.rows });
    }

    const countResult = await db.query(
       `SELECT COUNT(*)::int AS "total"
       FROM gruplar g
       ${whereSql}`,
      params,
    );
    const total = Number(countResult.rows[0]?.total || 0);
    const pagination = paginationFor(requestedPage, limit, total);
    const offset = (pagination.page - 1) * limit;
    const limitPlaceholder = `$${params.length + 1}`;
    const offsetPlaceholder = `$${params.length + 2}`;

    query += ` LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`;

    const result = await db.query(query, [...params, limit, offset]);

    return res.json({
      groups: result.rows,
      pagination,
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
         WHERE LOWER(BTRIM(grupadi)) = LOWER(BTRIM($1))`,
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
         WHERE LOWER(BTRIM(grupadi)) = LOWER(BTRIM($1))
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
  const hasPagination =
    req.query?.page !== undefined || req.query?.limit !== undefined;
  const requestedPage = normalizePositiveInteger(req.query?.page, 1);
  const limit = Math.min(
    normalizePositiveInteger(req.query?.limit, 10),
    100,
  );
  const search = normalizeText(req.query?.q, 100);

  try {
    const baseParams = [archived];
    let searchWhere = "";

    if (search) {
      baseParams.push(`%${search}%`);
      searchWhere = `AND (
        k.adsoyad ILIKE $2
        OR k.email ILIKE $2
        OR CASE k.rol
             WHEN 'yonetici' THEN 'yönetici yonetici'
             ELSE 'kullanıcı kullanici'
           END ILIKE $2
        OR EXISTS (
          SELECT 1
          FROM grupuyelikleri search_gu
          JOIN gruplar search_g
            ON search_g.grupid = search_gu.grupid
          WHERE search_gu.kullaniciid = k.kullaniciid
            AND search_g.grupadi ILIKE $2
        )
      )`;
    }

    const countResult = hasPagination
      ? await db.query(
          `SELECT COUNT(*)::int AS "total"
           FROM kullanicilar k
           WHERE k.rol IN ('kullanici', 'yonetici')
             AND k.silindimi = $1::boolean
             ${searchWhere}`,
          baseParams,
        )
      : null;
    const total = Number(countResult?.rows[0]?.total || 0);
    const pagination = hasPagination
      ? paginationFor(requestedPage, limit, total)
      : null;
    const offset = pagination ? (pagination.page - 1) * limit : 0;
    const limitPlaceholder = `$${baseParams.length + 1}`;
    const offsetPlaceholder = `$${baseParams.length + 2}`;
    const paginationSql = hasPagination
      ? `LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`
      : "";
    const queryParams = hasPagination
      ? [...baseParams, limit, offset]
      : baseParams;

    const result = await db.query(
      `SELECT k.kullaniciid AS "id",
              k.adsoyad AS "adSoyad",
              k.email,
              k.rol,
              k.aktifmi AS "aktifMi",
              k.aktivasyonbekliyormu AS "aktivasyonBekliyorMu",
              k.emaildogrulamatarihi AS "emailDogrulamaTarihi",
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
         ${searchWhere}
       GROUP BY k.kullaniciid,
                k.adsoyad,
                k.email,
                k.rol,
                k.aktifmi,
                k.aktivasyonbekliyormu,
                k.emaildogrulamatarihi,
                k.silinmetarihi
       ORDER BY k.kullaniciid ASC
       ${paginationSql}`,
      queryParams,
    );

    return res.json({
      users: result.rows.map((user) => ({
        id: user.id,
        adSoyad: user.adSoyad,
        email: user.email,
        rol: user.rol,
        aktifMi: user.aktifMi,
        aktivasyonBekliyorMu: user.aktivasyonBekliyorMu,
        emailDogrulamaTarihi: user.emailDogrulamaTarihi,
        archivedAt: user.archivedAt,
        groups: Array.isArray(user.groups)
          ? user.groups
          : [],
      })),
      ...(pagination ? { pagination } : {}),
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
    const updatedUser = await db.withTransaction(
      async (transactionQuery) => {
        const result = await transactionQuery(
          `UPDATE kullanicilar
           SET aktifmi = $1
           WHERE kullaniciid = $2
             AND rol IN ('kullanici', 'yonetici')
             AND silindimi = FALSE
             AND ($1::boolean = FALSE OR aktivasyonbekliyormu = FALSE)
           RETURNING kullaniciid AS "id",
                     adsoyad AS "adSoyad",
                     email,
                     aktifmi AS "aktifMi"`,
          [aktifMi, userId],
        );

        if (result.rowCount === 0) {
          throw createHttpError(
            409,
            "Kullanıcı bulunamadı veya aktivasyon tamamlanmadan aktif edilemez",
          );
        }

        const targetUser = result.rows[0];
        const action = aktifMi
          ? "KullaniciAktiflestirme"
          : "KullaniciPasiflestirme";

        await recordUserActivity(transactionQuery, {
          actor: req.user,
          action,
          detail:
            `${req.user.adSoyad}, ${targetUser.adSoyad} ` +
            `(${targetUser.email}) kullanıcısını ` +
            `${aktifMi ? "aktif" : "pasif"} duruma getirdi.`,
        });

        return targetUser;
      },
    );

    return res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        aktifMi: updatedUser.aktifMi,
      },
      message: "Kullanıcı güncellendi",
    });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    console.error("Update user active failed:", error);
    return res.status(500).json({
      error: "Kullanıcı durumu güncellenemedi",
    });
  }
};
