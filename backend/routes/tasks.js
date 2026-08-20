const express = require("express");

const {
  archiveTask,
  createTask,
  getTaskById,
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
  restoreTaskAttachment,
} = require("../controllers/attachmentController");

const {
  archiveTaskComment,
  createTaskComment,
  listTaskCommentHistory,
  listTaskComments,
  restoreTaskComment,
  updateTaskComment,
} = require("../controllers/commentController");

const {
  archiveTag,
  createTag,
  listTags,
  listTaskTags,
  replaceTaskTags,
  restoreTag,
  updateTag,
} = require("../controllers/tagController");

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
router.get("/tags", listTags);
router.post(
  "/tags",
  requireSystemRole("admin", "yonetici"),
  createTag,
);
router.patch(
  "/tags/:tagId/restore",
  requireSystemRole("admin", "yonetici"),
  restoreTag,
);
router.patch(
  "/tags/:tagId",
  requireSystemRole("admin", "yonetici"),
  updateTag,
);
router.delete(
  "/tags/:tagId",
  requireSystemRole("admin", "yonetici"),
  archiveTag,
);
router.get(
  "/activity",
  requireSystemRole("admin", "yonetici"),
  listActivityLogs,
);
router.get("/", listTasks);
router.get("/:id", getTaskById);
router.post("/", createTask);
router.get("/:id/tags", listTaskTags);
router.put("/:id/tags", replaceTaskTags);
router.get("/:id/comments", listTaskComments);
router.post("/:id/comments", createTaskComment);
router.get(
  "/:id/comments/:commentId/history",
  listTaskCommentHistory,
);
router.patch(
  "/:id/comments/:commentId/restore",
  restoreTaskComment,
);
router.patch("/:id/comments/:commentId", updateTaskComment);
router.delete("/:id/comments/:commentId", archiveTaskComment);
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
router.patch(
  "/:id/attachments/:attachmentId/restore",
  restoreTaskAttachment,
);
router.patch("/:id", updateTask);
router.patch("/:id/assignment", updateTaskAssignment);
router.patch("/:id/due-date", updateTaskDueDate);
router.patch("/:id/restore", restoreTask);
router.patch("/:id/status", updateTaskStatus);
router.delete("/:id", archiveTask);

module.exports = router;
