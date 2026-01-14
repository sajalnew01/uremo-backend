const Order = require("../models/Order");
const OrderMessage = require("../models/OrderMessage");
const mongoose = require("mongoose");

async function assertOrderAccess(req, res) {
  if (!req.user || !req.user.id) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }

  const { id } = req.params;
  // Avoid CastError -> 500. Treat invalid ids as not found.
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ message: "Order not found" });
    return null;
  }

  const order = await Order.findById(id);
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

    const normalized = messages.map((m) => ({
      ...m,
      senderId: m.senderId || m.userId || null,
    }));

    console.log("[chat] getOrderMessages", {
      orderId: String(order._id),
      count: normalized.length,
      requesterId: req.user?.id,
      requesterRole: req.user?.role,
    });

    res.json(normalized);
  } catch (err) {
    if (err?.name === "CastError") {
      return res.status(404).json({ message: "Order not found" });
    }
    res.status(500).json({ message: err?.message || "Server error" });
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

    const senderRole = req.user?.role === "admin" ? "admin" : "user";
    console.log("[chat] postOrderMessage", {
      orderId: String(order._id),
      senderRole,
      senderId: req.user?.id,
    });

    const created = await OrderMessage.create({
      orderId: order._id,
      senderId: req.user.id,
      userId: req.user.id,
      senderRole,
      message,
      createdAt: new Date(),
    });

    res.status(201).json({
      ...created.toObject(),
      senderId: created.senderId || created.userId || null,
    });
  } catch (err) {
    if (err?.name === "CastError") {
      return res.status(404).json({ message: "Order not found" });
    }
    res.status(500).json({ message: err?.message || "Server error" });
  }
};
