const mongoose = require("mongoose");
const { createHash } = require("crypto");

const JarvisSessionSchema = new mongoose.Schema(
  {
    // Session key: userId if logged in, else hash(ip+userAgent)
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

    // Deterministic intent tracking
    lastIntent: {
      type: String,
      enum: [
        "INTERVIEW_HELP",
        "BUY_SERVICE",
        "ORDER_STATUS",
        "PAYMENT_HELP",
        "CUSTOM_SERVICE",
        "GENERAL_QUERY",
      ],
      default: "GENERAL_QUERY",
    },

    // Anti-loop tracking
    askedQuestions: {
      type: [String],
      default: [],
    },

    // Collected data in current session
    collectedData: {
      platform: String,
      urgency: String,
      serviceType: String,
      serviceName: String,
      details: String,
      orderId: String,
      email: String,
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

// Static method to generate session key
JarvisSessionSchema.statics.generateSessionKey = function (req) {
  const userId = req?.user?._id || req?.user?.id;
  if (userId) {
    return `user_${userId}`;
  }

  // Anonymous: hash of IP + User-Agent
  const ip = req?.ip || req?.connection?.remoteAddress || "";
  const ua = req?.headers?.["user-agent"] || "";
  const hash = createHash("sha256").update(`${ip}:${ua}`).digest("hex");
  return `anon_${hash.substring(0, 16)}`;
};

module.exports = mongoose.model("JarvisSession", JarvisSessionSchema);
