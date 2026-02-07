/**
 * PATCH_23: Wallet Controller
 * PATCH_80: Payment Gateway Foundation - No instant credits, verification required
 *
 * KEY PRINCIPLES:
 * - Wallet balance ONLY changes when topup status === 'success'
 * - All topups start as 'initiated', require verification to complete
 * - Internal operations (service purchase, admin adjust) are instant
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

    // PATCH_80: Also return pending topups count
    const pendingCount = await WalletTransaction.countDocuments({
      user: userId,
      source: "topup",
      status: { $in: ["initiated", "pending"] },
    });

    res.json({
      success: true,
      balance: user.walletBalance || 0,
      pendingTopups: pendingCount,
    });
  } catch (err) {
    console.error("getBalance error:", err);
    res.status(500).json({ error: "Failed to get balance" });
  }
};

/**
 * PATCH_80: Initiate wallet topup (NO INSTANT CREDIT)
 * POST /api/wallet/topup
 * Body: { amount }
 *
 * This creates a transaction with status='initiated'.
 * Balance is NOT updated here - it only updates when admin verifies
 * or when payment gateway confirms (future).
 *
 * Flow:
 * 1. User requests topup → status = 'initiated'
 * 2. User pays via gateway (future) or manual verification
 * 3. Admin or webhook verifies → status = 'success', balance updated
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

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // PATCH_80: Create transaction with status='initiated' (NO balance change)
    const transaction = await WalletTransaction.create({
      user: userId,
      type: "credit",
      amount: numAmount,
      source: "topup",
      status: "initiated", // CRITICAL: Not 'success' - no balance change yet
      provider: "manual", // Phase 1: Manual verification by admin
      providerRef: null,
      description: "Wallet top-up (pending verification)",
      balanceAfter: null, // Will be set when verified
    });

    // In future: redirect to payment gateway here
    // For now: user sees "pending" and admin must verify

    res.json({
      success: true,
      message: "Top-up request submitted. Pending verification.",
      transactionId: transaction._id,
      status: "initiated",
      amount: numAmount,
      // DO NOT return updated balance - it hasn't changed
      currentBalance: user.walletBalance,
    });
  } catch (err) {
    console.error("topUp error:", err);
    res.status(500).json({ error: "Failed to initiate top-up" });
  }
};

/**
 * PATCH_80: Get user's pending topup requests
 * GET /api/wallet/pending
 */
exports.getPendingTopups = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const pendingTopups = await WalletTransaction.find({
      user: userId,
      source: "topup",
      status: { $in: ["initiated", "pending"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      pendingTopups,
    });
  } catch (err) {
    console.error("getPendingTopups error:", err);
    res.status(500).json({ error: "Failed to get pending topups" });
  }
};

/**
 * PATCH_80: Cancel a pending topup request
 * POST /api/wallet/cancel-topup
 * Body: { transactionId }
 */
exports.cancelTopup = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const userId = req.user.id || req.user._id;

    if (!transactionId) {
      return res.status(400).json({ error: "Transaction ID required" });
    }

    const transaction = await WalletTransaction.findOne({
      _id: transactionId,
      user: userId,
      source: "topup",
      status: "initiated", // Only can cancel 'initiated', not 'pending' (in progress)
    });

    if (!transaction) {
      return res.status(404).json({
        error: "Transaction not found or cannot be cancelled",
      });
    }

    transaction.status = "failed";
    transaction.failureReason = "Cancelled by user";
    await transaction.save();

    res.json({
      success: true,
      message: "Top-up request cancelled",
    });
  } catch (err) {
    console.error("cancelTopup error:", err);
    res.status(500).json({ error: "Failed to cancel top-up" });
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

    // PATCH_39: Always return fresh wallet balance
    const freshUser = await User.findById(userId).select("walletBalance");
    res.json({
      success: true,
      balance: freshUser?.walletBalance || 0,
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

    // Create debit transaction (PATCH_80: Internal operations are instant - status='success')
    const source =
      order.serviceType === "rental" ? "rental_purchase" : "service_purchase";
    await WalletTransaction.create({
      user: userId,
      type: "debit",
      amount: orderAmount,
      source,
      status: "success", // PATCH_80: Internal debit is instant
      provider: "internal", // PATCH_80: Internal system operation
      referenceId: order._id,
      description: `Payment for order #${order._id.toString().slice(-6)}`,
      balanceAfter: updateResult.walletBalance,
    });

    // PATCH_31: Use FlowEngine for status transition
    // FlowEngine handles: status update, timeline, affiliate commission (via hooks)
    try {
      await FlowEngine.transition("order", order._id, "in_progress", {
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
      order.status = "in_progress";
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
 * PATCH-64: Enhanced with guardrails and audit logging
 */
exports.adminAdjustBalance = async (req, res) => {
  try {
    const { logAdminAction } = require("../services/adminAudit.service");
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

    // PATCH-64 GUARDRAIL: Require description/reason for all adjustments
    if (!description || description.trim().length < 5) {
      return res.status(400).json({
        error: "Description is required (minimum 5 characters)",
        hint: "Provide a reason for this wallet adjustment",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const previousBalance = user.walletBalance || 0;
    const resultingBalance =
      type === "credit"
        ? previousBalance + numAmount
        : previousBalance - numAmount;

    // PATCH-64 GUARDRAIL: Check if debit would result in negative balance
    if (type === "debit" && resultingBalance < 0) {
      return res.status(400).json({
        error:
          "Insufficient balance for debit - would result in negative balance",
        currentBalance: previousBalance,
        requestedDebit: numAmount,
        resultingBalance: resultingBalance,
      });
    }

    // PATCH-64 GUARDRAIL: Warn on large adjustments (> $1000)
    if (numAmount > 1000) {
      console.warn(
        `[AUDIT] Large wallet adjustment: $${numAmount} ${type} for user ${userId} by admin ${req.user?.email}`,
      );
    }

    // Apply adjustment
    if (type === "credit") {
      user.walletBalance += numAmount;
    } else {
      user.walletBalance -= numAmount;
    }
    await user.save();

    // Create transaction record (PATCH_80: Admin adjustments are instant)
    await WalletTransaction.create({
      user: userId,
      type,
      amount: numAmount,
      source: "admin_adjustment",
      status: "success", // PATCH_80: Admin adjustment is instant
      provider: "manual", // PATCH_80: Admin manual operation
      description: description || `Admin ${type} by ${req.user.email}`,
      balanceAfter: user.walletBalance,
    });

    // PATCH-64: Log admin action
    await logAdminAction({
      adminId: req.user?._id || req.user?.id,
      adminEmail: req.user?.email,
      action: type === "credit" ? "wallet_credit" : "wallet_debit",
      entityType: "wallet",
      entityId: String(userId),
      previousState: { balance: previousBalance },
      newState: { balance: user.walletBalance },
      reason: description,
      metadata: { amount: numAmount, type },
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
 * PATCH_80: Admin - Get all pending topup requests
 * GET /api/admin/wallet/pending-topups
 * Returns list of all transactions with status='initiated' or 'pending'
 */
exports.adminGetPendingTopups = async (req, res) => {
  try {
    const { logAdminAction } = require("../services/adminAudit.service");
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const [pendingTopups, total] = await Promise.all([
      WalletTransaction.find({
        source: "topup",
        status: { $in: ["initiated", "pending"] },
      })
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WalletTransaction.countDocuments({
        source: "topup",
        status: { $in: ["initiated", "pending"] },
      }),
    ]);

    res.json({
      success: true,
      pendingTopups,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("adminGetPendingTopups error:", err);
    res.status(500).json({ error: "Failed to get pending topups" });
  }
};

/**
 * PATCH_80: Admin - Verify a topup request
 * POST /api/admin/wallet/verify-topup
 * Body: { transactionId, action: 'approve' | 'reject', reason? }
 *
 * THIS IS THE ONLY WAY TO CREDIT WALLET FOR TOPUPS
 * State transitions:
 *   initiated -> pending (if admin marks as pending)
 *   initiated -> success (if admin approves)
 *   initiated -> failed (if admin rejects)
 *   pending -> success (if admin approves)
 *   pending -> failed (if admin rejects)
 */
exports.adminVerifyTopup = async (req, res) => {
  try {
    const { logAdminAction } = require("../services/adminAudit.service");
    const { transactionId, action, reason } = req.body;

    if (!transactionId || !action) {
      return res
        .status(400)
        .json({ error: "transactionId and action required" });
    }

    if (!["approve", "reject", "pending"].includes(action)) {
      return res
        .status(400)
        .json({ error: "Action must be approve, reject, or pending" });
    }

    // Find the transaction
    const transaction = await WalletTransaction.findById(
      transactionId,
    ).populate("user", "name email walletBalance");
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Verify it's a topup
    if (transaction.source !== "topup") {
      return res
        .status(400)
        .json({
          error: "Only topup transactions can be verified via this endpoint",
        });
    }

    // Check current status
    if (transaction.status === "success") {
      return res
        .status(400)
        .json({ error: "Transaction already approved - no action needed" });
    }
    if (transaction.status === "failed") {
      return res
        .status(400)
        .json({ error: "Transaction already failed/rejected" });
    }

    const previousStatus = transaction.status;
    const user = await User.findById(transaction.user._id || transaction.user);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Validate state transition
    let newStatus;
    if (action === "approve") {
      if (!WalletTransaction.isValidTransition(transaction.status, "success")) {
        return res.status(400).json({
          error: `Cannot transition from ${transaction.status} to success`,
        });
      }
      newStatus = "success";
    } else if (action === "reject") {
      if (!WalletTransaction.isValidTransition(transaction.status, "failed")) {
        return res.status(400).json({
          error: `Cannot transition from ${transaction.status} to failed`,
        });
      }
      newStatus = "failed";
    } else if (action === "pending") {
      if (!WalletTransaction.isValidTransition(transaction.status, "pending")) {
        return res.status(400).json({
          error: `Cannot transition from ${transaction.status} to pending`,
        });
      }
      newStatus = "pending";
    }

    // Process based on action
    if (action === "approve") {
      // CRITICAL: This is the ONLY place topup balance changes
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { $inc: { walletBalance: transaction.amount } },
        { new: true },
      );

      if (!updatedUser) {
        return res.status(500).json({ error: "Failed to update user balance" });
      }

      transaction.status = "success";
      transaction.balanceAfter = updatedUser.walletBalance;
      transaction.description = "Wallet top-up (verified)";
      await transaction.save();

      // Log admin action
      await logAdminAction({
        adminId: req.user?._id || req.user?.id,
        adminEmail: req.user?.email,
        action: "topup_approve",
        entityType: "wallet_transaction",
        entityId: String(transactionId),
        previousState: { status: previousStatus },
        newState: {
          status: "success",
          balanceAfter: updatedUser.walletBalance,
        },
        reason: reason || "Topup verified and approved",
        metadata: { amount: transaction.amount, userId: String(user._id) },
      });

      // Notify user
      try {
        await sendNotification({
          userId: user._id,
          title: "Wallet Top-up Confirmed",
          message: `Your top-up of $${transaction.amount.toFixed(2)} has been verified. New balance: $${updatedUser.walletBalance.toFixed(2)}`,
          type: "wallet",
        });
      } catch (notifErr) {
        console.error(
          "[notification] topup approval failed:",
          notifErr.message,
        );
      }

      res.json({
        success: true,
        message: `Approved $${transaction.amount.toFixed(2)} topup for ${user.email}`,
        transaction: {
          _id: transaction._id,
          status: "success",
          amount: transaction.amount,
          balanceAfter: updatedUser.walletBalance,
        },
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          walletBalance: updatedUser.walletBalance,
        },
      });
    } else if (action === "reject") {
      transaction.status = "failed";
      transaction.failureReason = reason || "Rejected by admin";
      await transaction.save();

      // Log admin action
      await logAdminAction({
        adminId: req.user?._id || req.user?.id,
        adminEmail: req.user?.email,
        action: "topup_reject",
        entityType: "wallet_transaction",
        entityId: String(transactionId),
        previousState: { status: previousStatus },
        newState: { status: "failed" },
        reason: reason || "Topup rejected",
        metadata: { amount: transaction.amount, userId: String(user._id) },
      });

      // Notify user
      try {
        await sendNotification({
          userId: user._id,
          title: "Wallet Top-up Failed",
          message: `Your top-up request of $${transaction.amount.toFixed(2)} could not be processed. ${reason ? `Reason: ${reason}` : ""}`,
          type: "wallet",
        });
      } catch (notifErr) {
        console.error(
          "[notification] topup rejection failed:",
          notifErr.message,
        );
      }

      res.json({
        success: true,
        message: `Rejected topup request for ${user.email}`,
        transaction: {
          _id: transaction._id,
          status: "failed",
          amount: transaction.amount,
          failureReason: transaction.failureReason,
        },
      });
    } else if (action === "pending") {
      transaction.status = "pending";
      await transaction.save();

      res.json({
        success: true,
        message: `Marked topup as pending for ${user.email}`,
        transaction: {
          _id: transaction._id,
          status: "pending",
          amount: transaction.amount,
        },
      });
    }
  } catch (err) {
    console.error("adminVerifyTopup error:", err);
    res.status(500).json({ error: "Failed to verify topup" });
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

    // PATCH_80: Refunds are internal instant operations
    await WalletTransaction.create({
      user: userId,
      type: "credit",
      amount: numAmount,
      source: "refund",
      status: "success", // PATCH_80: Refund is instant
      provider: "internal", // PATCH_80: Internal system operation
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
