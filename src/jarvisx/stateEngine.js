/**
 * PATCH_52B: JarvisX Conversational State Engine (CSE)
 * Manages session state, goal tracking, and automatic goal switching
 *
 * Session Object Structure:
 * {
 *   sessionId: string,
 *   userId: string,
 *   activeGoal: string,
 *   currentStep: string,
 *   collectedData: object,
 *   history: array,
 *   createdAt: timestamp,
 *   updatedAt: timestamp
 * }
 */

const { GOALS, getFirstStep } = require("./goals");
const {
  applyUserInput,
  switchGoal,
  getCurrentQuestion,
  getStepOptions,
  hasStepData,
} = require("./transitions");

// In-memory session store (in production: use Redis or database)
const sessionStore = new Map();

/**
 * Detect goal from user message
 * Uses rule-based patterns, not LLM
 * @param {string} message - User message
 * @returns {string|null} Goal name or null if no match
 */
function detectGoalFromMessage(message) {
  if (!message) return null;

  const msg = String(message).toLowerCase().trim();

  // ORDER_STATUS patterns (check FIRST - before BUY_SERVICE)
  if (
    /order.*status|where.*order|track.*order|delivery.*status|status.*order/i.test(
      msg,
    )
  ) {
    return GOALS.ORDER_STATUS;
  }

  // BUY_SERVICE patterns
  if (/buy|purchase|need.*service|service|looking for.*service/i.test(msg)) {
    return GOALS.BUY_SERVICE;
  }

  // SUPPORT patterns
  if (
    /help|support|issue|problem|complaint|ticket|broken|not working/i.test(msg)
  ) {
    return GOALS.SUPPORT;
  }

  // APPLY_TO_WORK patterns
  if (/apply|work|job|position|hire|earn|freelance/i.test(msg)) {
    return GOALS.APPLY_TO_WORK;
  }

  // WALLET patterns
  if (/wallet|balance|money|funds|payment method|billing/i.test(msg)) {
    return GOALS.WALLET;
  }

  // WORKSPACE patterns
  if (/workspace|project|screening|earnings|pending/i.test(msg)) {
    return GOALS.WORKSPACE;
  }

  // AFFILIATE patterns
  if (/affiliate|referral|invite|link|commission/i.test(msg)) {
    return GOALS.AFFILIATE;
  }

  return null;
}

/**
 * Create or load session
 * @param {string} userId - User ID
 * @param {string} sessionId - Session ID (optional, generates if not provided)
 * @returns {Object} Session object
 */
function getOrCreateSession(userId, sessionId = null) {
  const id = sessionId || `session_${userId}_${Date.now()}`;

  if (sessionStore.has(id)) {
    return sessionStore.get(id);
  }

  const session = {
    sessionId: id,
    userId,
    activeGoal: null,
    currentStep: null,
    collectedData: {},
    history: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  sessionStore.set(id, session);
  return session;
}

/**
 * Load session from store
 * @param {string} sessionId - Session ID
 * @returns {Object|null} Session object or null
 */
function loadSession(sessionId) {
  return sessionStore.get(sessionId) || null;
}

/**
 * Save session to store
 * @param {Object} session - Session object
 */
function saveSession(session) {
  session.updatedAt = new Date();
  sessionStore.set(session.sessionId, session);
}

/**
 * Process message through state engine
 * Returns next step info for brain to handle
 *
 * Flow:
 * 1. Load session
 * 2. Detect new goal from message
 * 3. If new goal != active goal, switch goals
 * 4. Apply user input to current step
 * 5. Get next step info
 * 6. Save session
 * 7. Return { goal, step, question, options, collectedData, shouldAutoSwitch }
 *
 * @param {Object} params
 * @param {string} params.sessionId - Session ID
 * @param {string} params.userId - User ID
 * @param {string} params.message - User message
 * @returns {Object} State information for brain
 */
function processMessage(params) {
  const { sessionId, userId, message } = params;

  // Step 1: Load or create session
  let session = loadSession(sessionId);
  if (!session) {
    session = getOrCreateSession(userId, sessionId);
  }

  // Step 2: Detect goal from message
  const detectedGoal = detectGoalFromMessage(message);

  // Step 3: Auto-switch goal if needed (without confirmation)
  // But ONLY if there's already an active goal (not on first message)
  let autoSwitched = false;
  if (
    session.activeGoal &&
    detectedGoal &&
    detectedGoal !== session.activeGoal
  ) {
    session = switchGoal(session, detectedGoal, { getFirstStep });
    autoSwitched = true;
  }

  // Step 4: If no active goal yet, start with detected goal or GENERAL
  let isFirstMessageOfGoal = false;
  if (!session.activeGoal) {
    const targetGoal = detectedGoal || GOALS.GENERAL;
    const firstStep = getFirstStep(targetGoal);
    session.activeGoal = targetGoal;
    session.currentStep = firstStep ? firstStep.step : null;
    session.history.push({
      timestamp: new Date(),
      event: "goal_started",
      goal: targetGoal,
    });
    isFirstMessageOfGoal = true; // Don't apply input on first message
  }

  // Step 5: Apply user input to current step
  // (collect data, transition to next step)
  // But NOT if this is the first message that started a new goal
  // (user needs to answer the first question first)
  if (message && message.length > 0 && !isFirstMessageOfGoal) {
    session = applyUserInput(session, message);
  }

  // Step 6: Get info for brain
  const currentQuestion = getCurrentQuestion(session);
  const currentOptions = getStepOptions(session);
  const hasData = hasStepData(session);

  // Step 7: Save session
  saveSession(session);

  // Return state info
  return {
    sessionId: session.sessionId,
    activeGoal: session.activeGoal,
    currentStep: session.currentStep,
    collectedData: session.collectedData,
    question: currentQuestion,
    options: currentOptions,
    hasData,
    autoSwitched,
    message: "State processed",
  };
}

/**
 * Get session info for debugging
 * @param {string} sessionId - Session ID
 * @returns {Object} Full session object
 */
function getSessionInfo(sessionId) {
  return loadSession(sessionId) || null;
}

/**
 * Clear session (for testing or logout)
 * @param {string} sessionId - Session ID
 */
function clearSession(sessionId) {
  sessionStore.delete(sessionId);
}

/**
 * Get all active sessions (admin debugging)
 * @returns {Array} Array of session objects
 */
function getAllSessions() {
  return Array.from(sessionStore.values());
}

/**
 * Initialize state engine (e.g., connect to persistent storage)
 * For now: in-memory store
 */
function initialize() {
  // In production: connect to Redis/DB
  console.log("[JarvisX State Engine] Initialized (in-memory mode)");
}

module.exports = {
  // Processing
  processMessage,
  detectGoalFromMessage,

  // Session management
  getOrCreateSession,
  loadSession,
  saveSession,
  clearSession,
  getSessionInfo,
  getAllSessions,

  // Initialization
  initialize,
};
