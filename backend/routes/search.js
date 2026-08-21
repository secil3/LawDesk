const express = require("express");

const { globalSearch } = require("../controllers/searchController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);
router.get("/", globalSearch);

module.exports = router;
