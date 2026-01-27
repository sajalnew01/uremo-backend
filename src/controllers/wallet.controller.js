/**
 * PATCH_23: Wallet Controller
 * Handles wallet balance operations, top-ups, and transactions
 */
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");
const Order = require("../models/Order");
const { sendNotification } = require("../services/notification.service");

// PATCH_31: FlowEngine for orchestrated state transitions
const FlowEngine = require("../core/flowEngine");

/**
 * Get current wallet balance
 * GET /api/wallet/balance
 */
exports.getBalance = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId).select("walletBalance");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      balance: user.walletBalance || 0,
    });
  } catch (err) {
    console.error("getBalance error:", err);
    res.status(500).json({ error: "Failed to get balance" });
  }
};

/**
 * Add balance (top-up)
 * POST /api/wallet/topup
 * Body: { amount }
 * Note: In production, this would integrate with payment gateway
 */
exports.topUp = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Amount must be greater than 0" });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1) {
      return res.status(400).json({ error: "Minimum top-up amount is $1" });
    }

    const userId = req.user.id || req.user._id;

    // Update user balance
    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { walletBalance: numAmount } },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Create transaction record
    await WalletTransaction.create({
      user: userId,
      type: "credit",
      amount: numAmount,
      source: "topup",
      description: "Wallet top-up",
      balanceAfter: user.walletBalance,
    });

    res.json({
      success: true,
      message: `Successfully added $${numAmount.toFixed(2)} to wallet`,
      balance: user.walletBalance,
    });
  } catch (err) {
    console.error("topUp error:", err);
    res.status(500).json({ error: "Failed to add balance" });
  }
};

/**
 * Get transaction history
 * GET /api/wallet/transactions
 * Query: { page, limit }
 */
exports.getTransactions = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WalletTransaction.countDocuments({ user: userId }),
    ]);

    res.json({
      success: true,
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("getTransactions error:", err);
    res.status(500).json({ error: "Failed to get transactions" });
  }
};

/**
 * Pay for order using wallet
 * POST /api/wallet/pay
 * Body: { orderId }
 */
exports.payWithWallet = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID required" });
    }

    const Order = require("../models/Order");
    // Populate serviceId to get the price
    const order = await Order.findById(orderId).populate(
      "serviceId",
      "price title",
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const userId = req.user.id || req.user._id;

    // Check authorization - Order model uses userId, not user
    const orderUserId = order.userId || order.user;
    if (!orderUserId || orderUserId.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({ error: "Order already paid" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get order amount from service price or order fields
    const orderAmount =
      order.totalPrice || order.price || order.serviceId?.price || 0;

    if (!orderAmount || orderAmount <= 0) {
      return res.status(400).json({ error: "Unable to determine order price" });
    }

    if (user.walletBalance < orderAmount) {
      return res.status(400).json({
        error: "Insufficient wallet balance",
        required: orderAmount,
        available: user.walletBalance,
      });
    }

    // ATOMIC: Deduct from wallet using findOneAndUpdate to prevent race conditions
    const updateResult = await User.findOneAndUpdate(
      { _id: userId, walletBalance: { $gte: orderAmount } },
      { $inc: { walletBalance: -orderAmount } },
      { new: true },
    );

    if (!updateResult) {
      return res.status(400).json({
        error: "Insufficient wallet balance or concurrent transaction",
      });
    }

    // Create debit transaction
    const source =
      order.serviceType === "rental" ? "rental_purchase" : "service_purchase";
    await WalletTransaction.create({
      user: userId,
      type: "debit",
      amount: orderAmount,
      source,
      referenceId: order._id,
      description: `Payment for order #${order._id.toString().slice(-6)}`,
      balanceAfter: updateResult.walletBalance,
    });

    // PATCH_31: Use FlowEngine for status transition
    // FlowEngine handles: status update, timeline, affiliate commission (via hooks)
    try {
      await FlowEngine.transition("order", order._id, "processing", {
        actor: "system",
        reason: "Payment completed via wallet",
        paymentMethod: "wallet",
        data: { walletBalance: updateResult.walletBalance },
      });
    } catch (flowErr) {
      // If FlowEngine fails, fall back to direct update for critical payment flow
      console.error(
        "[FlowEngine] wallet payment transition failed:",
        flowErr.message,
      );
      order.paymentStatus = "paid";
      order.paymentMethod = "wallet";
      order.status = "processing";
      order.paidAt = new Date();
      await order.save();

      // Process affiliate commission manually if FlowEngine failed
      try {
        const {
          processAffiliateCommission,
        } = require("../services/affiliateCommission.service");
        await processAffiliateCommission(order._id, "wallet");
      } catch (affErr) {
        console.error("Affiliate commission processing error:", affErr);
      }
    }

    // Refresh order data
    const updatedOrder = await Order.findById(order._id).lean();

    res.json({
      success: true,
      message: "Payment successful",
      order: {
        _id: updatedOrder._id,
        paymentStatus: updatedOrder.paymentStatus || "paid",
        status: updatedOrder.status,
      },
      walletBalance: updateResult.walletBalance,
    });
  } catch (err) {
    console.error("payWithWallet error:", err);
    res.status(500).json({ error: "Payment failed" });
  }
};

// ============================================
// ADMIN FUNCTIONS
// ============================================

/**
 * Admin: Adjust user wallet balance
 * POST /api/admin/wallet/adjust
 * Body: { userId, amount, type, description }
 */
exports.adminAdjustBalance = async (req, res) => {
  try {
    const { userId, amount, type, description } = req.body;

    if (!userId || !amount || !type) {
      return res.status(400).json({
        error: "userId, amount, and type (credit/debit) required",
      });
    }

    if (!["credit", "debit"].includes(type)) {
      return res.status(400).json({ error: "Type must be credit or debit" });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: "Amount must be greater than 0" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if debit would result in negative balance
    if (type === "debit" && user.walletBalance < numAmount) {
      return res.status(400).json({
        error: "Insufficient balance for debit",
        currentBalance: user.walletBalance,
        requestedDebit: numAmount,
      });
    }

    // Apply adjustment
    if (type === "credit") {
      user.walletBalance += numAmount;
    } else {
      user.walletBalance -= numAmount;
    }
    await user.save();

    // Create transaction record
    await WalletTransaction.create({
      user: userId,
      type,
      amount: numAmount,
      source: "admin_adjustment",
      description: description || `Admin ${type} by ${req.user.email}`,
      balanceAfter: user.walletBalance,
    });

    // PATCH_29: Notify user about wallet update
    try {
      const action = type === "credit" ? "credited" : "debited";
      await sendNotification({
        userId: userId,
        title: "Wallet Update",
        message: `Your wallet has been ${action} $${numAmount.toFixed(2)}. New balance: $${user.walletBalance.toFixed(2)}`,
        type: "wallet",
      });
    } catch (notifErr) {
      console.error(
        "[notification] wallet adjustment failed:",
        notifErr.message,
      );
    }

    res.json({
      success: true,
      message: `Successfully ${type}ed $${numAmount.toFixed(2)} ${type === "credit" ? "to" : "from"} user wallet`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        walletBalance: user.walletBalance,
      },
    });
  } catch (err) {
    console.error("adminAdjustBalance error:", err);
    res.status(500).json({ error: "Failed to adjust balance" });
  }
};

/**
 * Admin: Get user wallet info and history
 * GET /api/admin/wallet/user/:userId
 */
exports.adminGetUserWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId).select("name email walletBalance");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const [transactions, total] = await Promise.all([
      WalletTransaction.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WalletTransaction.countDocuments({ user: userId }),
    ]);

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        walletBalance: user.walletBalance,
      },
      transactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("adminGetUserWallet error:", err);
    res.status(500).json({ error: "Failed to get user wallet" });
  }
};

/**
 * Admin: Search users for wallet tool
 * GET /api/admin/wallet/search?q=email&tier=high|medium|low
 */
exports.adminSearchUsers = async (req, res) => {
  try {
    const { q, tier } = req.query;

    // Build query conditions
    const conditions = [];

    // Text search if provided
    if (q && q.length >= 2) {
      conditions.push({
        $or: [
          { email: { $regex: q, $options: "i" } },
          { name: { $regex: q, $options: "i" } },
        ],
      });
    }

    // PATCH_32: Balance tier filter with updated thresholds
    // High: >= $500, Medium: $100-499, Low: < $100
    if (tier) {
      switch (tier) {
        case "high":
          conditions.push({ walletBalance: { $gte: 500 } });
          break;
        case "medium":
          conditions.push({ walletBalance: { $gte: 100, $lt: 500 } });
          break;
        case "low":
          conditions.push({ walletBalance: { $lt: 100 } });
          break;
      }
    }

    // If no conditions, require at least one filter
    if (conditions.length === 0) {
      return res
        .status(400)
        .json({ error: "Provide search query (min 2 chars) or tier filter" });
    }

    const query =
      conditions.length === 1 ? conditions[0] : { $and: conditions };

    const users = await User.find(query)
      .select("name email walletBalance")
      .sort({ walletBalance: -1 })
      .limit(20)
      .lean();

    res.json({
      success: true,
      users,
      filter: { q, tier },
    });
  } catch (err) {
    console.error("adminSearchUsers error:", err);
    res.status(500).json({ error: "Search failed" });
  }
};

/**
 * Admin: Get wallet statistics
 * GET /api/admin/wallet/stats
 */
exports.adminGetStats = async (req, res) => {
  try {
    const [totalBalanceResult, transactionStats, userCounts] =
      await Promise.all([
        User.aggregate([
          { $group: { _id: null, total: { $sum: "$walletBalance" } } },
        ]),
        WalletTransaction.aggregate([
          {
            $group: {
              _id: "$type",
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ]),
        // Count users by balance range
        User.aggregate([
          {
            $facet: {
              low: [
                { $match: { walletBalance: { $gte: 0, $lte: 50 } } },
                { $count: "count" },
              ],
              medium: [
                { $match: { walletBalance: { $gt: 50, $lte: 300 } } },
                { $count: "count" },
              ],
              high: [
                { $match: { walletBalance: { $gt: 300 } } },
                { $count: "count" },
              ],
              total: [{ $count: "count" }],
            },
          },
        ]),
      ]);

    const totalBalance = totalBalanceResult[0]?.total || 0;
    const stats = {
      totalBalance,
      credits: { total: 0, count: 0 },
      debits: { total: 0, count: 0 },
      userCounts: {
        low: userCounts[0]?.low[0]?.count || 0,
        medium: userCounts[0]?.medium[0]?.count || 0,
        high: userCounts[0]?.high[0]?.count || 0,
        total: userCounts[0]?.total[0]?.count || 0,
      },
    };

    transactionStats.forEach((s) => {
      if (s._id === "credit") {
        stats.credits = { total: s.total, count: s.count };
      } else if (s._id === "debit") {
        stats.debits = { total: s.total, count: s.count };
      }
    });

    res.json({
      success: true,
      stats,
    });
  } catch (err) {
    console.error("adminGetStats error:", err);
    res.status(500).json({ error: "Failed to get stats" });
  }
};

/**
 * Admin: List all users with wallet balance (paginated with filters)
 * GET /api/admin/wallet/users?balanceLevel=low|medium|high&page=1&limit=20&search=
 */
exports.adminListUsers = async (req, res) => {
  try {
    const {
      balanceLevel,
      page = 1,
      limit = 20,
      search,
      sort = "-walletBalance",
    } = req.query;

    const filter = {};

    // Balance level filter
    if (balanceLevel === "low") {
      filter.walletBalance = { $gte: 0, $lte: 50 };
    } else if (balanceLevel === "medium") {
      filter.walletBalance = { $gt: 50, $lte: 300 };
    } else if (balanceLevel === "high") {
      filter.walletBalance = { $gt: 300 };
    }

    // Search filter
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      filter.$or = [{ email: searchRegex }, { name: searchRegex }];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const limitNum = Math.min(parseInt(limit, 10), 100);

    // Build sort object
    let sortObj = { walletBalance: -1 };
    if (sort === "walletBalance") sortObj = { walletBalance: 1 };
    else if (sort === "-walletBalance") sortObj = { walletBalance: -1 };
    else if (sort === "name") sortObj = { name: 1 };
    else if (sort === "-name") sortObj = { name: -1 };
    else if (sort === "createdAt") sortObj = { createdAt: 1 };
    else if (sort === "-createdAt") sortObj = { createdAt: -1 };

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("_id name email walletBalance createdAt")
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      users,
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / limitNum),
      filterOptions: {
        balanceLevels: [
          { value: "all", label: "All Users" },
          { value: "low", label: "Low Balance (0-50)" },
          { value: "medium", label: "Medium Balance (51-300)" },
          { value: "high", label: "High Balance (300+)" },
        ],
      },
    });
  } catch (err) {
    console.error("adminListUsers error:", err);
    res.status(500).json({ error: "Failed to list users" });
  }
};

/**
 * Process refund to wallet (internal function)
 * Used when orders are cancelled/refunded
 */
exports.processRefund = async (userId, amount, orderId, description = "") => {
  try {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error("Invalid refund amount");
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $inc: { walletBalance: numAmount } },
      { new: true },
    );

    if (!user) {
      throw new Error("User not found for refund");
    }

    await WalletTransaction.create({
      user: userId,
      type: "credit",
      amount: numAmount,
      source: "refund",
      referenceId: orderId,
      description:
        description || `Refund for order #${orderId.toString().slice(-6)}`,
      balanceAfter: user.walletBalance,
    });

    return { success: true, newBalance: user.walletBalance };
  } catch (err) {
    console.error("processRefund error:", err);
    throw err;
  }
};
