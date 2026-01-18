const JarvisSession = require("../models/JarvisSession");
const User = require("../models/User");

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
        }`,
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
  async getOrCreateSession(req, mode = "public") {
    const wantsAdmin = mode === "admin" || req.user?.role === "admin";

    let sessionKey = null;
    if (wantsAdmin) {
      const adminId = req?.user?._id || req?.user?.id;
      if (!adminId) {
        console.error(
          "[JarvisX] ADMIN mode called without req.user — auth middleware missing!",
        );
        sessionKey = "admin:unknown";
      } else {
        sessionKey = `admin:${adminId}`;
      }
    } else {
      // Public mode: prefer provided sessionId, else stable cookie session key.
      const provided =
        typeof req?.body?.sessionId === "string" && req.body.sessionId.trim()
          ? String(req.body.sessionId).trim()
          : null;

      if (provided) {
        sessionKey = `public:${provided}`;
      } else {
        sessionKey = JarvisSession.generateSessionKey(req);
      }
    }

    let session = null;
    try {
      session = await JarvisSession.findOne({ sessionKey });
    } catch (err) {
      console.error(
        `[JARVISX_SESSION_FIND_FAIL] errMessage=${err?.message}\n${
          err?.stack || ""
        }`,
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
        isAdmin: wantsAdmin,
        askedQuestions: [],
        collectedData: {},
        conversation: [],
        metadata: {},
      });
    }

    // Never allow session.save() to crash JarvisX chat.
    wrapNonThrowingSave(session);

    // Keep identity/admin flag fresh (in case role/login changes)
    session.userId = req.user?._id || req.user?.id || session.userId || null;
    session.isAdmin = wantsAdmin;

    // Persist admin identity for deterministic admin memory.
    if (wantsAdmin) {
      if (!session.metadata || typeof session.metadata !== "object") {
        session.metadata = {};
      }

      const name = String(
        req.user?.name || req.user?.fullName || "Admin",
      ).trim();
      const email = String(req.user?.email || "").trim();
      const role = String(req.user?.role || "admin").trim() || "admin";
      const uid = String(req.user?._id || req.user?.id || "").trim();

      session.metadata.adminIdentity = {
        userId: uid,
        email,
        name: name || "Admin",
        role,
        identifiedAt: new Date(),
      };

      // If token doesn't include email/name, best-effort hydrate from DB.
      if ((!email || !name) && uid) {
        try {
          const doc = await User.findById(uid).select("name email role").lean();
          if (doc) {
            const dbName = String(doc?.name || "").trim();
            const dbEmail = String(doc?.email || "").trim();
            const dbRole = String(doc?.role || "").trim();

            if (dbEmail && !session.metadata.adminIdentity.email) {
              session.metadata.adminIdentity.email = dbEmail;
            }
            if (
              dbName &&
              (!session.metadata.adminIdentity.name ||
                session.metadata.adminIdentity.name === "Admin")
            ) {
              session.metadata.adminIdentity.name = dbName;
            }
            if (dbRole && !session.metadata.adminIdentity.role) {
              session.metadata.adminIdentity.role = dbRole;
            }
          }
        } catch {
          // ignore (DB may be down); keep safe behavior
        }
      }
    }

    // Reset TTL on activity
    session.expiresAt = wantsAdmin
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 30 * 60 * 1000);

    return session;
  }

  getAdminIdentity(session) {
    const meta = session?.metadata;
    const adminIdentity = meta?.adminIdentity;
    if (!adminIdentity || typeof adminIdentity !== "object") return null;
    return adminIdentity;
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
      pattern.test(String(currentUserText || "")),
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
        }`,
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
