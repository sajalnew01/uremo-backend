/**
 * PATCH_52B: JarvisX Transitions Engine
 * Handles step transitions, data collection, and goal completion
 */

const {
  GOALS,
  getNextStep,
  getStepDefinition,
  isConfirmationStep,
} = require("./goals");
const { INTENTS } = require("./intents");

/**
 * Transition to next step in current goal
 * @param {Object} session - Session object { activeGoal, currentStep, collectedData, history }
 * @param {string} userInput - User's input/answer
 * @returns {Object} Updated session with new step
 */
function transitionToNextStep(session, userInput) {
  if (!session.activeGoal) {
    return session;
  }

  const nextStepDef = getNextStep(session.activeGoal, session.currentStep);

  if (!nextStepDef) {
    // Goal completed
    return {
      ...session,
      currentStep: "COMPLETED",
      history: [
        ...session.history,
        {
          timestamp: new Date(),
          event: "goal_completed",
          goal: session.activeGoal,
        },
      ],
    };
  }

  return {
    ...session,
    currentStep: nextStepDef.step,
    history: [
      ...session.history,
      {
        timestamp: new Date(),
        event: "step_transition",
        from: session.currentStep,
        to: nextStepDef.step,
        userInput,
      },
    ],
  };
}

/**
 * Collect data from user input at current step
 * @param {Object} session - Session object
 * @param {string} userInput - User's answer
 * @returns {Object} Updated session with collected data
 */
function collectStepData(session, userInput) {
  if (!session.activeGoal || !session.currentStep) {
    return session;
  }

  const stepDef = getStepDefinition(session.activeGoal, session.currentStep);

  if (!stepDef || !stepDef.dataKey) {
    // Step doesn't collect data
    return session;
  }

  return {
    ...session,
    collectedData: {
      ...session.collectedData,
      [stepDef.dataKey]: userInput,
    },
  };
}

/**
 * Apply user input to current step:
 * 1. Collect data
 * 2. Validate (if needed)
 * 3. Transition to next
 * @param {Object} session - Session object
 * @param {string} userInput - User's input
 * @returns {Object} Updated session
 */
function applyUserInput(session, userInput) {
  // Skip data collection if it's a confirmation/display step
  const currentStepDef = getStepDefinition(
    session.activeGoal,
    session.currentStep,
  );

  if (currentStepDef && currentStepDef.dataKey) {
    session = collectStepData(session, userInput);
  }

  // Move to next step
  session = transitionToNextStep(session, userInput);

  return session;
}

/**
 * Switch to a different goal
 * Resets step and clears data
 * @param {Object} session - Session object
 * @param {string} newGoal - New goal name
 * @param {Object} goals - Goals module for getting first step
 * @returns {Object} Updated session with new goal
 */
function switchGoal(session, newGoal, goalsModule) {
  const { getFirstStep } = goalsModule;
  const firstStep = getFirstStep(newGoal);

  return {
    ...session,
    activeGoal: newGoal,
    currentStep: firstStep ? firstStep.step : null,
    collectedData: {}, // Reset collected data
    history: [
      ...session.history,
      {
        timestamp: new Date(),
        event: "goal_switched",
        from: session.activeGoal,
        to: newGoal,
      },
    ],
  };
}

/**
 * Check if user has already answered this step
 * @param {Object} session - Session object
 * @returns {boolean}
 */
function hasStepData(session) {
  if (!session.activeGoal || !session.currentStep) {
    return false;
  }

  const stepDef = getStepDefinition(session.activeGoal, session.currentStep);
  if (!stepDef || !stepDef.dataKey) {
    return false;
  }

  return session.collectedData.hasOwnProperty(stepDef.dataKey);
}

/**
 * Get current question text for UI
 * @param {Object} session - Session object
 * @returns {string} Question text or null if no question
 */
function getCurrentQuestion(session) {
  if (!session.activeGoal || !session.currentStep) {
    return null;
  }

  const stepDef = getStepDefinition(session.activeGoal, session.currentStep);
  return stepDef ? stepDef.question : null;
}

/**
 * Get step options for UI (if any)
 * @param {Object} session - Session object
 * @returns {Array|null} Options array or null
 */
function getStepOptions(session) {
  if (!session.activeGoal || !session.currentStep) {
    return null;
  }

  const stepDef = getStepDefinition(session.activeGoal, session.currentStep);
  return stepDef ? stepDef.options || null : null;
}

module.exports = {
  transitionToNextStep,
  collectStepData,
  applyUserInput,
  switchGoal,
  hasStepData,
  getCurrentQuestion,
  getStepOptions,
};
