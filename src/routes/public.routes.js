/**
 * PATCH_41: Public Routes
 * Non-authenticated public data endpoints
 */

const express = require("express");
const router = express.Router();

/**
 * GET /api/public/trust
 * Returns trust signals for display on homepage
 * Non-numeric, evergreen content only
 */
router.get("/trust", (req, res) => {
  res.json({
    ok: true,
    trustSignals: [
      {
        id: "manual_verification",
        icon: "🔍",
        title: "Manual Verification",
        description: "Human-reviewed since 2024",
      },
      {
        id: "accounts_processed",
        icon: "✅",
        title: "Accounts Processed",
        description: "Hundreds of successful verifications",
      },
      {
        id: "fulfillment_time",
        icon: "⚡",
        title: "Fast Fulfillment",
        description: "24-48 hour average completion",
      },
      {
        id: "human_support",
        icon: "💬",
        title: "Human Support",
        description: "Real people, real assistance",
      },
    ],
  });
});

/**
 * GET /api/public/categories
 * Returns available service categories
 */
router.get("/categories", (req, res) => {
  res.json({
    ok: true,
    categories: [
      {
        id: "online_gigs",
        name: "Online Gigs",
        icon: "💼",
        description: "Microjobs, AI training, and freelance work",
      },
      {
        id: "forex_crypto",
        name: "Forex & Crypto",
        icon: "📈",
        description: "Trading accounts and exchange verification",
      },
      {
        id: "banks_wallets",
        name: "Banks & Wallets",
        icon: "🏦",
        description: "E-wallets and payment gateway accounts",
      },
    ],
  });
});

module.exports = router;
