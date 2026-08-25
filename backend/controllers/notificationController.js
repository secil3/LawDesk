const db = require("../config/db");
const {
  taskAccessContextFor,
  taskReadableSql,
  taskVisibilitySql,
} = require("../services/taskAccess");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const TASK_VISIBILITY_SQL = taskVisibilitySql({
  alias: "visible_task",
  userIdParam: "$1",
  systemManagerParam: "$2",
  groupIdsParam: "$3",
  managedGroupIdsParam: "$4",
});

const TASK_READABLE_SQL = taskReadableSql({
  alias: "visible_task",
  systemManagerParam: "$2",
  managedGroupIdsParam: "$4",
  privilegedViewerParam: "$5",
});

const NOTIFICATION_VISIBILITY_SQL = `
  b.kullaniciid = $1
  AND (
    b.gorevid IS NULL
    OR EXISTS (
      SELECT 1
      FROM gorevler visible_task
      WHERE visible_task.gorevid = b.gorevid
        AND ${TASK_VISIBILITY_SQL}
        AND ${TASK_READABLE_SQL}
    )
  )
`;

const notificationAccessParams = (user) => {
  const context = taskAccessContextFor(user);

  return [
    context.userId,
    context.systemManager,
    context.groupIds,
    context.managedGroupIds,
    context.privilegedViewer,
  ];
};

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
  {
    userId,
    taskId = null,
    registrationRequestId = null,
    type,
    message,
  },
) => {
  const targetUserId = Number(userId);

  if (!Number.isInteger(targetUserId) || targetUserId < 1) {
    return;
  }

  await query(
    `INSERT INTO bildirimler
       (kullaniciid, gorevid, kayittalepid, bildirimtipi, mesaj)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      targetUserId,
      taskId,
      registrationRequestId,
      type,
      message,
    ],
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
    const accessParams = notificationAccessParams(req.user);

    const whereSql = unreadOnly
      ? `WHERE ${NOTIFICATION_VISIBILITY_SQL} AND b.okundumu = FALSE`
      : `WHERE ${NOTIFICATION_VISIBILITY_SQL}`;

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS "total"
       FROM bildirimler b
       ${whereSql}`,
      accessParams,
    );

    const listResult = await db.query(
      `SELECT b.bildirimid AS "id",
              b.gorevid AS "taskId",
              b.kayittalepid AS "registrationRequestId",
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
       LIMIT $6 OFFSET $7`,
      [...accessParams, limit, offset],
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
    const accessParams = notificationAccessParams(req.user);
    const result = await db.query(
      `SELECT COUNT(*)::int AS "total"
       FROM bildirimler b
       WHERE ${NOTIFICATION_VISIBILITY_SQL}
         AND b.okundumu = FALSE`,
      accessParams,
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
    const accessParams = notificationAccessParams(req.user);

    const result = await db.query(
      `UPDATE bildirimler b
       SET okundumu = TRUE
       WHERE b.bildirimid = $6
         AND ${NOTIFICATION_VISIBILITY_SQL}
       RETURNING b.bildirimid AS "id",
                 b.gorevid AS "taskId",
                 b.kayittalepid AS "registrationRequestId",
                 b.bildirimtipi AS "type",
                 b.mesaj AS "message",
                 b.okundumu AS "read",
                 b.olusturmatarihi AS "createdAt"`,
      [...accessParams, notificationId],
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
