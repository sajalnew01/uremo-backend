const mongoose = require("mongoose");

/**
 * UREMO JarvisX Audit Log Model
 *
 * CORE BRAIN ARCHITECTURE - Step 12:
 * "Log admin actions with intent, role, and status."
 *
 * Purpose:
 * - Track all JarvisX interactions for security auditing
 * - Log admin command executions
 * - Monitor tool usage patterns
 * - Enable debugging and incident investigation
 */

const JarvisAuditLogSchema = new mongoose.Schema(
  {
    // ============================================
    // IDENTITY
    // ============================================

    // Session that triggered this action
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JarvisSession",
      index: true,
    },

    // User who performed the action (null for guests)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },

    // Role at time of action
    role: {
      type: String,
      enum: ["guest", "user", "admin"],
      required: true,
      index: true,
    },

    // ============================================
    // ACTION DETAILS
    // ============================================

    // Type of action performed
    actionType: {
      type: String,
      enum: [
        // Chat actions
        "CHAT_MESSAGE",
        "CHAT_RESPONSE",

        // Flow actions
        "FLOW_START",
        "FLOW_STEP",
        "FLOW_COMPLETE",
        "FLOW_CANCEL",

        // Tool executions
        "TOOL_EXECUTE",
        "TOOL_SUCCESS",
        "TOOL_FAILURE",

        // Admin actions
        "ADMIN_COMMAND",
        "ADMIN_TOOL_USE",
        "ADMIN_DATA_ACCESS",

        // Security events
        "RATE_LIMIT_HIT",
        "INJECTION_BLOCKED",
        "AUTH_FAILURE",
        "ROLE_DENIED",

        // System events
        "SESSION_CREATE",
        "SESSION_EXPIRE",
        "LLM_CALL",
        "LLM_ERROR",
      ],
      required: true,
      index: true,
    },

    // Classified intent
    intent: {
      type: String,
      default: null,
    },

    // Tool used (if applicable)
    toolUsed: {
      type: String,
      default: null,
    },

    // ============================================
    // REQUEST/RESPONSE DATA
    // ============================================

    // Original user input (sanitized)
    userInput: {
      type: String,
      maxlength: 500, // Truncate long inputs
      default: null,
    },

    // Core Brain response summary
    responseSummary: {
      type: String,
      maxlength: 200,
      default: null,
    },

    // Tool parameters (for tool executions)
    toolParams: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ============================================
    // STATUS & METRICS
    // ============================================

    // Action result
    status: {
      type: String,
      enum: ["success", "failure", "blocked", "pending"],
      default: "success",
    },

    // Error details if failed
    errorMessage: {
      type: String,
      default: null,
    },

    // Processing time in milliseconds
    processingTimeMs: {
      type: Number,
      default: null,
    },

    // LLM token usage (if LLM call)
    tokenUsage: {
      prompt: { type: Number, default: null },
      completion: { type: Number, default: null },
      total: { type: Number, default: null },
    },

    // ============================================
    // CONTEXT
    // ============================================

    // IP address (hashed for privacy)
    ipHash: {
      type: String,
      default: null,
    },

    // User agent summary
    userAgent: {
      type: String,
      maxlength: 200,
      default: null,
    },

    // Request ID for correlation
    requestId: {
      type: String,
      index: true,
      default: null,
    },

    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

// ============================================
// INDEXES FOR EFFICIENT QUERYING
// ============================================

// Time-based queries
JarvisAuditLogSchema.index({ createdAt: -1 });

// Admin action audit trail
JarvisAuditLogSchema.index({ role: 1, actionType: 1, createdAt: -1 });

// Security investigation
JarvisAuditLogSchema.index({ actionType: 1, status: 1, createdAt: -1 });

// User activity history
JarvisAuditLogSchema.index({ userId: 1, createdAt: -1 });

// TTL: Auto-delete after 90 days
JarvisAuditLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);

// ============================================
// STATIC METHODS
// ============================================

/**
 * Log a JarvisX action
 */
JarvisAuditLogSchema.statics.logAction = async function (data) {
  try {
    const log = new this({
      sessionId: data.sessionId || null,
      userId: data.userId || null,
      role: data.role || "guest",
      actionType: data.actionType,
      intent: data.intent || null,
      toolUsed: data.toolUsed || null,
      userInput: data.userInput?.slice(0, 500) || null,
      responseSummary: data.responseSummary?.slice(0, 200) || null,
      toolParams: data.toolParams || null,
      status: data.status || "success",
      errorMessage: data.errorMessage || null,
      processingTimeMs: data.processingTimeMs || null,
      tokenUsage: data.tokenUsage || {},
      ipHash: data.ipHash || null,
      userAgent: data.userAgent?.slice(0, 200) || null,
      requestId: data.requestId || null,
      metadata: data.metadata || {},
    });

    await log.save();
    return log;
  } catch (error) {
    // Fail silently - logging should never break the main flow
    console.error("[JarvisAuditLog] Failed to log action:", error.message);
    return null;
  }
};

/**
 * Get admin action history
 */
JarvisAuditLogSchema.statics.getAdminActions = async function (limit = 50) {
  return this.find({
    role: "admin",
    actionType: {
      $in: ["ADMIN_COMMAND", "ADMIN_TOOL_USE", "ADMIN_DATA_ACCESS"],
    },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get security events
 */
JarvisAuditLogSchema.statics.getSecurityEvents = async function (limit = 100) {
  return this.find({
    actionType: {
      $in: [
        "RATE_LIMIT_HIT",
        "INJECTION_BLOCKED",
        "AUTH_FAILURE",
        "ROLE_DENIED",
      ],
    },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

/**
 * Get user activity summary
 */
JarvisAuditLogSchema.statics.getUserActivity = async function (
  userId,
  days = 7,
) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: "$actionType",
        count: { $sum: 1 },
        lastOccurrence: { $max: "$createdAt" },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);
};

/**
 * Get daily stats for dashboard
 */
JarvisAuditLogSchema.statics.getDailyStats = async function (days = 7) {
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          actionType: "$actionType",
        },
        count: { $sum: 1 },
        avgProcessingTime: { $avg: "$processingTimeMs" },
      },
    },
    {
      $sort: { "_id.date": -1 },
    },
  ]);
};

module.exports = mongoose.model("JarvisAuditLog", JarvisAuditLogSchema);
