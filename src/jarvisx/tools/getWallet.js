/**
 * PATCH_36: getWallet Tool
 * Retrieves user's wallet balance and recent transactions
 */

const User = require("../../models/User");
const WalletTransaction = require("../../models/WalletTransaction");

/**
 * Get user's wallet info
 * @param {Object} params - { limit }
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function getWallet(params, context) {
  const { limit = 5 } = params;
  const { userId } = context;

  // Get user for current balance
  const user = await User.findById(userId)
    .select("walletBalance affiliateBalance")
    .lean();

  if (!user) {
    return {
      data: null,
      message: "User not found",
    };
  }

  // Get recent transactions
  const transactions = await WalletTransaction.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(parseInt(limit) || 5, 20))
    .lean();

  const formatted = transactions.map((t) => ({
    type: t.type,
    amount: t.amount,
    source: t.source,
    description: t.description || "",
    balanceAfter: t.balanceAfter,
    date: t.createdAt,
  }));

  // Calculate totals
  const totalCredits = transactions
    .filter((t) => t.type === "credit")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDebits = transactions
    .filter((t) => t.type === "debit")
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    data: {
      walletBalance: user.walletBalance || 0,
      affiliateBalance: user.affiliateBalance || 0,
      totalBalance: (user.walletBalance || 0) + (user.affiliateBalance || 0),
      recentTransactions: formatted,
    },
    summary: {
      currentBalance: user.walletBalance || 0,
      affiliateEarnings: user.affiliateBalance || 0,
      recentCredits: totalCredits,
      recentDebits: totalDebits,
    },
    message: `Wallet Balance: $${(user.walletBalance || 0).toFixed(2)} | Affiliate Earnings: $${(user.affiliateBalance || 0).toFixed(2)}`,
  };
}

module.exports = getWallet;
