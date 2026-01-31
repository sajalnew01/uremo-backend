/**
 * PATCH_52B: JarvisX Goal Definitions
 * Defines all goals, their steps, and step-level data requirements
 */

const GOALS = {
  BUY_SERVICE: "BUY_SERVICE",
  SUPPORT: "SUPPORT",
  APPLY_TO_WORK: "APPLY_TO_WORK",
  ORDER_STATUS: "ORDER_STATUS",
  WALLET: "WALLET",
  WORKSPACE: "WORKSPACE",
  AFFILIATE: "AFFILIATE",
  GENERAL: "GENERAL",
};

/**
 * Goal step definitions
 * Each goal maps to an ordered sequence of steps
 */
const GOAL_STEPS = {
  [GOALS.BUY_SERVICE]: [
    {
      step: "ASK_SERVICE_NAME",
      question: "What service are you looking for?",
      dataKey: "serviceName",
    },
    {
      step: "ASK_URGENCY",
      question: "How urgent is this?",
      dataKey: "urgency",
      options: ["Urgent", "Normal", "Not urgent"],
    },
    {
      step: "ASK_BUDGET",
      question: "What's your budget range?",
      dataKey: "budget",
    },
    { step: "CONFIRM", question: "Ready to proceed?", dataKey: null },
  ],

  [GOALS.SUPPORT]: [
    {
      step: "ASK_SUPPORT_TYPE",
      question: "What type of issue do you have?",
      dataKey: "supportType",
      options: ["Order Issue", "Payment Issue", "Technical Issue", "Other"],
    },
    {
      step: "ASK_DETAILS",
      question: "Tell me more details.",
      dataKey: "supportDetails",
    },
    {
      step: "CONFIRM",
      question: "Should I create a support ticket?",
      dataKey: null,
    },
  ],

  [GOALS.APPLY_TO_WORK]: [
    {
      step: "ASK_ROLE",
      question: "Which role are you interested in?",
      dataKey: "roleApplied",
    },
    { step: "CONFIRM", question: "Ready to apply?", dataKey: null },
  ],

  [GOALS.ORDER_STATUS]: [
    {
      step: "ASK_ORDER_ID",
      question: "What's your order ID?",
      dataKey: "orderId",
    },
    { step: "SHOW_STATUS", question: null, dataKey: null },
  ],

  [GOALS.WALLET]: [{ step: "SHOW_BALANCE", question: null, dataKey: null }],

  [GOALS.WORKSPACE]: [{ step: "SHOW_STATUS", question: null, dataKey: null }],

  [GOALS.AFFILIATE]: [{ step: "SHOW_LINK", question: null, dataKey: null }],

  [GOALS.GENERAL]: [{ step: "LISTEN", question: null, dataKey: null }],
};

/**
 * Get all steps for a goal
 * @param {string} goal - Goal name
 * @returns {Array} Steps array
 */
function getGoalSteps(goal) {
  return GOAL_STEPS[goal] || [];
}

/**
 * Get next step in goal
 * @param {string} goal - Goal name
 * @param {string} currentStep - Current step
 * @returns {Object|null} Next step definition or null if goal complete
 */
function getNextStep(goal, currentStep) {
  const steps = getGoalSteps(goal);
  const currentIndex = steps.findIndex((s) => s.step === currentStep);

  if (currentIndex === -1 || currentIndex >= steps.length - 1) {
    return null; // Goal completed or step not found
  }

  return steps[currentIndex + 1];
}

/**
 * Get step definition
 * @param {string} goal - Goal name
 * @param {string} step - Step name
 * @returns {Object|null} Step definition
 */
function getStepDefinition(goal, step) {
  const steps = getGoalSteps(goal);
  return steps.find((s) => s.step === step) || null;
}

/**
 * Check if step is a confirmation step
 * @param {string} step - Step name
 * @returns {boolean}
 */
function isConfirmationStep(step) {
  return (
    step === "CONFIRM" ||
    step === "SHOW_STATUS" ||
    step === "SHOW_BALANCE" ||
    step === "SHOW_LINK"
  );
}

/**
 * Get first step of a goal
 * @param {string} goal - Goal name
 * @returns {Object|null} First step definition
 */
function getFirstStep(goal) {
  const steps = getGoalSteps(goal);
  return steps.length > 0 ? steps[0] : null;
}

module.exports = {
  GOALS,
  GOAL_STEPS,
  getGoalSteps,
  getNextStep,
  getStepDefinition,
  isConfirmationStep,
  getFirstStep,
};
