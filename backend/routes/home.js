const express = require("express");
const router = express.Router();
const {
  getHealth,
  getReadiness,
  getRoot,
  testDbConnection,
} = require("../controllers/homeController");

router.get("/", getRoot);
router.get("/health", getHealth);
router.get("/ready", getReadiness);
router.get("/db-test", testDbConnection);

module.exports = router;
