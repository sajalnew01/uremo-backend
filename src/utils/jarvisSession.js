/**
 * JarvisSession Helpers — Session memory for JarvisX
 * Provides utilities for managing session state, preventing loops, and
 * maintaining conversation context.
 */
const crypto = require("crypto");
const JarvisSession = require("../models/JarvisSession");

/**
 * Get client IP address from request
 * @param {object} req - Express request
 * @returns {string} IP address
 */
function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : xf;
  const first = typeof raw === "string" ? raw.split(",")[0].trim() : "";
  const ip = first || req.ip || req.connection?.remoteAddress || "";
  return String(ip || "").trim();
}

/**
 * Generate unique session key for user
 * Uses userId if logged in, otherwise SHA256(IP + UserAgent)
 * @param {object} req - Express request
 * @returns {string} Session key
 */
function getSessionKey(req) {
  const userId = req.user?.id ? String(req.user.id) : "";
  if (userId) return `user:${userId}`;

  const ip = getClientIp(req);
  const ua = String(req.headers["user-agent"] || "").slice(0, 100);
  const hash = crypto
    .createHash("sha256")
    .update(`${ip || "unknown"}::${ua}`)
    .digest("hex")
    .slice(0, 24);
  return `ip:${hash}`;
}

/**
 * Load existing session or create new one
 * @param {string} key - Session key
 * @returns {Promise<object>} JarvisSession document
 */
async function loadSession(key) {
  const existing = await JarvisSession.findOne({ key });
  if (existing) return existing;
  return JarvisSession.create({ key });
}

/**
 * Load or create session from request
 * @param {object} req - Express request
 * @returns {Promise<object>} JarvisSession document
 */
async function loadOrCreateSession(req) {
  const key = getSessionKey(req);
  return loadSession(key);
}

/**
 * Clamp string to max length
 * @param {*} value
 * @param {number} maxLen
 * @returns {string}
 */
function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

/**
 * Append message to session's lastMessages array (keeps last 10)
 * @param {object} session - JarvisSession document
 * @param {string} role - "user" | "assistant" | "system"
 * @param {string} content - Message content
 */
function appendMessage(session, role, content) {
  session.lastMessages = Array.isArray(session.lastMessages)
    ? session.lastMessages
    : [];

  session.lastMessages.push({
    role,
    content: clampString(String(content || ""), 300),
    at: new Date(),
  });

  // Keep only last 10 messages
  if (session.lastMessages.length > 10) {
    session.lastMessages = session.lastMessages.slice(-10);
  }
}

/**
 * Save session to database
 * @param {object} session - JarvisSession document
 * @returns {Promise<object>}
 */
async function saveSession(session) {
  session.updatedAt = new Date();
  return session.save();
}

/**
 * Update collected field in session
 * @param {object} session - JarvisSession document
 * @param {string} field - Field name (platform, urgency, category, details)
 * @param {string} value - Field value
 */
function updateCollected(session, field, value) {
  if (!session.collected) {
    session.collected = {
      platform: "",
      urgency: "",
      category: "",
      details: "",
    };
  }
  const allowedFields = ["platform", "urgency", "category", "details"];
  if (allowedFields.includes(field)) {
    session.collected[field] = clampString(String(value || ""), 200);
  }
}

/**
 * Check if we're about to repeat the same question
 * @param {object} session - JarvisSession document
 * @param {string} newQuestionKey - The question key we want to ask
 * @returns {boolean} true if this would be a repeat
 */
function wouldRepeatQuestion(session, newQuestionKey) {
  if (!newQuestionKey || !session.lastQuestionKey) return false;
  return session.lastQuestionKey === newQuestionKey;
}

/**
 * Count how many times a question was asked in recent messages
 * @param {object} session - JarvisSession document
 * @param {string} questionKey - Question key to check
 * @returns {number} Count of times asked
 */
function countQuestionAsked(session, questionKey) {
  // Simple heuristic: check if lastQuestionKey matches
  // In production, could track in an array
  if (session.lastQuestionKey === questionKey) return 1;
  return 0;
}

/**
 * Clear session state (for testing or reset)
 * @param {object} session - JarvisSession document
 */
function clearSessionState(session) {
  session.lastIntent = "";
  session.lastQuestionKey = "";
  session.collected = { platform: "", urgency: "", category: "", details: "" };
  session.lastMessages = [];
}

/**
 * Get session summary for logging (no user content)
 * @param {object} session - JarvisSession document
 * @returns {object} Safe summary object
 */
function getSessionSummary(session) {
  return {
    key: session.key ? session.key.slice(0, 12) + "..." : "unknown",
    lastIntent: session.lastIntent || "",
    lastQuestionKey: session.lastQuestionKey || "",
    messageCount: Array.isArray(session.lastMessages)
      ? session.lastMessages.length
      : 0,
    hasCollected: !!(
      session.collected?.platform ||
      session.collected?.urgency ||
      session.collected?.category
    ),
  };
}

module.exports = {
  getClientIp,
  getSessionKey,
  loadSession,
  loadOrCreateSession,
  appendMessage,
  saveSession,
  updateCollected,
  wouldRepeatQuestion,
  countQuestionAsked,
  clearSessionState,
  getSessionSummary,
  clampString,
};
