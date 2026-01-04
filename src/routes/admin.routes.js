const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getAllOrders,
  updateOrderStatus,
} = require("../controllers/admin.controller");

const router = express.Router();

router.get("/orders", auth, admin, getAllOrders);
router.patch("/orders/:id", auth, admin, updateOrderStatus);

module.exports = router;
