const express = require("express");

const {
  getUnreadNotificationCount,
  listNotifications,
  markNotificationRead,
} = require("../controllers/notificationController");

const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/unread-count", getUnreadNotificationCount);
router.get("/", listNotifications);
router.patch("/:id/read", markNotificationRead);

module.exports = router;
