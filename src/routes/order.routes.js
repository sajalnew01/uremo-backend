const express = require("express");
const auth = require("../middlewares/auth.middleware");
const {
  createOrder,
  createDealOrder,
  myOrders,
  getOrderById,
  submitPayment,
} = require("../controllers/order.controller");
const {
  getOrderMessages,
  postOrderMessage,
  streamOrderMessages,
} = require("../controllers/orderMessage.controller");

const router = express.Router();

router.post("/", auth, createOrder);
router.get("/", auth, myOrders); // Alias for /my
router.get("/my", auth, myOrders);
// PATCH_38: Deal order creation
router.post("/deal", auth, createDealOrder);
router.get("/:id/messages", auth, getOrderMessages);
router.post("/:id/messages", auth, postOrderMessage);
router.get("/:id/messages/stream", auth, streamOrderMessages);
router.get("/:id", auth, getOrderById);
router.put("/:id/payment", auth, submitPayment);

module.exports = router;
