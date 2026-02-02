const mongoose = require("mongoose");
const { createHash, randomUUID } = require("crypto");

/**
 * UREMO JarvisSession Schema - Unified Persistent Sessions
 *
 * CORE BRAIN ARCHITECTURE:
 * - All sessions stored in MongoDB (no in-memory)
 * - Supports both authenticated and anonymous users
 * - Full conversation history with role tracking
 * - Audit trail for all actions
 */

const JarvisSessionSchema = new mongoose.Schema(
  {
    // ============================================
    // IDENTITY
    // ============================================

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
      index: true,
    },

    // User role (cached from JWT for fast access)
    role: {
      type: String,
      enum: ["guest", "user", "admin"],
      default: "guest",
      index: true,
    },

    isAdmin: {
      type: Boolean,
      default: false,
    },

    // ============================================
    // CONVERSATION STATE (Core Brain)
    // ============================================

    // Current request type classification
    requestType: {
      type: String,
      enum: [
        null,
        "USER_QUERY",
        "DATA_FETCH",
        "AUTOMATION",
        "ADMIN_COMMAND",
        "SYSTEM_TASK",
        "CHAT",
      ],
      default: null,
    },

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
        "WALLET_QUERY",
        "AFFILIATE_QUERY",
        "ADMIN_ACTION",
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
        "AWAITING_INPUT",
      ],
      default: null,
    },

    // Last classified intent
    lastIntent: {
      type: String,
      enum: [
        "GREETING",
        "BUY_SERVICE",
        "ORDER_STATUS",
        "PAYMENT_HELP",
        "APPLY_TO_WORK",
        "WALLET_QUERY",
        "AFFILIATE_QUERY",
        "SUPPORT_REQUEST",
        "ADMIN_ACTION",
        "GENERAL_QUERY",
        // Legacy intents (kept for compatibility)
        "INTERVIEW_HELP",
        "INTERVIEW_ASSESSMENT",
        "ORDER_DELIVERY",
        "CUSTOM_SERVICE",
        "GENERAL_SUPPORT",
      ],
      default: "GENERAL_QUERY",
    },

    // Last action executed by Core Brain
    lastAction: {
      type: String,
      default: null,
    },

    // Anti-loop tracking
    askedQuestions: {
      type: [String],
      default: [],
    },

    // ============================================
    // COLLECTED DATA
    // ============================================

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

    // ============================================
    // MESSAGE HISTORY (Unified)
    // ============================================

    // Full conversation history (replaces both 'conversation' and V2 in-memory)
    messages: [
      {
        role: {
          type: String,
          enum: ["user", "assistant", "system"],
          required: true,
        },
        content: {
          type: String,
          required: true,
          maxlength: 2000,
        },
        intent: {
          type: String,
          default: null,
        },
        toolUsed: {
          type: String,
          default: null,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Legacy field (deprecated, use 'messages' instead)
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

    // ============================================
    // METADATA & AUDIT
    // ============================================

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Session statistics
    stats: {
      messageCount: { type: Number, default: 0 },
      toolsUsed: { type: [String], default: [] },
      lastActivityAt: { type: Date, default: Date.now },
    },

    // TTL: Auto-delete after 2 hours of inactivity (extended from 30 min)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 2 * 60 * 60 * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: true,
  },
);

// ============================================
// INDEXES
// ============================================
JarvisSessionSchema.index({ userId: 1, createdAt: -1 });
JarvisSessionSchema.index({ role: 1, "stats.lastActivityAt": -1 });

/**
 * CORE BRAIN: STABLE SESSION KEY GENERATION
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

/**
 * CORE BRAIN: Determine role from request
 */
JarvisSessionSchema.statics.determineRole = function (req) {
  if (req?.user?.isAdmin === true) {
    return "admin";
  }
  if (req?.user?._id || req?.user?.id) {
    return "user";
  }
  return "guest";
};

/**
 * CORE BRAIN: Get or create session with unified handling
 */
JarvisSessionSchema.statics.getOrCreateSession = async function (req) {
  const sessionKey = this.generateSessionKey(req);
  const role = this.determineRole(req);
  const userId = req?.user?._id || req?.user?.id || null;
  const isAdmin = req?.user?.isAdmin === true;

  let session = await this.findOne({ sessionKey });

  if (!session) {
    session = new this({
      sessionKey,
      userId,
      role,
      isAdmin,
      messages: [],
      conversation: [],
      collectedData: {},
      stats: {
        messageCount: 0,
        toolsUsed: [],
        lastActivityAt: new Date(),
      },
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    await session.save();
  } else {
    // Update role if user logged in/out
    if (session.role !== role || session.isAdmin !== isAdmin) {
      session.role = role;
      session.isAdmin = isAdmin;
      session.userId = userId;
      await session.save();
    }
  }

  return session;
};

/**
 * CORE BRAIN: Add message to session history
 */
JarvisSessionSchema.methods.addMessage = async function (
  role,
  content,
  options = {},
) {
  const message = {
    role,
    content: content.slice(0, 2000), // Enforce max length
    intent: options.intent || null,
    toolUsed: options.toolUsed || null,
    timestamp: new Date(),
  };

  this.messages.push(message);

  // Keep last 30 messages
  if (this.messages.length > 30) {
    this.messages = this.messages.slice(-30);
  }

  // Update stats
  this.stats.messageCount++;
  this.stats.lastActivityAt = new Date();
  if (options.toolUsed && !this.stats.toolsUsed.includes(options.toolUsed)) {
    this.stats.toolsUsed.push(options.toolUsed);
  }

  // Extend TTL on activity
  this.expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await this.save();
  return message;
};

/**
 * CORE BRAIN: Get recent messages for LLM context
 */
JarvisSessionSchema.methods.getRecentMessages = function (limit = 10) {
  return this.messages.slice(-limit).map((m) => ({
    role: m.role,
    content: m.content,
  }));
};

/**
 * CORE BRAIN: Reset session state (but keep history)
 */
JarvisSessionSchema.methods.resetState = async function () {
  this.flow = null;
  this.step = null;
  this.requestType = null;
  this.collectedData = {};
  this.askedQuestions = [];
  await this.save();
};

module.exports = mongoose.model("JarvisSession", JarvisSessionSchema);
