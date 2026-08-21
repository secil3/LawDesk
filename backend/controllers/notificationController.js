const db = require("../config/db");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendError = (res, error, fallbackMessage) => {
  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({
      error: error.message,
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({
    error: fallbackMessage,
  });
};

const normalizePositiveInteger = (value, fallback) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const parsePositiveId = (value, message) => {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw createHttpError(400, message);
  }

  return parsed;
};

// Shared helper: other controllers call this (like recordActivity) to notify a user, without duplicating the insert.
const createNotification = async (
  query,
  { userId, taskId = null, type, message },
) => {
  const targetUserId = Number(userId);

  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    return;
  }

  await query(
    `INSERT INTO bildirimler
       (kullaniciid, gorevid, bildirimtipi, mesaj)
     VALUES ($1, $2, $3, $4)`,
    [targetUserId, taskId, type, message],
  );
};

exports.createNotification = createNotification;

exports.listNotifications = async (req, res) => {
  try {
    const page = normalizePositiveInteger(req.query?.page, DEFAULT_PAGE);
    const requestedLimit = normalizePositiveInteger(
      req.query?.limit,
      DEFAULT_LIMIT,
    );
    const limit = Math.min(requestedLimit, MAX_PAGE_LIMIT);
    const offset = (page - 1) * limit;
    const unreadOnly = req.query?.unread === "true";

    const whereSql = unreadOnly
      ? `WHERE b.kullaniciid = $1 AND b.okundumu = FALSE`
      : `WHERE b.kullaniciid = $1`;

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS "total"
       FROM bildirimler b
       ${whereSql}`,
      [req.user.id],
    );

    const listResult = await db.query(
      `SELECT b.bildirimid AS "id",
              b.gorevid AS "taskId",
              task.baslik AS "taskTitle",
              b.bildirimtipi AS "type",
              b.mesaj AS "message",
              b.okundumu AS "read",
              b.olusturmatarihi AS "createdAt"
       FROM bildirimler b
       LEFT JOIN gorevler task
         ON task.gorevid = b.gorevid
       ${whereSql}
       ORDER BY b.olusturmatarihi DESC, b.bildirimid DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset],
    );

    const total = Number(countResult.rows[0]?.total || 0);

    return res.json({
      notifications: listResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    return sendError(res, error, "Bildirimler getirilemedi");
  }
};

exports.getUnreadNotificationCount = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*)::int AS "total"
       FROM bildirimler
       WHERE kullaniciid = $1
         AND okundumu = FALSE`,
      [req.user.id],
    );

    return res.json({
      unreadCount: Number(result.rows[0]?.total || 0),
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Okunmamış bildirim sayısı getirilemedi",
    );
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const notificationId = parsePositiveId(
      req.params?.id,
      "Geçersiz bildirim id",
    );

    const result = await db.query(
      `UPDATE bildirimler
       SET okundumu = TRUE
       WHERE bildirimid = $1
         AND kullaniciid = $2
       RETURNING bildirimid AS "id",
                 gorevid AS "taskId",
                 bildirimtipi AS "type",
                 mesaj AS "message",
                 okundumu AS "read",
                 olusturmatarihi AS "createdAt"`,
      [notificationId, req.user.id],
    );

    const notification = result.rows[0];

    if (!notification) {
      throw createHttpError(404, "Bildirim bulunamadı");
    }

    return res.json({
      notification,
      message: "Bildirim okundu olarak işaretlendi",
    });
  } catch (error) {
    return sendError(res, error, "Bildirim güncellenemedi");
  }
};
