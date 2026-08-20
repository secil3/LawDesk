const express = require("express");

const { listGroups } = require("../controllers/adminController");
const {
  requireAuth,
  requireGroupAccess,
} = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);
router.get("/", requireGroupAccess, listGroups);

module.exports = router;
