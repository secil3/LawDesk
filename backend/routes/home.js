const express = require("express");
const router = express.Router();
const { getRoot, testDbConnection } = require("../controllers/homeController");

router.get("/", getRoot);
router.get("/db-test", testDbConnection);

module.exports = router;
