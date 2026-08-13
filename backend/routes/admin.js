const express = require("express");

const {
  createUser,
  listUsers,
  listGroups,
  deleteUser,
  updateUserActive,
} = require("../controllers/adminController");

const {
  requireAuth,
  requireSystemRole,
} = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);
router.use(requireSystemRole("admin"));

router.get("/users", listUsers);
router.get("/groups", listGroups);
router.post("/users", createUser);
router.patch("/users/:id", updateUserActive);
router.delete("/users/:id", deleteUser);

module.exports = router;