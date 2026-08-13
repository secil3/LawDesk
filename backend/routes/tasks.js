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
  requireAuth,
  requireSystemRole,
} = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/options", getTaskOptions);
router.get(
  "/activity",
  requireSystemRole("admin", "yonetici"),
  listActivityLogs,
);
router.get("/", listTasks);
router.post("/", createTask);
router.patch("/:id", updateTask);
router.patch("/:id/assignment", updateTaskAssignment);
router.patch("/:id/due-date", updateTaskDueDate);
router.patch("/:id/restore", restoreTask);
router.patch("/:id/status", updateTaskStatus);
router.delete("/:id", archiveTask);

module.exports = router;
