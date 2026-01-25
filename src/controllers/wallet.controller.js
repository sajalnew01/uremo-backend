/**
 * PATCH_23: Wallet Controller
 * Handles wallet balance operations, top-ups, and transactions
 */
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");

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
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const userId = req.user.id || req.user._id;

    if (
      order.user.toString() !== userId.toString() &&
      order.userId?.toString() !== userId.toString()
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (order.paymentStatus === "paid") {
      return res.status(400).json({ error: "Order already paid" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const orderAmount = order.totalPrice || order.price || 0;

    if (user.walletBalance < orderAmount) {
      return res.status(400).json({
        error: "Insufficient wallet balance",
        required: orderAmount,
        available: user.walletBalance,
      });
    }

    // Deduct from wallet
    user.walletBalance -= orderAmount;
    await user.save();

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
      balanceAfter: user.walletBalance,
    });

    // Mark order as paid
    order.paymentStatus = "paid";
    order.paymentMethod = "wallet";
    order.status = "processing";
    await order.save();

    // Process affiliate commission if applicable
    try {
      const { processOrderCommission } = require("./affiliate.controller");
      await processOrderCommission(order._id);
    } catch (affErr) {
      console.error("Affiliate commission processing error:", affErr);
    }

    res.json({
      success: true,
      message: "Payment successful",
      order: {
        _id: order._id,
        paymentStatus: order.paymentStatus,
        status: order.status,
      },
      walletBalance: user.walletBalance,
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
 * GET /api/admin/wallet/search?q=email
 */
exports.adminSearchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res
        .status(400)
        .json({ error: "Search query must be at least 2 characters" });
    }

    const users = await User.find({
      $or: [
        { email: { $regex: q, $options: "i" } },
        { name: { $regex: q, $options: "i" } },
      ],
    })
      .select("name email walletBalance")
      .limit(10)
      .lean();

    res.json({
      success: true,
      users,
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
    const [totalBalanceResult, transactionStats] = await Promise.all([
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
    ]);

    const totalBalance = totalBalanceResult[0]?.total || 0;
    const stats = {
      totalBalance,
      credits: { total: 0, count: 0 },
      debits: { total: 0, count: 0 },
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
