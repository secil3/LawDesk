const express = require("express");

const {
  archiveTask,
  createTask,
  getTaskOptions,
  listActivityLogs,
  listTasks,
  restoreTask,
  updateTask,
  updateTaskAssignment,
  updateTaskDueDate,
  updateTaskStatus,
} = require("../controllers/taskController");

const {
  getDashboardSummary,
} = require("../controllers/dashboardController");

const {
  authorizeAttachmentUpload,
  createTaskAttachment,
  downloadTaskAttachment,
  listTaskAttachments,
  removeTaskAttachment,
} = require("../controllers/attachmentController");

const {
  uploadSingleAttachment,
} = require("../middleware/taskAttachmentUpload");

const {
  requireAuth,
  requireSystemRole,
} = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/dashboard-summary", getDashboardSummary);
router.get("/options", getTaskOptions);
router.get(
  "/activity",
  requireSystemRole("admin", "yonetici"),
  listActivityLogs,
);
router.get("/", listTasks);
router.post("/", createTask);
router.get("/:id/attachments", listTaskAttachments);
router.post(
  "/:id/attachments",
  authorizeAttachmentUpload,
  uploadSingleAttachment,
  createTaskAttachment,
);
router.get(
  "/:id/attachments/:attachmentId/download",
  downloadTaskAttachment,
);
router.delete(
  "/:id/attachments/:attachmentId",
  removeTaskAttachment,
);
router.patch("/:id", updateTask);
router.patch("/:id/assignment", updateTaskAssignment);
router.patch("/:id/due-date", updateTaskDueDate);
router.patch("/:id/restore", restoreTask);
router.patch("/:id/status", updateTaskStatus);
router.delete("/:id", archiveTask);

module.exports = router;
