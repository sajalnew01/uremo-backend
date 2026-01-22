const mongoose = require("mongoose");

// PATCH_19: Category and Subcategory enums for 3-tier service organization
const CATEGORY_ENUM = ["microjobs", "forex_crypto", "banks_gateways_wallets"];

// PATCH_19: Subcategory mapped by category
const SUBCATEGORY_BY_CATEGORY = {
  microjobs: ["fresh_account", "already_onboarded"],
  forex_crypto: ["forex_platform_creation", "crypto_platform_creation"],
  banks_gateways_wallets: ["banks", "payment_gateways", "wallets"],
};

// PATCH_19: Flat list of all subcategories for schema validation
const ALL_SUBCATEGORIES = Object.values(SUBCATEGORY_BY_CATEGORY).flat();

// PATCH_18: Enhanced schema with all fields for Admin CMS control
const serviceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // PATCH_19/20: Category with fallback (not required for backwards compatibility)
    category: {
      type: String,
      trim: true,
      enum: {
        values: [...CATEGORY_ENUM, "general"], // Allow "general" for legacy
        message:
          "Category must be one of: microjobs, forex_crypto, banks_gateways_wallets, general",
      },
      default: "microjobs",
      index: true,
    },

    // PATCH_19/20: Subcategory field with validation (optional for backwards compat)
    subcategory: {
      type: String,
      trim: true,
      enum: {
        values: [...ALL_SUBCATEGORIES, "general"], // Allow "general" for legacy
        message: "Invalid subcategory for the selected category",
      },
      index: true,
    },

    // PATCH_20: Country-based pricing - key is country code, value is price
    countryPricing: {
      type: Map,
      of: Number,
      default: {},
    },

    description: {
      type: String,
      default: "",
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "USD",
    },

    deliveryType: {
      type: String,
      enum: ["instant", "manual", "assisted"],
      default: "manual",
    },

    images: [
      {
        type: String,
      },
    ],

    imageUrl: {
      type: String,
      default: "",
    },

    requirements: {
      type: String,
      default: "",
    },

    shortDescription: {
      type: String,
      default: "",
    },

    // PATCH_18: listingType enum for two-path UX
    listingType: {
      type: String,
      enum: ["fresh_account", "already_onboarded", "general"],
      default: "general",
      index: true,
    },

    // PATCH_18: Countries array - allows ANY string (no enum restriction)
    countries: {
      type: [String],
      default: ["Global"],
      index: true,
    },

    // PATCH_18: Platform field (e.g., "Outlier", "Scale AI", "Appen")
    platform: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    // PATCH_18: Subject field for fresh_account (e.g., "Dentistry", "Law", "Math")
    subject: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    // PATCH_18: Project name for already_onboarded (e.g., "Valkyrie v2", "Arrow")
    projectName: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },

    // PATCH_18: Pay rate for already_onboarded services (hourly)
    payRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    // PATCH_18: Instant delivery flag for already_onboarded
    instantDelivery: {
      type: Boolean,
      default: false,
    },

    // PATCH_18: Status with proper enum
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "draft",
      index: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    features: {
      type: [String],
      default: [],
    },

    // Legacy serviceType - kept for backward compatibility
    serviceType: {
      type: String,
      default: "general",
      index: true,
    },

    // Legacy active field - kept for backward compatibility
    active: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    viewCount: {
      type: Number,
      default: 0,
    },

    purchaseCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// PATCH_19: Compound indexes with subcategory
serviceSchema.index({ category: 1, subcategory: 1, status: 1 });
serviceSchema.index({ countries: 1, category: 1, subcategory: 1, status: 1 });
serviceSchema.index({ platform: 1, subject: 1, projectName: 1 });
serviceSchema.index({ status: 1, category: 1, listingType: 1 }); // Legacy support
serviceSchema.index({ status: 1, countries: 1 });
serviceSchema.index({ active: 1, category: 1 });

// PATCH_19: Pre-save hook to set defaults and validate subcategory
serviceSchema.pre("save", function (next) {
  // Default category if not set
  if (!this.category) {
    this.category = "microjobs";
  }

  // Default subcategory based on category if not set
  if (!this.subcategory) {
    const defaults = {
      microjobs: "fresh_account",
      forex_crypto: "forex_platform_creation",
      banks_gateways_wallets: "banks",
    };
    this.subcategory = defaults[this.category] || "fresh_account";
  }

  // Validate subcategory matches category
  const validSubcats = SUBCATEGORY_BY_CATEGORY[this.category];
  if (validSubcats && !validSubcats.includes(this.subcategory)) {
    // Auto-correct to first valid subcategory
    this.subcategory = validSubcats[0];
  }

  // Sync listingType with subcategory for backwards compatibility
  if (
    this.subcategory === "fresh_account" ||
    this.subcategory === "already_onboarded"
  ) {
    this.listingType = this.subcategory;
  }

  next();
});

// PATCH_19: Export enums for use in controllers
module.exports = mongoose.model("Service", serviceSchema);
module.exports.CATEGORY_ENUM = CATEGORY_ENUM;
module.exports.SUBCATEGORY_BY_CATEGORY = SUBCATEGORY_BY_CATEGORY;
module.exports.ALL_SUBCATEGORIES = ALL_SUBCATEGORIES;
