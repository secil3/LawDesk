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
router.use(requireSystemRole("admin"));

router.get("/users", listUsers);
router.get("/groups", listGroups);
router.post("/groups", createGroup);
router.patch("/groups/:id", updateGroup);
router.post("/users", createUser);
router.patch("/users/:id/restore", restoreUser);
router.put("/users/:id/memberships", updateUserMemberships);
router.patch("/users/:id", updateUserActive);
router.delete("/users/:id", deleteUser);

module.exports = router;
