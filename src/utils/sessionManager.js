const JarvisSession = require("../models/JarvisSession");

function wrapNonThrowingSave(session) {
  if (!session || typeof session.save !== "function") return session;
  if (session._jarvisxSaveWrapped) return session;

  const original = session.save.bind(session);
  session.save = async (...args) => {
    try {
      return await original(...args);
    } catch (err) {
      console.error(
        `[JARVISX_SESSION_SAVE_FAIL] errMessage=${err?.message}\n${
          err?.stack || ""
        }`
      );
      return session;
    }
  };

  session._jarvisxSaveWrapped = true;
  return session;
}

class SessionManager {
  /**
   * Get or create session for request
   */
  async getOrCreateSession(req) {
    const sessionKey = JarvisSession.generateSessionKey(req);

    let session = null;
    try {
      session = await JarvisSession.findOne({ sessionKey });
    } catch (err) {
      console.error(
        `[JARVISX_SESSION_FIND_FAIL] errMessage=${err?.message}\n${
          err?.stack || ""
        }`
      );
      // Mongo down / buffering timeout: return volatile in-memory session.
      return {
        _volatile: true,
        sessionKey,
        userId: req.user?._id || req.user?.id || null,
        isAdmin: req.user?.role === "admin",
        askedQuestions: [],
        collectedData: {},
        conversation: [],
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        save: async () => {},
      };
    }

    if (!session) {
      session = new JarvisSession({
        sessionKey,
        userId: req.user?._id || req.user?.id || null,
        isAdmin: req.user?.role === "admin",
        askedQuestions: [],
        collectedData: {},
        conversation: [],
      });
    }

    // Never allow session.save() to crash JarvisX chat.
    wrapNonThrowingSave(session);

    // Keep identity/admin flag fresh (in case role/login changes)
    session.userId = req.user?._id || req.user?.id || session.userId || null;
    session.isAdmin = req.user?.role === "admin";

    // Reset TTL on activity
    session.expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    return session;
  }

  /**
   * Check if question already asked in session
   */
  hasAsked(session, questionKey) {
    return Array.isArray(session.askedQuestions)
      ? session.askedQuestions.includes(questionKey)
      : false;
  }

  /**
   * Mark question as asked
   */
  markAsked(session, questionKey) {
    if (!Array.isArray(session.askedQuestions)) session.askedQuestions = [];
    if (!session.askedQuestions.includes(questionKey)) {
      session.askedQuestions.push(questionKey);
    }
  }

  /**
   * Anti-loop: Detect if user is confused/not answering
   */
  shouldRephrase(session, currentQuestionKey, currentUserText = "") {
    if (!currentQuestionKey) return false;

    const confusionPatterns = [
      /don'?t understand/i,
      /don't get it/i,
      /what do you mean/i,
      /huh\??/i,
      /\?\s*\?/,
      /not sure/i,
      /confused/i,
      /explain/i,
    ];

    const isConfused = confusionPatterns.some((pattern) =>
      pattern.test(String(currentUserText || ""))
    );

    return isConfused && this.hasAsked(session, currentQuestionKey);
  }

  /**
   * Add message to conversation history
   */
  async addMessage(session, role, content) {
    if (!Array.isArray(session.conversation)) session.conversation = [];

    session.conversation.push({
      role,
      content,
      timestamp: new Date(),
    });

    // Keep only last 10 messages
    if (session.conversation.length > 10) {
      session.conversation = session.conversation.slice(-10);
    }

    try {
      if (typeof session.save === "function") {
        await session.save();
      }
    } catch (err) {
      // Should be rare due to wrapped save, but keep this defensive.
      console.error(
        `[JARVISX_SESSION_WRITE_FAIL] errMessage=${err?.message}\n${
          err?.stack || ""
        }`
      );
    }
  }

  /**
   * Clear session data
   */
  async clearSession(sessionKey) {
    await JarvisSession.deleteOne({ sessionKey });
  }
}

module.exports = new SessionManager();
