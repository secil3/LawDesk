const db = require("../config/db");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const MAX_EXPORT_ROWS = 5000;
const ISTANBUL_TIME_ZONE = "Europe/Istanbul";

const ACTIVITY_LABELS = {
  GorevOlusturma: "Görev oluşturma",
  GorevAtama: "Görev atama",
  DurumDegisikligi: "Durum değişikliği",
  GorevArsivleme: "Görev arşivleme",
  GorevGeriYukleme: "Görev geri yükleme",
  GorevBilgileriDegisikligi: "Görev bilgileri değişikliği",
  BitisTarihiDegisikligi: "Bitiş tarihi değişikliği",
  KullaniciArsivleme: "Kullanıcı arşivleme",
  KullaniciGeriYukleme: "Kullanıcı geri yükleme",
  KullaniciGrupUyelikleriDegisikligi: "Kullanıcı üyelik değişikliği",
  GrupOlusturma: "Grup oluşturma",
  GrupGuncelleme: "Grup güncelleme",
  EkYukleme: "Ek yükleme",
  EkKaldirma: "Ek kaldırma",
  EkGeriYukleme: "Ek geri yükleme",
  YorumEkleme: "Yorum ekleme",
  YorumDuzenleme: "Yorum düzenleme",
  YorumArsivleme: "Yorum arşivleme",
  YorumGeriYukleme: "Yorum geri yükleme",
  EtiketOlusturma: "Etiket oluşturma",
  EtiketGuncelleme: "Etiket güncelleme",
  EtiketArsivleme: "Etiket arşivleme",
  EtiketGeriYukleme: "Etiket geri yükleme",
  GorevEtiketDegisikligi: "Görev etiketi değişikliği",
  AltGorevOlusturma: "Alt görev oluşturma",
  GorevTipiOlusturma: "Görev tipi oluşturma",
  GorevTipiGuncelleme: "Görev tipi güncelleme",
  GorevTipiArsivleme: "Görev tipi arşivleme",
  GorevTipiGeriYukleme: "Görev tipi geri yükleme",
  KayitTalebiOnaylama: "Kayıt talebi onaylama",
  KayitTalebiReddetme: "Kayıt talebi reddetme",
  KullaniciAktivasyonu: "Kullanıcı aktivasyonu",
};

const ACTIVITY_FROM_SQL = `
  FROM aktiviteloglari al
  LEFT JOIN kullanicilar actor
    ON actor.kullaniciid = al.kullaniciid
  LEFT JOIN gorevler task
    ON task.gorevid = al.gorevid
`;

const ACTIVITY_SELECT_SQL = `
  SELECT al.logid AS "id",
         al.islem AS "action",
         al.detay AS "detail",
         al.islemtarihi AS "createdAt",
         al.kullaniciid AS "actorId",
         actor.adsoyad AS "actorName",
         actor.email AS "actorEmail",
         al.gorevid AS "taskId",
         task.baslik AS "taskTitle"
`;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const canViewActivity = (user) => {
  return ["admin", "yonetici"].includes(user?.rol);
};

const normalizeSearchText = (value, maxLength) => {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  return normalized.length > maxLength
    ? normalized.slice(0, maxLength)
    : normalized;
};

const normalizePositiveInteger = (value, fallback) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const normalizeInstant = (value, label) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || value.length > 50) {
    throw createHttpError(400, `${label} geçerli değil`);
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, `${label} geçerli değil`);
  }

  return parsed.toISOString();
};

const buildActivityFilters = (query = {}) => {
  const actor = normalizeSearchText(query.actor, 150);
  const task = normalizeSearchText(query.task, 200).replace(/^#\s*/, "");
  const action = normalizeSearchText(query.action, 100);
  const from = normalizeInstant(query.from, "Başlangıç tarihi");
  const to = normalizeInstant(query.to, "Bitiş tarihi");

  if (from && to && new Date(from).getTime() >= new Date(to).getTime()) {
    throw createHttpError(
      400,
      "Bitiş tarihi başlangıç tarihinden sonra olmalıdır",
    );
  }

  const conditions = [];
  const params = [];

  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (actor) {
    const placeholder = addParam(`%${actor}%`);
    conditions.push(
      `(COALESCE(actor.adsoyad, '') ILIKE ${placeholder}
        OR COALESCE(actor.email, '') ILIKE ${placeholder})`,
    );
  }

  if (task) {
    const placeholder = addParam(`%${task}%`);
    conditions.push(
      `(COALESCE(task.baslik, '') ILIKE ${placeholder}
        OR COALESCE(al.gorevid::text, '') ILIKE ${placeholder})`,
    );
  }

  if (action) {
    const placeholder = addParam(action);
    conditions.push(`al.islem = ${placeholder}`);
  }

  if (from) {
    const placeholder = addParam(from);
    conditions.push(`al.islemtarihi >= ${placeholder}::timestamptz`);
  }

  if (to) {
    const placeholder = addParam(to);
    conditions.push(`al.islemtarihi < ${placeholder}::timestamptz`);
  }

  return {
    params,
    whereSql:
      conditions.length > 0
        ? `WHERE ${conditions.join("\n    AND ")}`
        : "",
  };
};

const sendError = (res, error, fallbackMessage) => {
  const statusCode = Number(error?.statusCode);

  if (Number.isInteger(statusCode) && statusCode >= 400) {
    return res.status(statusCode).json({ error: error.message });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({ error: fallbackMessage });
};

const csvCell = (value) => {
  let text = value === undefined || value === null ? "" : String(value);

  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
};

const formatCsvDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: ISTANBUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

const exportFileDate = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: ISTANBUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
};

const activityRowsSql = (filters, limitPlaceholder, offsetPlaceholder) => {
  const offsetClause = offsetPlaceholder
    ? `OFFSET ${offsetPlaceholder}`
    : "";

  return `${ACTIVITY_SELECT_SQL}
          ${ACTIVITY_FROM_SQL}
          ${filters.whereSql}
          ORDER BY al.islemtarihi DESC, al.logid DESC
          LIMIT ${limitPlaceholder}
          ${offsetClause}`;
};

exports.listActivityLogs = async (req, res) => {
  if (!canViewActivity(req.user)) {
    return res.status(403).json({
      error: "İşlem kayıtlarını görüntüleme yetkiniz bulunmuyor",
    });
  }

  try {
    const filters = buildActivityFilters(req.query);
    const page = normalizePositiveInteger(req.query?.page, DEFAULT_PAGE);
    const requestedLimit = normalizePositiveInteger(
      req.query?.limit,
      DEFAULT_LIMIT,
    );
    const limit = Math.min(requestedLimit, MAX_PAGE_LIMIT);

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS "total"
       ${ACTIVITY_FROM_SQL}
       ${filters.whereSql}`,
      filters.params,
    );
    const total = Number(countResult.rows[0]?.total) || 0;
    const offset = (page - 1) * limit;

    let rows = [];

    if (total > 0) {
      const dataParams = [...filters.params, limit, offset];
      const limitPlaceholder = `$${filters.params.length + 1}`;
      const offsetPlaceholder = `$${filters.params.length + 2}`;
      const result = await db.query(
        activityRowsSql(filters, limitPlaceholder, offsetPlaceholder),
        dataParams,
      );
      rows = result.rows;
    }

    return res.json({
      activity: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return sendError(res, error, "İşlem kayıtları getirilemedi");
  }
};

exports.exportActivityLogs = async (req, res) => {
  if (!canViewActivity(req.user)) {
    return res.status(403).json({
      error: "İşlem kayıtlarını dışa aktarma yetkiniz bulunmuyor",
    });
  }

  try {
    const filters = buildActivityFilters(req.query);
    const exportLimit = MAX_EXPORT_ROWS + 1;
    const params = [...filters.params, exportLimit];
    const limitPlaceholder = `$${filters.params.length + 1}`;
    const result = await db.query(
      activityRowsSql(filters, limitPlaceholder),
      params,
    );

    if (result.rows.length > MAX_EXPORT_ROWS) {
      throw createHttpError(
        422,
        `CSV dışa aktarma en fazla ${MAX_EXPORT_ROWS} kayıtla sınırlıdır. Filtreleri daraltın.`,
      );
    }

    const header = [
      "Kayıt No",
      "Tarih",
      "İşlem Türü",
      "İşlem Kodu",
      "Kullanıcı",
      "E-posta",
      "Görev No",
      "Görev Başlığı",
      "Detay",
    ];
    const lines = [
      header.map(csvCell).join(";"),
      ...result.rows.map((entry) =>
        [
          entry.id,
          formatCsvDate(entry.createdAt),
          ACTIVITY_LABELS[entry.action] || entry.action,
          entry.action,
          entry.actorName,
          entry.actorEmail,
          entry.taskId,
          entry.taskTitle,
          entry.detail,
        ].map(csvCell).join(";"),
      ),
    ];
    const csv = `\uFEFF${lines.join("\r\n")}\r\n`;

    res.set({
      "Cache-Control": "no-store",
      "Content-Disposition":
        `attachment; filename="lawdesk-denetim-izi-${exportFileDate()}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    });

    return res.status(200).send(csv);
  } catch (error) {
    return sendError(res, error, "Denetim izi dışa aktarılamadı");
  }
};
