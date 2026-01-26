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

/**
 * Get all users (admin)
 * GET /api/admin/users
 */
exports.getAllUsers = async (req, res) => {
  try {
    const User = require("../models/User");

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim();

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password -__v")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({
      users,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[admin] getAllUsers error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ============================================
// ADMIN RESET ENDPOINTS - For production launch
// ============================================

/**
 * RESET ALL WALLETS
 * POST /api/admin/reset/wallets
 * Resets all users' wallet balance to 0 and clears wallet transactions
 */
exports.resetAllWallets = async (req, res) => {
  try {
    const { confirm } = req.body;

    // Require explicit confirmation
    if (confirm !== "RESET_ALL_WALLETS") {
      return res.status(400).json({
        ok: false,
        message: "Confirmation required. Send { confirm: 'RESET_ALL_WALLETS' }",
      });
    }

    const User = require("../models/User");
    const WalletTransaction = require("../models/WalletTransaction");

    // Get stats before reset
    const userStats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: { $sum: "$walletBalance" },
          count: { $sum: 1 },
        },
      },
    ]);
    const txCount = await WalletTransaction.countDocuments();

    // Reset all user wallet balances to 0
    const walletResetResult = await User.updateMany(
      { walletBalance: { $gt: 0 } },
      { $set: { walletBalance: 0 } },
    );

    // Delete all wallet transactions
    const txDeleteResult = await WalletTransaction.deleteMany({});

    res.json({
      ok: true,
      message: "All wallet data reset successfully",
      stats: {
        usersReset: walletResetResult.modifiedCount,
        previousTotalBalance: userStats[0]?.totalBalance || 0,
        transactionsDeleted: txDeleteResult.deletedCount,
      },
    });
  } catch (err) {
    console.error("[admin] resetAllWallets error:", err);
    res.status(500).json({ ok: false, message: "Failed to reset wallets" });
  }
};

/**
 * RESET ALL AFFILIATE DATA
 * POST /api/admin/reset/affiliate
 * Resets all affiliate balances, referral links, and commission records
 */
exports.resetAllAffiliateData = async (req, res) => {
  try {
    const { confirm } = req.body;

    // Require explicit confirmation
    if (confirm !== "RESET_ALL_AFFILIATE") {
      return res.status(400).json({
        ok: false,
        message:
          "Confirmation required. Send { confirm: 'RESET_ALL_AFFILIATE' }",
      });
    }

    const User = require("../models/User");
    const AffiliateTransaction = require("../models/AffiliateTransaction");
    const AffiliateWithdrawal = require("../models/AffiliateWithdrawal");

    // Try to load AffiliateCommission if exists
    let AffiliateCommission;
    try {
      AffiliateCommission = require("../models/AffiliateCommission");
    } catch (e) {
      AffiliateCommission = null;
    }

    // Get stats before reset
    const userStats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalAffiliateBalance: { $sum: "$affiliateBalance" },
          totalEarned: { $sum: "$totalAffiliateEarned" },
          usersWithReferrer: {
            $sum: { $cond: [{ $ne: ["$referredBy", null] }, 1, 0] },
          },
        },
      },
    ]);

    const txCount = await AffiliateTransaction.countDocuments();
    const withdrawalCount = await AffiliateWithdrawal.countDocuments();
    const commissionCount = AffiliateCommission
      ? await AffiliateCommission.countDocuments()
      : 0;

    // Reset all user affiliate data
    const affiliateResetResult = await User.updateMany(
      {},
      {
        $set: {
          affiliateBalance: 0,
          totalAffiliateEarned: 0,
          referredBy: null,
        },
      },
    );

    // Delete all affiliate transactions
    const txDeleteResult = await AffiliateTransaction.deleteMany({});

    // Delete all affiliate withdrawals
    const withdrawalDeleteResult = await AffiliateWithdrawal.deleteMany({});

    // Delete all commission records if model exists
    let commissionDeleteResult = { deletedCount: 0 };
    if (AffiliateCommission) {
      commissionDeleteResult = await AffiliateCommission.deleteMany({});
    }

    res.json({
      ok: true,
      message: "All affiliate data reset successfully",
      stats: {
        usersReset: affiliateResetResult.modifiedCount,
        previousTotalBalance: userStats[0]?.totalAffiliateBalance || 0,
        previousTotalEarned: userStats[0]?.totalEarned || 0,
        referralLinksCleared: userStats[0]?.usersWithReferrer || 0,
        transactionsDeleted: txDeleteResult.deletedCount,
        withdrawalsDeleted: withdrawalDeleteResult.deletedCount,
        commissionsDeleted: commissionDeleteResult.deletedCount,
      },
    });
  } catch (err) {
    console.error("[admin] resetAllAffiliateData error:", err);
    res
      .status(500)
      .json({ ok: false, message: "Failed to reset affiliate data" });
  }
};

/**
 * RESET ALL TEST DATA
 * POST /api/admin/reset/all-test-data
 * Resets wallets, affiliate data, and optionally test orders
 */
exports.resetAllTestData = async (req, res) => {
  try {
    const { confirm, includeOrders } = req.body;

    // Require explicit confirmation
    if (confirm !== "RESET_ALL_TEST_DATA") {
      return res.status(400).json({
        ok: false,
        message:
          "Confirmation required. Send { confirm: 'RESET_ALL_TEST_DATA' }",
      });
    }

    const User = require("../models/User");
    const WalletTransaction = require("../models/WalletTransaction");
    const AffiliateTransaction = require("../models/AffiliateTransaction");
    const AffiliateWithdrawal = require("../models/AffiliateWithdrawal");

    let AffiliateCommission;
    try {
      AffiliateCommission = require("../models/AffiliateCommission");
    } catch (e) {
      AffiliateCommission = null;
    }

    const results = {};

    // Reset wallet balances
    const walletReset = await User.updateMany(
      { walletBalance: { $gt: 0 } },
      { $set: { walletBalance: 0 } },
    );
    results.walletsReset = walletReset.modifiedCount;

    // Delete wallet transactions
    const walletTxDelete = await WalletTransaction.deleteMany({});
    results.walletTransactionsDeleted = walletTxDelete.deletedCount;

    // Reset affiliate balances
    const affiliateReset = await User.updateMany(
      {},
      {
        $set: {
          affiliateBalance: 0,
          totalAffiliateEarned: 0,
          referredBy: null,
        },
      },
    );
    results.affiliateDataReset = affiliateReset.modifiedCount;

    // Delete affiliate transactions
    const affTxDelete = await AffiliateTransaction.deleteMany({});
    results.affiliateTransactionsDeleted = affTxDelete.deletedCount;

    // Delete affiliate withdrawals
    const affWithdrawDelete = await AffiliateWithdrawal.deleteMany({});
    results.affiliateWithdrawalsDeleted = affWithdrawDelete.deletedCount;

    // Delete commission records
    if (AffiliateCommission) {
      const commDelete = await AffiliateCommission.deleteMany({});
      results.commissionsDeleted = commDelete.deletedCount;
    }

    // Optionally delete test orders (only orders from test emails)
    if (includeOrders) {
      const testOrdersDelete = await Order.deleteMany({
        $or: [
          { "userId.email": { $regex: /@test\.com$/i } },
          { status: "payment_pending" }, // Only pending orders
        ],
      });
      results.testOrdersDeleted = testOrdersDelete.deletedCount;
    }

    res.json({
      ok: true,
      message: "All test data reset successfully",
      results,
    });
  } catch (err) {
    console.error("[admin] resetAllTestData error:", err);
    res.status(500).json({ ok: false, message: "Failed to reset test data" });
  }
};

// Get single order by ID (admin)
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("userId", "name email phone role walletBalance")
      .populate("serviceId", "title price description category subcategory")
      .populate("payment.methodId", "name type details instructions")
      .lean();

    if (!order) {
      return res.status(404).json({ ok: false, message: "Order not found" });
    }

    // Get order messages
    const messages = await OrderMessage.find({ order: req.params.id })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ ok: true, order, messages });
  } catch (err) {
    console.error("[admin] getOrderById error:", err);
    res.status(500).json({ ok: false, message: "Failed to get order" });
  }
};
