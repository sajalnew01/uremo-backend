const mongoose = require("mongoose");
const { createHash, randomUUID } = require("crypto");

const JarvisSessionSchema = new mongoose.Schema(
  {
    // Session key: user:<id> if logged in, else anon:<cookie jarvisx_sid>
    // STABLE SESSION KEY - Never use IP+UA as primary (causes reset loops)
    sessionKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // User reference if authenticated
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isAdmin: {
      type: Boolean,
      default: false,
    },

    // ============================================
    // P0 FIX: CONVERSATION STATE MACHINE
    // ============================================
    // Flow: The high-level conversation flow (e.g., BUY_SERVICE, ORDER_STATUS)
    flow: {
      type: String,
      enum: [
        null,
        "BUY_SERVICE",
        "ORDER_STATUS",
        "INTERVIEW_HELP",
        "PAYMENT_HELP",
        "CUSTOM_SERVICE",
        "APPLY_TO_WORK",
      ],
      default: null,
    },

    // Step: The current step within the flow
    step: {
      type: String,
      enum: [
        null,
        // BUY_SERVICE flow steps
        "ASK_SERVICE_TYPE",
        "LIST_SERVICES",
        "ASK_PLATFORM",
        "ASK_REGION",
        "ASK_URGENCY",
        "ASK_PAYMENT_METHOD",
        "CONFIRM_ORDER",
        "COMPLETE",
        // ORDER_STATUS flow steps
        "ASK_ORDER_ID",
        "SHOW_STATUS",
        // INTERVIEW_HELP flow steps
        "ASK_INTERVIEW_PLATFORM",
        "ASK_INTERVIEW_URGENCY",
        // Generic
        "CANCELLED",
        "DONE",
      ],
      default: null,
    },

    // Deterministic intent tracking (legacy, kept for compatibility)
    lastIntent: {
      type: String,
      enum: [
        "INTERVIEW_HELP",
        "INTERVIEW_ASSESSMENT",
        "BUY_SERVICE",
        "ORDER_STATUS",
        "ORDER_DELIVERY",
        "PAYMENT_HELP",
        "CUSTOM_SERVICE",
        "APPLY_TO_WORK",
        "GENERAL_QUERY",
        "GENERAL_SUPPORT",
      ],
      default: "GENERAL_QUERY",
    },

    // Anti-loop tracking
    askedQuestions: {
      type: [String],
      default: [],
    },

    // Collected data in current session (ENHANCED)
    collectedData: {
      serviceType: String, // e.g., "KYC", "Interview", "Custom"
      serviceName: String,
      platform: String, // e.g., "HFM", "Binance", "Bybit", "PayPal"
      region: String, // e.g., "USA", "UK", "Nigeria"
      urgency: String, // e.g., "asap", "this_week", "flexible"
      details: String,
      orderId: String,
      email: String,
      paymentMethod: String,
      budget: Number,
      budgetCurrency: String,
    },

    // Conversation history (last 10 exchanges)
    conversation: [
      {
        role: {
          type: String,
          enum: ["user", "jarvis"],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // TTL: Auto-delete after 30 minutes of inactivity
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 60 * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  }
);

/**
 * P0 FIX: STABLE SESSION KEY GENERATION
 * Uses user:<id> if logged in, else anon:<cookie jarvisx_sid>
 * NEVER use IP+UA as primary key (causes reset loops when IP changes)
 */
JarvisSessionSchema.statics.generateSessionKey = function (req) {
  const userId = req?.user?._id || req?.user?.id;
  if (userId) {
    return `user:${userId}`;
  }

  // Use cookie-based session ID for anonymous users (stable across requests)
  // The cookie jarvisx_sid should be set by the controller if missing
  const cookieSid = req?.cookies?.jarvisx_sid;
  if (cookieSid && typeof cookieSid === "string" && cookieSid.length >= 8) {
    return `anon:${cookieSid}`;
  }

  // Fallback: generate new UUID (controller should set cookie)
  const newSid = randomUUID().replace(/-/g, "").slice(0, 24);
  // Store on req for controller to read and set cookie
  req._jarvisxNewSid = newSid;
  return `anon:${newSid}`;
};

/**
 * Generate a new session ID for cookies
 */
JarvisSessionSchema.statics.generateNewSessionId = function () {
  return randomUUID().replace(/-/g, "").slice(0, 24);
};

module.exports = mongoose.model("JarvisSession", JarvisSessionSchema);
