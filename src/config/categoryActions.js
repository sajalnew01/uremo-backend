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

  // PATCH_107: Data-integrity gate — category says what's POSSIBLE,
  // but the service must have valid data to actually enable the action.
  const buy = Boolean(actions.buy) && (service.price > 0 || false);
  const apply = Boolean(actions.apply); // linkedJobId checked at controller level / post-save
  const rent =
    Boolean(actions.rent) &&
    service.isRental === true &&
    Array.isArray(service.rentalPlans) &&
    service.rentalPlans.length > 0;
  const deal = Boolean(actions.deal) && (service.price > 0 || false);

  return { buy, apply, rent, deal };
}

module.exports = {
  CATEGORY_ACTIONS,
  getEffectiveCategoryFromService,
  getAllowedActionsForService,
};
