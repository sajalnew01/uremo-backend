const express = require("express");
const { getPublicSettings } = require("../controllers/siteSettings.controller");

const router = express.Router();

router.get("/public", getPublicSettings);

module.exports = router;
