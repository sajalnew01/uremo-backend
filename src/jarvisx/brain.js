/**
 * PATCH_51: JarvisX Master Brain Controller
 * The main orchestrator for tool-driven AI responses
 *
 * Flow: Message → Intent → Policy → Context → Tool → Blueprint → Polish → Response
 */

const { classifyIntent, INTENTS } = require("./intents");
const {
  allowIntent,
  getEffectiveRole,
  getDenialResponse,
} = require("./policy");
const { buildContext } = require("./contextBuilder");
const { getBlueprint } = require("./blueprints");
const { polishResponse, formatResponse } = require("./llmPolisher");

/**
 * Process a user message through the JarvisX brain
 * @param {Object} params - Processing parameters
 * @param {string} params.message - User's message
 * @param {Object} params.context - User context (userId, role, etc.)
 * @param {Object} params.options - Optional settings
 * @returns {Promise<Object>} Final response
 */
async function processMessage({ message, context = {}, options = {} }) {
  const startTime = Date.now();
  const debug = options.debug || process.env.JARVISX_DEBUG === "true";

  const log = (step, data) => {
    if (debug) {
      console.log(`[JarvisX Brain] ${step}:`, JSON.stringify(data, null, 2));
    }
  };

  try {
    // =========== STEP 1: INTENT DETECTION ===========
    log("Step 1", { message: message.substring(0, 50) });

    const intent = classifyIntent(message);
    log("Intent Detected", { intent });

    // =========== STEP 2: POLICY CHECK ===========
    const effectiveRole = getEffectiveRole(context);
    log("Step 2", { role: effectiveRole, intent });

    const policyResult = allowIntent(effectiveRole, intent);

    if (!policyResult.allowed) {
      log("Policy Denied", policyResult);

      // Build denial actions
      const denialActions = [];
      if (policyResult.redirectTo) {
        denialActions.push({
          label: "Log In",
          action: "NAVIGATE",
          url: policyResult.redirectTo,
        });
      }
      denialActions.push({
        label: "Go Back",
        action: "INTENT",
        value: "GREETING",
      });

      return {
        success: true,
        response: {
          message:
            policyResult.reason || "You're not authorized for this action.",
          actions: denialActions,
        },
        meta: {
          intent,
          role: effectiveRole,
          denied: true,
          reason: policyResult.reason,
          code: policyResult.code,
          processingTime: Date.now() - startTime,
          version: "51",
        },
      };
    }

    // =========== STEP 3: BUILD CONTEXT ===========
    log("Step 3", { intent, userId: context.userId });

    const contextData = await buildContext(
      intent,
      context,
      options.params || {},
    );
    log("Context Built", {
      hasData: !!contextData.data,
      isAuthenticated: contextData.isAuthenticated,
    });

    // =========== STEP 4: GET BLUEPRINT ===========
    log("Step 4", { intent });

    const blueprint = getBlueprint(intent, contextData);
    log("Blueprint Generated", {
      textLength: blueprint.text?.length,
      hasActions: blueprint.actions?.length > 0,
      hasList: blueprint.list?.length > 0,
    });

    // =========== STEP 5: LLM POLISH ===========
    const mode = options.mode || process.env.JARVIS_MODE || "classic";
    const skipPolish = options.skipPolish || false;

    log("Step 5", { mode, skipPolish });

    const polished = await polishResponse(blueprint, {
      mode,
      skipPolish,
    });
    log("Polished", { polished: polished.polished });

    // =========== STEP 6: FORMAT RESPONSE ===========
    const finalResponse = formatResponse(polished);

    log("Step 6 - Final", {
      messageLength: finalResponse.message?.length,
      actionsCount: finalResponse.actions?.length,
    });

    return {
      success: true,
      response: finalResponse,
      meta: {
        intent,
        role: effectiveRole,
        polished: polished.polished,
        processingTime: Date.now() - startTime,
        version: "51",
      },
    };
  } catch (error) {
    console.error("[JarvisX Brain] Error:", error);

    return {
      success: false,
      response: {
        message: "I encountered an issue. Please try again or contact support.",
        actions: [
          { label: "Try Again", action: "RETRY" },
          { label: "Support", action: "NAVIGATE", url: "/support" },
        ],
      },
      meta: {
        error: error.message,
        processingTime: Date.now() - startTime,
        version: "51",
      },
    };
  }
}

/**
 * Execute an action triggered by button click
 * @param {Object} params - Action parameters
 * @param {string} params.action - Action type
 * @param {string} params.value - Action value (for INTENT type)
 * @param {Object} params.context - User context
 * @returns {Promise<Object>} Action result
 */
async function executeAction({ action, value, url, context = {} }) {
  switch (action) {
    case "INTENT":
      // Process as a new intent
      return processMessage({
        message: value, // Value is the intent name
        context,
        options: { params: { triggeredByAction: true } },
      });

    case "NAVIGATE":
      return {
        success: true,
        response: {
          type: "navigation",
          url,
        },
      };

    case "RETRY":
      return {
        success: true,
        response: {
          type: "retry",
          message: "Please try your request again.",
        },
      };

    default:
      return {
        success: false,
        response: {
          message: "Unknown action type.",
        },
      };
  }
}

/**
 * Health check for JarvisX brain
 */
function getHealth() {
  return {
    status: "operational",
    version: "51",
    mode: process.env.JARVIS_MODE || "classic",
    features: {
      intentDetection: true,
      policyGuard: true,
      contextBuilder: true,
      blueprints: true,
      llmPolishing: !!process.env.GROQ_API_KEY,
    },
  };
}

/**
 * Get available intents (for debugging/admin)
 */
function getAvailableIntents() {
  return Object.keys(INTENTS);
}

module.exports = {
  processMessage,
  executeAction,
  getHealth,
  getAvailableIntents,
};
