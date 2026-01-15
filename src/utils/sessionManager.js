const JarvisSession = require("../models/JarvisSession");

class SessionManager {
  /**
   * Get or create session for request
   */
  async getOrCreateSession(req) {
    const sessionKey = JarvisSession.generateSessionKey(req);

    let session = await JarvisSession.findOne({ sessionKey });

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

    await session.save();
  }

  /**
   * Clear session data
   */
  async clearSession(sessionKey) {
    await JarvisSession.deleteOne({ sessionKey });
  }
}

module.exports = new SessionManager();
