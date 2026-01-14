const mongoose = require("mongoose");
const Order = require("../models/Order");
const OrderMessage = require("../models/OrderMessage");

async function assertOrderAccess(req, res) {
  if (!req.user || !req.user.id) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }

  const { id } = req.params;
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
  const orderId = req.params.id;
  const userId = req.user?.id || "anon";
  const role = req.user?.role || "unknown";

  try {
    const order = await assertOrderAccess(req, res);
    if (!order) return;

    const messages = await OrderMessage.find({ orderId: order._id })
      .sort({ createdAt: 1 })
      .lean();

    const list = Array.isArray(messages) ? messages : [];

    // Keep legacy shape (_id) + provide stable id
    const normalized = list.map((m) => ({
      _id: m._id,
      id: m._id,
      orderId: m.orderId,
      senderRole: m.senderRole,
      message: m.message,
      createdAt: m.createdAt,
    }));

    res.json(normalized);
  } catch (err) {
    console.error(
      `[CHAT_GET_FAIL] orderId=${orderId} userId=${userId} role=${role} errMessage=${err?.message}`
    );
    // Requirement: never crash chat GET. Return [] rather than 500.
    return res.json([]);
  }
};

exports.postOrderMessage = async (req, res) => {
  const orderId = req.params.id;
  const userId = req.user?.id || "anon";
  const role = req.user?.role || "unknown";

  try {
    const order = await assertOrderAccess(req, res);
    if (!order) return;

    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }
    if (message.length > 2000) {
      return res
        .status(400)
        .json({ message: "Message too long (max 2000 characters)" });
    }

    const senderRole = req.user?.role === "admin" ? "admin" : "user";

    const created = await OrderMessage.create({
      orderId: order._id,
      senderId: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null,
      senderRole,
      message,
      createdAt: new Date(),
    });

    console.log(
      `[CHAT_SEND_OK] orderId=${orderId} userId=${userId} role=${senderRole}`
    );

    return res.status(201).json({
      _id: created._id,
      id: created._id,
      orderId: created.orderId,
      senderRole: created.senderRole,
      message: created.message,
      createdAt: created.createdAt,
    });
  } catch (err) {
    console.error(
      `[CHAT_SEND_FAIL] orderId=${orderId} userId=${userId} role=${role} errMessage=${err?.message}`
    );
    return res.status(500).json({ message: "Unable to send message" });
  }
};
