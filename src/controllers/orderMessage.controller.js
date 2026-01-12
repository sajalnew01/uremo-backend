const Order = require("../models/Order");
const OrderMessage = require("../models/OrderMessage");

async function assertOrderAccess(req, res) {
  if (!req.user || !req.user.id) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404).json({ message: "Order not found" });
    return null;
  }

  const isAdmin = req.user?.role === "admin";
  const isOwner = String(order.userId) === String(req.user.id);
  if (!isAdmin && !isOwner) {
    res.status(403).json({ message: "Access denied" });
    return null;
  }

  return order;
}

exports.getOrderMessages = async (req, res) => {
  try {
    const order = await assertOrderAccess(req, res);
    if (!order) return;

    const messages = await OrderMessage.find({ orderId: order._id })
      .sort({ createdAt: 1 })
      .lean();

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.postOrderMessage = async (req, res) => {
  try {
    const order = await assertOrderAccess(req, res);
    if (!order) return;

    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    const created = await OrderMessage.create({
      orderId: order._id,
      userId: req.user.id,
      senderRole: req.user?.role === "admin" ? "admin" : "user",
      message,
      createdAt: new Date(),
    });

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: err.message || "Server error" });
  }
};
