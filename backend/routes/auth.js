const express = require("express");

const {
  login,
  me,
  logout,
} = require("../controllers/authController");

const {
  requireAuth,
} = require("../middleware/auth");
const { loginRateLimit } = require("../middleware/loginRateLimit");

const router = express.Router();

router.post("/login", loginRateLimit, login);
router.get("/me", requireAuth, me);
router.post("/logout", logout);

module.exports = router;
