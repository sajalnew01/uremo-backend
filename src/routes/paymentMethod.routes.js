const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getAll,
  getActive,
  create,
  update,
} = require("../controllers/paymentMethod.controller");

const router = express.Router();

// Admin routes
router.get("/admin", auth, admin, getAll);
router.post("/admin", auth, admin, create);
router.put("/admin/:id", auth, admin, update);

// Public route
router.get("/", getActive);

module.exports = router;
