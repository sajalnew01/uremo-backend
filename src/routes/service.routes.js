const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getActiveServices,
  createService,
  getAllServices,
  updateService,
} = require("../controllers/service.controller");

const router = express.Router();

router.get("/", getActiveServices);
router.post("/", auth, admin, createService);
router.get("/admin", auth, admin, getAllServices);
router.put("/admin/:id", auth, admin, updateService);

module.exports = router;
