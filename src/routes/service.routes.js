const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getActiveServices,
  createService,
} = require("../controllers/service.controller");

const router = express.Router();

router.get("/", auth, getActiveServices);
router.post("/", auth, admin, createService);

module.exports = router;
