const express = require("express");

const {
  createGroup,
  createUser,
  listUsers,
  listGroups,
  deleteUser,
  restoreUser,
  updateGroup,
  updateUserActive,
  updateUserMemberships,
} = require("../controllers/adminController");

const {
  requireAuth,
  requireSystemRole,
} = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/users", requireSystemRole("admin"), listUsers);
router.get("/groups", requireSystemRole("admin"), listGroups);
router.post("/groups", requireSystemRole("admin"), createGroup);
router.patch("/groups/:id", requireSystemRole("admin"), updateGroup);
router.post("/users", requireSystemRole("admin"), createUser);
router.patch("/users/:id/restore", requireSystemRole("admin"), restoreUser);
router.put("/users/:id/memberships", requireSystemRole("admin"), updateUserMemberships);
router.patch("/users/:id", requireSystemRole("admin"), updateUserActive);
router.delete("/users/:id", requireSystemRole("admin"), deleteUser);

module.exports = router;
