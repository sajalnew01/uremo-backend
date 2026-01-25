/**
 * PATCH_23: Affiliate Controller
 * Handles affiliate stats, transactions, and withdrawals
 */

const User = require("../models/User");
const AffiliateTransaction = require("../models/AffiliateTransaction");
const AffiliateWithdrawal = require("../models/AffiliateWithdrawal");

// Global commission rate (10%)
const COMMISSION_RATE = 0.1;
const MINIMUM_WITHDRAWAL = 10;

/**
 * Get user's affiliate stats
 * GET /api/affiliate/stats
 */
exports.getMyAffiliateStats = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    // Get user with affiliate fields
    const user = await User.findById(userId).select(
      "referralCode affiliateBalance totalAffiliateEarned",
    );

    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    // Count referred users
    const referredUsersCount = await User.countDocuments({
      referredBy: userId,
    });

    // Count transactions
    const transactionStats = await AffiliateTransaction.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total: { $sum: "$commission" },
        },
      },
    ]);

    // Pending withdrawals
    const pendingWithdrawals = await AffiliateWithdrawal.aggregate([
      { $match: { user: userId, status: "pending" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const stats = {
      referralCode: user.referralCode,
      affiliateBalance: user.affiliateBalance || 0,
      totalAffiliateEarned: user.totalAffiliateEarned || 0,
      referredUsersCount,
      commissionRate: COMMISSION_RATE * 100, // 10%
      minimumWithdrawal: MINIMUM_WITHDRAWAL,
      pendingWithdrawals: pendingWithdrawals[0]?.total || 0,
      transactionsByStatus: transactionStats.reduce((acc, s) => {
        acc[s._id] = { count: s.count, total: s.total };
        return acc;
      }, {}),
    };

    res.json({ ok: true, stats });
  } catch (err) {
    console.error("getMyAffiliateStats error:", err);
    res
      .status(500)
      .json({ ok: false, message: "Failed to get affiliate stats" });
  }
};

/**
 * Get user's affiliate transactions
 * GET /api/affiliate/transactions
 */
exports.getMyAffiliateTransactions = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      AffiliateTransaction.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("referredUser", "name email")
        .populate("order", "status amount")
        .lean(),
      AffiliateTransaction.countDocuments({ user: userId }),
    ]);

    res.json({
      ok: true,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("getMyAffiliateTransactions error:", err);
    res.status(500).json({ ok: false, message: "Failed to get transactions" });
  }
};

/**
 * Request withdrawal
 * POST /api/affiliate/withdraw
 */
exports.withdrawAffiliateBalance = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { amount, paymentMethod, paymentDetails } = req.body;

    // Validate input
    if (!amount || !paymentMethod || !paymentDetails) {
      return res.status(400).json({
        ok: false,
        message: "Amount, payment method, and payment details required",
      });
    }

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount < MINIMUM_WITHDRAWAL) {
      return res.status(400).json({
        ok: false,
        message: `Minimum withdrawal is $${MINIMUM_WITHDRAWAL}`,
      });
    }

    // Get user balance
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    if (user.affiliateBalance < withdrawAmount) {
      return res.status(400).json({
        ok: false,
        message: `Insufficient balance. Available: $${user.affiliateBalance.toFixed(2)}`,
      });
    }

    // Check for pending withdrawals
    const pendingWithdrawal = await AffiliateWithdrawal.findOne({
      user: userId,
      status: "pending",
    });

    if (pendingWithdrawal) {
      return res.status(400).json({
        ok: false,
        message: "You already have a pending withdrawal request",
      });
    }

    // Create withdrawal request
    const withdrawal = await AffiliateWithdrawal.create({
      user: userId,
      amount: withdrawAmount,
      paymentMethod,
      paymentDetails,
      status: "pending",
    });

    // Deduct from balance (will be refunded if rejected)
    user.affiliateBalance -= withdrawAmount;
    await user.save();

    res.json({
      ok: true,
      message: "Withdrawal request submitted",
      withdrawal: {
        _id: withdrawal._id,
        amount: withdrawal.amount,
        paymentMethod: withdrawal.paymentMethod,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt,
      },
    });
  } catch (err) {
    console.error("withdrawAffiliateBalance error:", err);
    res.status(500).json({ ok: false, message: "Failed to submit withdrawal" });
  }
};

/**
 * Get user's withdrawal history
 * GET /api/affiliate/withdrawals
 */
exports.getMyWithdrawals = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [withdrawals, total] = await Promise.all([
      AffiliateWithdrawal.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AffiliateWithdrawal.countDocuments({ user: userId }),
    ]);

    res.json({
      ok: true,
      withdrawals,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("getMyWithdrawals error:", err);
    res.status(500).json({ ok: false, message: "Failed to get withdrawals" });
  }
};

// ===== ADMIN FUNCTIONS =====

/**
 * Get all withdrawal requests (admin)
 * GET /api/admin/affiliate/withdrawals
 */
exports.getAdminWithdrawals = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status || "";

    const filter = {};
    if (status) filter.status = status;

    const [withdrawals, total] = await Promise.all([
      AffiliateWithdrawal.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email referralCode")
        .populate("processedBy", "name email")
        .lean(),
      AffiliateWithdrawal.countDocuments(filter),
    ]);

    res.json({
      ok: true,
      withdrawals,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("getAdminWithdrawals error:", err);
    res.status(500).json({ ok: false, message: "Failed to get withdrawals" });
  }
};

/**
 * Approve withdrawal (admin)
 * PUT /api/admin/affiliate/withdrawals/:id/approve
 */
exports.approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionId, adminNotes } = req.body;

    const withdrawal = await AffiliateWithdrawal.findById(id);
    if (!withdrawal) {
      return res
        .status(404)
        .json({ ok: false, message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({
        ok: false,
        message: `Cannot approve withdrawal with status: ${withdrawal.status}`,
      });
    }

    withdrawal.status = "paid";
    withdrawal.transactionId = transactionId || "";
    withdrawal.adminNotes = adminNotes || "";
    withdrawal.processedBy = req.user.id || req.user._id;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    res.json({
      ok: true,
      message: "Withdrawal approved and marked as paid",
      withdrawal,
    });
  } catch (err) {
    console.error("approveWithdrawal error:", err);
    res
      .status(500)
      .json({ ok: false, message: "Failed to approve withdrawal" });
  }
};

/**
 * Reject withdrawal (admin)
 * PUT /api/admin/affiliate/withdrawals/:id/reject
 */
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    const withdrawal = await AffiliateWithdrawal.findById(id);
    if (!withdrawal) {
      return res
        .status(404)
        .json({ ok: false, message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({
        ok: false,
        message: `Cannot reject withdrawal with status: ${withdrawal.status}`,
      });
    }

    // Refund balance to user
    const user = await User.findById(withdrawal.user);
    if (user) {
      user.affiliateBalance += withdrawal.amount;
      await user.save();
    }

    withdrawal.status = "rejected";
    withdrawal.adminNotes = adminNotes || "Withdrawal rejected by admin";
    withdrawal.processedBy = req.user.id || req.user._id;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    res.json({
      ok: true,
      message: "Withdrawal rejected and balance refunded",
      withdrawal,
    });
  } catch (err) {
    console.error("rejectWithdrawal error:", err);
    res.status(500).json({ ok: false, message: "Failed to reject withdrawal" });
  }
};

/**
 * Get all affiliate transactions (admin)
 * GET /api/admin/affiliate/transactions
 */
exports.getAdminTransactions = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      AffiliateTransaction.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email referralCode")
        .populate("referredUser", "name email")
        .populate("order", "status amount")
        .lean(),
      AffiliateTransaction.countDocuments(),
    ]);

    // Get summary stats
    const stats = await AffiliateTransaction.aggregate([
      {
        $group: {
          _id: null,
          totalCommissions: { $sum: "$commission" },
          totalOrders: { $sum: "$orderAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      ok: true,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: stats[0] || { totalCommissions: 0, totalOrders: 0, count: 0 },
    });
  } catch (err) {
    console.error("getAdminTransactions error:", err);
    res.status(500).json({ ok: false, message: "Failed to get transactions" });
  }
};

/**
 * Process affiliate commission for a paid order
 * Called internally when order is marked as paid
 */
exports.processOrderCommission = async (order, buyerId) => {
  try {
    // Get buyer
    const buyer = await User.findById(buyerId);
    if (!buyer || !buyer.referredBy) {
      return null; // No referrer, no commission
    }

    // Get referrer
    const referrer = await User.findById(buyer.referredBy);
    if (!referrer) {
      return null;
    }

    // Calculate commission
    const orderAmount = order.amount || order.price || 0;
    const commission = orderAmount * COMMISSION_RATE;

    if (commission <= 0) {
      return null;
    }

    // Create transaction
    const transaction = await AffiliateTransaction.create({
      user: referrer._id,
      referredUser: buyer._id,
      order: order._id,
      orderAmount,
      commissionRate: COMMISSION_RATE,
      commission,
      status: "approved",
    });

    // Update referrer balance
    referrer.affiliateBalance = (referrer.affiliateBalance || 0) + commission;
    referrer.totalAffiliateEarned =
      (referrer.totalAffiliateEarned || 0) + commission;
    await referrer.save();

    console.log(
      `[AFFILIATE] Commission $${commission.toFixed(2)} credited to ${referrer.email} for order ${order._id}`,
    );

    return transaction;
  } catch (err) {
    console.error("[AFFILIATE] processOrderCommission error:", err);
    return null;
  }
};

// Export commission rate for other modules
exports.COMMISSION_RATE = COMMISSION_RATE;
exports.MINIMUM_WITHDRAWAL = MINIMUM_WITHDRAWAL;
