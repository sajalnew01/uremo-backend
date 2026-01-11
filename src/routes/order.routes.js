const express = require("express");
const auth = require("../middlewares/auth.middleware");
const {
  createOrder,
  myOrders,
  getOrderById,
  submitPayment,
} = require("../controllers/order.controller");
const {
  getOrderMessages,
  postOrderMessage,
} = require("../controllers/orderMessage.controller");

const router = express.Router();

router.post("/", auth, createOrder);
router.get("/my", auth, myOrders);
router.get("/:id/messages", auth, getOrderMessages);
router.post("/:id/messages", auth, postOrderMessage);
router.get("/:id", auth, getOrderById);
router.put("/:id/payment", auth, submitPayment);

module.exports = router;
