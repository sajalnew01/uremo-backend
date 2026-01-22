const mongoose = require("mongoose");

// PATCH_19: Canonical enums - subcategories vary by category
const VALID_CATEGORIES = [
  "microjobs",
  "forex_crypto",
  "banks_gateways_wallets",
];

// PATCH_19: Subcategories per category type
const SUBCATEGORIES_BY_CATEGORY = {
  microjobs: ["fresh_account", "already_onboarded"],
  forex_crypto: ["forex_platform_creation", "crypto_platform_creation"],
  banks_gateways_wallets: ["banks", "payment_gateways", "wallets"],
};

// All valid subcategory values (flattened for schema validation)
const ALL_SUBCATEGORIES = [
  // microjobs
  "fresh_account",
  "already_onboarded",
  // forex_crypto
  "forex_platform_creation",
  "crypto_platform_creation",
  // banks_gateways_wallets
  "banks",
  "payment_gateways",
  "wallets",
  // legacy fallback
  "general",
];

// PATCH_19: Enhanced schema with proper category + subcategory system
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

    // PATCH_19: Category with strict enum
    category: {
      type: String,
      enum: [...VALID_CATEGORIES, "general"], // allow legacy "general"
      default: "microjobs",
      trim: true,
      index: true,
    },

    // PATCH_19: Subcategory - varies by category, validated in pre-save
    subcategory: {
      type: String,
      enum: ALL_SUBCATEGORIES,
      default: "fresh_account",
      trim: true,
      index: true,
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

    // PATCH_19: Legacy listingType kept for backward compatibility (maps to subcategory)
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

// PATCH_19: Pre-save hook to validate subcategory matches category and set defaults
serviceSchema.pre("save", function (next) {
  // Map legacy listingType to subcategory if subcategory not set
  if (!this.subcategory && this.listingType && this.listingType !== "general") {
    this.subcategory = this.listingType;
  }

  // Set category default if missing
  if (!this.category || this.category === "general") {
    this.category = "microjobs";
  }

  // Validate subcategory matches category
  const validSubcats = SUBCATEGORIES_BY_CATEGORY[this.category];
  if (validSubcats && !validSubcats.includes(this.subcategory)) {
    // Auto-fix: set to first valid subcategory for this category
    this.subcategory = validSubcats[0];
  }

  // Keep listingType in sync for backward compatibility
  if (this.category === "microjobs") {
    this.listingType = this.subcategory;
  }

  next();
});

// PATCH_19: Compound indexes for efficient filtering
serviceSchema.index({ status: 1, category: 1, subcategory: 1 });
serviceSchema.index({ status: 1, countries: 1 });
serviceSchema.index({ status: 1, platform: 1, subject: 1, projectName: 1 });
serviceSchema.index({ active: 1, category: 1, subcategory: 1 });

// PATCH_19: Export enums for use in controllers
serviceSchema.statics.VALID_CATEGORIES = VALID_CATEGORIES;
serviceSchema.statics.SUBCATEGORIES_BY_CATEGORY = SUBCATEGORIES_BY_CATEGORY;
serviceSchema.statics.ALL_SUBCATEGORIES = ALL_SUBCATEGORIES;

module.exports = mongoose.model("Service", serviceSchema);
