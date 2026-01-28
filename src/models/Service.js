const mongoose = require("mongoose");

// PATCH_38: Central category action rules
const { getAllowedActionsForService } = require("../config/categoryActions");

// PATCH_19/22: Category and Subcategory enums for 3-tier service organization
// PATCH_22: Added "rentals" category for account rental services
const CATEGORY_ENUM = [
  "microjobs",
  // PATCH_38: Additional workspace microjob buckets
  "writing",
  "online_gigs",
  "forex_crypto",
  "banks_gateways_wallets",
  // PATCH_38: New explicit account categories
  "banks_wallets",
  "crypto_accounts",
  "forex_accounts",
  "rentals",
];

// PATCH_19/22: Subcategory mapped by category
const SUBCATEGORY_BY_CATEGORY = {
  microjobs: ["fresh_account", "already_onboarded"],
  forex_crypto: ["forex_platform_creation", "crypto_platform_creation"],
  banks_gateways_wallets: ["banks", "payment_gateways", "wallets"],
  // PATCH_22: Rental subcategories
  rentals: [
    "whatsapp_business_verified",
    "linkedin_premium_account",
    "social_media_verified",
    "email_accounts",
  ],
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

    // PATCH_19/20/22: Category with fallback (not required for backwards compatibility)
    category: {
      type: String,
      trim: true,
      enum: {
        values: [...CATEGORY_ENUM, "general"], // Allow "general" for legacy
        message:
          "Category must be one of: microjobs, forex_crypto, banks_gateways_wallets, rentals, general",
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

    // PATCH_22: Rental/Subscription service support
    isRental: {
      type: Boolean,
      default: false,
      index: true,
    },

    // PATCH_22: Rental plans - multiple time-based pricing options
    rentalPlans: [
      {
        duration: {
          type: Number,
          required: true,
          min: 1,
        },
        unit: {
          type: String,
          enum: ["days", "months"],
          default: "days",
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        label: {
          type: String,
          default: "",
        },
        isPopular: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // PATCH_22: Rental-specific fields
    rentalDescription: {
      type: String,
      default: "",
    },

    // PATCH_38: Action Rules Engine (auto-assigned; admin cannot edit)
    allowedActions: {
      buy: { type: Boolean, default: true },
      apply: { type: Boolean, default: false },
      rent: { type: Boolean, default: false },
      deal: { type: Boolean, default: false },
    },

    maxActiveRentals: {
      type: Number,
      default: 0, // 0 = unlimited
    },

    currentActiveRentals: {
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

// PATCH_19/21: Pre-save hook to set defaults and validate subcategory
// PATCH_21: Use async function to avoid "next is not a function" error in Mongoose 9.x
serviceSchema.pre("save", async function () {
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
      rentals: "whatsapp_business_verified", // PATCH_21: Default for rentals
    };
    this.subcategory = defaults[this.category] || "general";
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

  // PATCH_38: Always compute allowedActions from category rules
  this.allowedActions = getAllowedActionsForService(this);
  // PATCH_21: No next() needed - async function returns Promise automatically
});

// PATCH_38: Ensure allowedActions stays in sync for findOneAndUpdate/findByIdAndUpdate
serviceSchema.pre("findOneAndUpdate", async function () {
  const update = this.getUpdate() || {};

  // Normalize update shape
  const $set =
    update.$set && typeof update.$set === "object" ? update.$set : {};

  // Prevent manual edits
  delete update.allowedActions;
  delete $set.allowedActions;

  // Load current document to compute effective category/subcategory
  const current = await this.model.findOne(this.getQuery()).lean();
  const nextCategory =
    (typeof $set.category === "string" ? $set.category : undefined) ||
    (typeof update.category === "string" ? update.category : undefined) ||
    current?.category;
  const nextSubcategory =
    (typeof $set.subcategory === "string" ? $set.subcategory : undefined) ||
    (typeof update.subcategory === "string" ? update.subcategory : undefined) ||
    current?.subcategory;

  const computed = getAllowedActionsForService({
    category: nextCategory,
    subcategory: nextSubcategory,
  });

  update.$set = { ...$set, allowedActions: computed };
  this.setUpdate(update);
});

// PATCH_19: Export enums for use in controllers
module.exports = mongoose.model("Service", serviceSchema);
module.exports.CATEGORY_ENUM = CATEGORY_ENUM;
module.exports.SUBCATEGORY_BY_CATEGORY = SUBCATEGORY_BY_CATEGORY;
module.exports.ALL_SUBCATEGORIES = ALL_SUBCATEGORIES;
