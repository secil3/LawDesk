const express = require("express");

const {
  activateAccount,
  submitRegistrationRequest,
  validateActivationToken,
} = require("../controllers/registrationController");
const {
  registrationRateLimit,
} = require("../middleware/registrationRateLimit");

const router = express.Router();

router.post("/", registrationRateLimit, submitRegistrationRequest);
router.post("/activation/validate", validateActivationToken);
router.post("/activation/complete", activateAccount);

module.exports = router;
