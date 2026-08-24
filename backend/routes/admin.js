const express = require("express");

const {
  createGroup,
  listUsers,
  listGroups,
  deleteUser,
  restoreUser,
  updateGroup,
  updateUserActive,
  updateUserMemberships,
} = require("../controllers/adminController");

const {
  approveRegistrationRequest,
  getRegistrationRequest,
  listRegistrationRequests,
  rejectRegistrationRequest,
  resendActivationEmail,
} = require("../controllers/registrationController");

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
router.get(
  "/registration-requests",
  requireSystemRole("admin"),
  listRegistrationRequests,
);
router.get(
  "/registration-requests/:id",
  requireSystemRole("admin"),
  getRegistrationRequest,
);
router.post(
  "/registration-requests/:id/approve",
  requireSystemRole("admin"),
  approveRegistrationRequest,
);
router.post(
  "/registration-requests/:id/reject",
  requireSystemRole("admin"),
  rejectRegistrationRequest,
);
router.post(
  "/registration-requests/:id/resend-activation",
  requireSystemRole("admin"),
  resendActivationEmail,
);
router.patch("/users/:id/restore", requireSystemRole("admin"), restoreUser);
router.put("/users/:id/memberships", requireSystemRole("admin"), updateUserMemberships);
router.patch("/users/:id", requireSystemRole("admin"), updateUserActive);
router.delete("/users/:id", requireSystemRole("admin"), deleteUser);

module.exports = router;
