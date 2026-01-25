const Order = require("../models/Order");
const OrderMessage = require("../models/OrderMessage");
const mongoose = require("mongoose");

const { sendEmail } = require("../services/email.service");
const {
  orderStatusUpdated,
  paymentVerified,
  welcomeEmail,
} = require("../emails/templates");

// PATCH_23: Affiliate commission processing (using new service)
const {
  processAffiliateCommission,
} = require("../services/affiliateCommission.service");

exports.getAllOrders = async (req, res) => {
  try {
    const statusQuery = String(req.query?.status || "")
      .trim()
      .toLowerCase();

    // Exclude archived rejected orders by default.
    const query = { isRejectedArchive: { $ne: true } };

    // Optional status filter from UI tabs.
    // UI values: pending | submitted | processing | all
    const statusMap = {
      pending: "payment_pending",
      submitted: ["payment_submitted", "pending_review"],
      processing: "processing",
    };

    if (statusQuery && statusQuery !== "all") {
      const mapped = statusMap[statusQuery];
      if (Array.isArray(mapped)) query.status = { $in: mapped };
      else if (mapped) query.status = mapped;
    }

    const orders = await Order.find(query)
      .populate("userId", "email role")
      .populate("serviceId", "title price")
      .populate("payment.methodId", "name type details instructions")
      .sort({ createdAt: -1, updatedAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getRejectedArchivedOrders = async (req, res) => {
  try {
    const orders = await Order.find({ isRejectedArchive: true })
      .populate("userId", "email role")
      .populate("serviceId", "title price")
      .populate("payment.methodId", "name type details instructions")
      .sort({ rejectedAt: -1, updatedAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.archiveRejectedOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status !== "rejected") {
      return res
        .status(400)
        .json({ message: "Only rejected orders can be archived" });
    }

    if (!order.isRejectedArchive) {
      order.isRejectedArchive = true;
      order.rejectedAt = new Date();
      order.statusLog = order.statusLog || [];
      order.statusLog.push({
        text: "Order archived to rejected list",
        at: new Date(),
      });
      order.timeline = order.timeline || [];
      order.timeline.push({
        message: "Order moved to rejected list",
        by: "admin",
      });
      await order.save();
    }

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.unarchiveRejectedOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!order.isRejectedArchive) {
      return res.status(400).json({ message: "Order is not archived" });
    }

    order.isRejectedArchive = false;
    order.rejectedAt = null;
    order.statusLog = order.statusLog || [];
    order.statusLog.push({
      text: "Order unarchived from rejected list",
      at: new Date(),
    });
    order.timeline = order.timeline || [];
    order.timeline.push({
      message: "Order removed from rejected list",
      by: "admin",
    });

    await order.save();
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const allowed = [
      "payment_pending",
      "payment_submitted",
      "processing",
      "completed",
      "rejected",
    ];

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const prevStatus = order.status;

    order.status = status;

    order.statusLog = order.statusLog || [];
    if (
      prevStatus === "payment_submitted" &&
      ["processing", "completed"].includes(status)
    ) {
      order.statusLog.push({
        text: "Payment verified by admin",
        at: new Date(),
      });
    }

    if (status === "rejected") {
      order.statusLog.push({
        text: "Payment rejected — user must resubmit proof",
        at: new Date(),
      });
    } else {
      order.statusLog.push({
        text: `Status changed to: ${status}`,
        at: new Date(),
      });
    }

    order.timeline.push({
      message: `Status updated to ${status}`,
      by: "admin",
    });
    await order.save();

    // Email notification (best-effort)
    if (prevStatus !== status) {
      try {
        await order.populate([
          { path: "userId", select: "email name" },
          { path: "serviceId", select: "title" },
        ]);

        const userEmail = order.userId?.email;
        if (userEmail) {
          await sendEmail({
            to: userEmail,
            subject: "Order status updated — UREMO",
            html: orderStatusUpdated(order),
          });
        }
      } catch (err) {
        console.error("[email] order status hook failed", {
          orderId: String(order?._id || req.params.id),
          message: err?.message || String(err),
        });
      }
    }

    res.json({ message: "Order status updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate([
      { path: "userId", select: "email name role" },
      { path: "serviceId", select: "title price" },
      { path: "payment.methodId", select: "name type details instructions" },
    ]);

    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status !== "payment_submitted") {
      return res.status(400).json({
        message:
          "Payment can only be verified when status is payment_submitted",
      });
    }

    const now = new Date();

    order.status = "processing";
    order.payment = order.payment || {};
    order.payment.verifiedAt = now;

    order.statusLog = order.statusLog || [];
    order.statusLog.push({
      text: "Payment verified by admin",
      at: now,
    });

    order.timeline = order.timeline || [];
    order.timeline.push({
      message: "Payment verified by admin",
      by: "admin",
      createdAt: now,
    });

    await order.save();

    // PATCH_23: Process affiliate commission when payment is verified
    if (order.userId?._id) {
      setImmediate(async () => {
        try {
          await processAffiliateCommission(order._id, "manual");
        } catch (err) {
          console.error("[affiliate] commission processing failed", {
            orderId: String(order?._id),
            message: err?.message || String(err),
          });
        }
      });
    }

    // Email notification (best-effort, non-blocking)
    const userEmail = order.userId?.email;
    if (userEmail) {
      setImmediate(async () => {
        try {
          await sendEmail({
            to: userEmail,
            subject: "Payment Verified — Order is Processing",
            html: paymentVerified(order),
          });
        } catch (err) {
          console.error("[email] payment verified hook failed", {
            orderId: String(order?._id || req.params.id),
            message: err?.message || String(err),
          });
        }
      });
    }

    // Return updated order (re-hydrated)
    const updated = await Order.findById(order._id).populate([
      { path: "userId", select: "email name role" },
      { path: "serviceId", select: "title price" },
      { path: "payment.methodId", select: "name type details instructions" },
    ]);

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.testEmail = async (req, res) => {
  try {
    const toEmail = String(req.body?.toEmail || "").trim();
    if (!toEmail) {
      return res.status(400).json({ message: "toEmail is required" });
    }

    const nameGuess = toEmail.split("@")[0] || "there";

    await sendEmail({
      to: toEmail,
      subject: "Welcome to UREMO",
      html: welcomeEmail({ name: nameGuess }),
    });

    res.json({ success: true, message: "Test email sent" });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: err?.message || "Email failed" });
  }
};

exports.adminReplyToOrder = async (req, res) => {
  // Backward-compatible admin endpoint.
  // Keep it, but route through the unified chat logic used by users.
  const { postOrderMessage } = require("./orderMessage.controller");
  return postOrderMessage(req, res);
};

exports.getAdminInbox = async (req, res) => {
  try {
    const recent = await OrderMessage.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const byOrder = new Map();
    for (const msg of recent) {
      const key = String(msg.orderId);
      if (!byOrder.has(key)) {
        byOrder.set(key, msg);
      }
    }

    const orderIds = Array.from(byOrder.keys());

    // Compute unread counts for each order (user -> admin messages not yet seen)
    const orderObjectIds = orderIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const unreadAgg = await OrderMessage.aggregate([
      {
        $match: {
          orderId: { $in: orderObjectIds },
          senderRole: "user",
          status: { $ne: "seen" },
        },
      },
      { $group: { _id: "$orderId", count: { $sum: 1 } } },
    ]);
    const unreadMap = new Map(
      (Array.isArray(unreadAgg) ? unreadAgg : []).map((x) => [
        String(x._id),
        Number(x.count || 0),
      ]),
    );

    const orders = await Order.find({ _id: { $in: orderIds } })
      .populate("userId", "email")
      .populate("serviceId", "title")
      .lean();

    const orderMap = new Map(orders.map((o) => [String(o._id), o]));

    const items = orderIds
      .map((orderId) => {
        const last = byOrder.get(orderId);
        const order = orderMap.get(orderId);
        if (!order) return null;

        return {
          orderId,
          lastMessage: last.message,
          lastAt: last.createdAt,
          status: order.status,
          userEmail: order.userId?.email || "",
          serviceTitle: order.serviceId?.title || "",
          unreadCount: unreadMap.get(orderId) || 0,
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
      );

    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.getAdminUnreadSnapshot = async (req, res) => {
  try {
    const agg = await OrderMessage.aggregate([
      {
        $match: {
          senderRole: "user",
          status: { $ne: "seen" },
        },
      },
      { $group: { _id: "$orderId", count: { $sum: 1 } } },
    ]);

    const byOrder = {};
    let totalUnread = 0;
    for (const row of Array.isArray(agg) ? agg : []) {
      const key = String(row._id);
      const count = Number(row.count || 0);
      byOrder[key] = count;
      totalUnread += count;
    }

    res.json({ totalUnread, byOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || "Server error" });
  }
};

exports.markOrderSupportRead = async (req, res) => {
  try {
    const id = String(req.params?.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid order id" });
    }

    const result = await OrderMessage.updateMany(
      {
        orderId: new mongoose.Types.ObjectId(id),
        senderRole: "user",
        status: { $ne: "seen" },
      },
      { $set: { status: "seen", seenAt: new Date() } },
    );

    res.json({ ok: true, updated: result?.modifiedCount || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err?.message || "Server error" });
  }
};

exports.addOrderNote = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Note message is required" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.timeline.push({
      message,
      by: "admin",
    });
    await order.save();

    res.json({ message: "Note added", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
