const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getAllOrders,
  updateOrderStatus,
} = require("../controllers/admin.controller");
const {
  getAllServices,
  createService,
  updateService,
} = require("../controllers/service.controller");

const router = express.Router();

router.get("/orders", auth, admin, getAllOrders);
router.put("/orders/:id", auth, admin, updateOrderStatus);

// Service management
router.get("/services", auth, admin, getAllServices);
router.post("/services", auth, admin, createService);
router.put("/services/:id", auth, admin, updateService);

module.exports = router;
