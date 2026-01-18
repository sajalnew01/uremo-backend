const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  createDraftService,
  activateService,
} = require("../controllers/adminServices.controller");

router.post("/services", auth, admin, createDraftService);
router.patch("/services/:id/activate", auth, admin, activateService);

module.exports = router;
