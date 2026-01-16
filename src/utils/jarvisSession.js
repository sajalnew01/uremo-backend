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
 * P0 FIX: Generate unique session key for user
 * Uses user:<id> if logged in, else anon:<cookie jarvisx_sid>
 * NEVER use IP+UA as primary key (causes reset loops)
 * @param {object} req - Express request
 * @returns {string} Session key
 */
function getSessionKey(req) {
  const userId = req.user?.id ? String(req.user.id) : "";
  if (userId) return `user:${userId}`;

  // Use cookie-based session ID for anonymous users (stable across requests)
  const cookieSid = req.cookies?.jarvisx_sid;
  if (cookieSid && typeof cookieSid === "string" && cookieSid.length >= 8) {
    return `anon:${cookieSid}`;
  }

  // Fallback: generate new UUID (controller should set cookie)
  const newSid = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  req._jarvisxNewSid = newSid;
  return `anon:${newSid}`;
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
  if (!newQuestionKey) return false;
  // Check both lastQuestionKey and askedQuestions array
  if (session.lastQuestionKey === newQuestionKey) return true;
  if (
    Array.isArray(session.askedQuestions) &&
    session.askedQuestions.includes(newQuestionKey)
  )
    return true;
  return false;
}

/**
 * Check if session has asked a specific question
 * @param {object} session - JarvisSession document
 * @param {string} questionKey - Question key to check
 * @returns {boolean} true if question was asked
 */
function hasAsked(session, questionKey) {
  if (!questionKey) return false;
  if (!Array.isArray(session.askedQuestions)) session.askedQuestions = [];
  return session.askedQuestions.includes(questionKey);
}

/**
 * Add a question to the asked questions list
 * @param {object} session - JarvisSession document
 * @param {string} questionKey - Question key to add
 */
function addAskedQuestion(session, questionKey) {
  if (!questionKey) return;
  if (!Array.isArray(session.askedQuestions)) session.askedQuestions = [];
  if (!session.askedQuestions.includes(questionKey)) {
    session.askedQuestions.push(questionKey);
    // Keep only last 20 questions
    if (session.askedQuestions.length > 20) {
      session.askedQuestions = session.askedQuestions.slice(-20);
    }
  }
}

/**
 * Count how many times a question was asked in recent messages
 * @param {object} session - JarvisSession document
 * @param {string} questionKey - Question key to check
 * @returns {number} Count of times asked
 */
function countQuestionAsked(session, questionKey) {
  if (!questionKey) return 0;
  if (hasAsked(session, questionKey)) return 1;
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
  session.askedQuestions = [];
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
  hasAsked,
  addAskedQuestion,
  countQuestionAsked,
  clearSessionState,
  getSessionSummary,
  clampString,
};
