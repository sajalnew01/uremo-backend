// PATCH_38: Central category action rules engine

/**
 * CATEGORY_ACTIONS describes which actions are allowed per (effective) category.
 *
 * NOTE: The platform currently has some legacy categories/subcategories.
 * Use `getEffectiveCategoryFromService()` to map legacy values into one
 * of the categories defined here.
 */
const CATEGORY_ACTIONS = Object.freeze({
  microjobs: { buy: true, apply: true, rent: false, deal: false },
  writing: { buy: true, apply: true, rent: false, deal: false },
  online_gigs: { buy: true, apply: true, rent: false, deal: false },

  banks_wallets: { buy: true, apply: false, rent: true, deal: true },
  crypto_accounts: { buy: true, apply: false, rent: true, deal: true },
  forex_accounts: { buy: true, apply: false, rent: true, deal: false },

  // Backwards-compatible buckets
  rentals: { buy: true, apply: false, rent: true, deal: false },
  general: { buy: true, apply: false, rent: false, deal: false },
});

function clampString(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

function getEffectiveCategoryFromService(service) {
  const category = clampString(service?.category);
  const subcategory = clampString(service?.subcategory);

  // Already a v2 category
  if (CATEGORY_ACTIONS[category]) return category;

  // Legacy mapping: banks_gateways_wallets -> banks_wallets
  if (category === "banks_gateways_wallets") return "banks_wallets";

  // Legacy mapping: forex_crypto split by subcategory
  if (category === "forex_crypto") {
    if (subcategory.includes("crypto")) return "crypto_accounts";
    return "forex_accounts";
  }

  // Legacy or unknown
  if (category === "") return "general";
  if (category === "rentals") return "rentals";
  if (category === "microjobs") return "microjobs";

  return "general";
}

function getAllowedActionsForService(service) {
  const effective = getEffectiveCategoryFromService(service);
  const actions = CATEGORY_ACTIONS[effective] || CATEGORY_ACTIONS.general;
  // Return a fresh object for Mongoose subdocument assignment
  return {
    buy: Boolean(actions.buy),
    apply: Boolean(actions.apply),
    rent: Boolean(actions.rent),
    deal: Boolean(actions.deal),
  };
}

module.exports = {
  CATEGORY_ACTIONS,
  getEffectiveCategoryFromService,
  getAllowedActionsForService,
};
