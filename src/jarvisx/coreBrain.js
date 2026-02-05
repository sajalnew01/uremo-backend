/**
 * UREMO Core Brain - Central AI Orchestration Layer
 *
 * ARCHITECTURE ENFORCEMENT:
 * - Groq LLM NEVER talks directly to users
 * - All responses pass through Core Brain
 * - Admin commands execute with authoritative power
 * - Single entry point to LLM
 *
 * Flow: JarvisX Gateway → Core Brain → Groq (reasoning) → Core Brain → Response
 */

const { callJarvisLLM } = require("../services/jarvisxProviders");
const { sanitizeInput, detectInjection } = require("./injectionSanitizer");
const { getToolByName, validateToolAccess } = require("./toolRegistry");

// =============================================================================
// REQUEST TYPE CLASSIFICATION
// =============================================================================

const REQUEST_TYPES = {
  USER_QUERY: "USER_QUERY", // General questions about platform
  DATA_FETCH: "DATA_FETCH", // Fetching orders, wallet, services
  AUTOMATION: "AUTOMATION", // Automated workflows
  ADMIN_COMMAND: "ADMIN_COMMAND", // Admin-only actions
  SYSTEM_TASK: "SYSTEM_TASK", // Internal system operations
  CHAT: "CHAT", // General conversation
};

/**
 * Classify request type based on message content and context
 * @param {string} message - User message
 * @param {object} context - Request context (role, userId, etc.)
 * @returns {string} Request type
 */
function classifyRequestType(message, context = {}) {
  const msg = String(message || "")
    .toLowerCase()
    .trim();

  // Admin command patterns (only valid if role is admin)
  const adminPatterns = [
    /^create\s+(service|position|user|blog)/i,
    /^update\s+(service|order|user|setting)/i,
    /^delete\s+(service|position|user)/i,
    /^set\s+(price|status|config)/i,
    /^approve\s+(order|proof|request)/i,
    /^reject\s+(order|proof|request)/i,
    /^enable\s+/i,
    /^disable\s+/i,
    /^run\s+(report|sync|migration)/i,
  ];

  for (const pattern of adminPatterns) {
    if (pattern.test(msg)) {
      return REQUEST_TYPES.ADMIN_COMMAND;
    }
  }

  // Data fetch patterns
  const dataPatterns = [
    /(?:show|get|list|view|check|see)\s*(?:my\s*)?(orders?|wallet|balance|services?|tickets?|earnings?)/i,
    /(?:order|payment|transaction)\s*(status|history)/i,
    /(?:pending|active|completed)\s*(orders?|tasks?)/i,
    /(?:how\s*much|what.*balance)/i,
  ];

  for (const pattern of dataPatterns) {
    if (pattern.test(msg)) {
      return REQUEST_TYPES.DATA_FETCH;
    }
  }

  // System task patterns
  const systemPatterns = [
    /(?:system|server|health)\s*(status|check)/i,
    /(?:sync|migrate|backup)/i,
  ];

  for (const pattern of systemPatterns) {
    if (pattern.test(msg)) {
      return REQUEST_TYPES.SYSTEM_TASK;
    }
  }

  // User query patterns (questions about platform)
  const queryPatterns = [
    /(?:what|how|where|when|why|can|do)\s/i,
    /\?$/,
    /(?:help|support|explain|tell\s*me)/i,
  ];

  for (const pattern of queryPatterns) {
    if (pattern.test(msg)) {
      return REQUEST_TYPES.USER_QUERY;
    }
  }

  // Default to chat
  return REQUEST_TYPES.CHAT;
}

// =============================================================================
// INTENT CLASSIFICATION
// =============================================================================

const INTENTS = {
  GREETING: "GREETING",
  BUY_SERVICE: "BUY_SERVICE",
  ORDER_STATUS: "ORDER_STATUS",
  PAYMENT_HELP: "PAYMENT_HELP",
  APPLY_TO_WORK: "APPLY_TO_WORK",
  WALLET_QUERY: "WALLET_QUERY",
  AFFILIATE_QUERY: "AFFILIATE_QUERY",
  SUPPORT_REQUEST: "SUPPORT_REQUEST",
  ADMIN_ACTION: "ADMIN_ACTION",
  GENERAL_QUERY: "GENERAL_QUERY",
};

/**
 * Classify user intent from message
 * @param {string} message - User message
 * @returns {string} Intent
 */
function classifyIntent(message) {
  const msg = String(message || "")
    .toLowerCase()
    .trim();

  // Greeting
  if (/^(hi|hello|hey|yo|sup|good\s*(morning|afternoon|evening))$/i.test(msg)) {
    return INTENTS.GREETING;
  }

  // Buy service
  if (
    /(buy|purchase|need|want|looking\s*for)\s*(a\s*)?(service|account|kyc|verification)/i.test(
      msg,
    )
  ) {
    return INTENTS.BUY_SERVICE;
  }

  // Order status
  if (/(order|delivery|track|where.*order|status.*order)/i.test(msg)) {
    return INTENTS.ORDER_STATUS;
  }

  // Payment
  if (/(payment|pay|proof|receipt|transaction|refund)/i.test(msg)) {
    return INTENTS.PAYMENT_HELP;
  }

  // Apply to work
  if (/(apply|work|job|position|hire|earn|freelance)/i.test(msg)) {
    return INTENTS.APPLY_TO_WORK;
  }

  // Wallet
  if (/(wallet|balance|money|funds)/i.test(msg)) {
    return INTENTS.WALLET_QUERY;
  }

  // Affiliate
  if (/(affiliate|referral|invite|commission)/i.test(msg)) {
    return INTENTS.AFFILIATE_QUERY;
  }

  // Support
  if (/(help|support|issue|problem|complaint|ticket|broken)/i.test(msg)) {
    return INTENTS.SUPPORT_REQUEST;
  }

  // Admin action
  if (/(create|update|delete|approve|reject|enable|disable)/i.test(msg)) {
    return INTENTS.ADMIN_ACTION;
  }

  return INTENTS.GENERAL_QUERY;
}

// =============================================================================
// ROLE ENFORCEMENT
// =============================================================================

/**
 * Validate if user role allows the request type
 * @param {string} role - User role (guest, user, admin)
 * @param {string} requestType - Request type
 * @returns {object} { allowed: boolean, reason?: string }
 */
function enforceRole(role, requestType) {
  const normalizedRole = String(role || "guest").toLowerCase();

  // Admin commands require admin role
  if (requestType === REQUEST_TYPES.ADMIN_COMMAND) {
    if (normalizedRole !== "admin") {
      return {
        allowed: false,
        reason: "Unauthorized command. Admin privileges required.",
        code: "ADMIN_REQUIRED",
      };
    }
  }

  // System tasks require admin role
  if (requestType === REQUEST_TYPES.SYSTEM_TASK) {
    if (normalizedRole !== "admin") {
      return {
        allowed: false,
        reason: "System tasks require administrator access.",
        code: "ADMIN_REQUIRED",
      };
    }
  }

  // Data fetch requires authentication for personal data
  if (requestType === REQUEST_TYPES.DATA_FETCH) {
    if (normalizedRole === "guest") {
      return {
        allowed: false,
        reason: "Please log in to access your data.",
        code: "AUTH_REQUIRED",
      };
    }
  }

  return { allowed: true };
}

// =============================================================================
// GROQ ISOLATION - REASONING ENGINE ONLY
// =============================================================================

/**
 * Build internal reasoning prompt for Groq
 * Groq NEVER speaks to user - only provides reasoning
 * @param {string} message - User message
 * @param {object} context - Platform context
 * @returns {string} System prompt
 */
function buildReasoningPrompt(message, context = {}) {
  const contextJson = JSON.stringify(context, null, 2);

  return `You are an internal reasoning engine for UREMO platform.
Your role is to analyze the user request and provide structured reasoning.

CRITICAL RULES:
- You are NOT speaking to the user
- Your output is for internal processing only
- Never include greetings or pleasantries
- Never use emojis or slang
- Focus on factual analysis

USER REQUEST: ${message}

PLATFORM CONTEXT:
${contextJson}

Analyze the request and return ONLY a JSON object with this exact structure:
{
  "reasoning": "Your internal analysis of what the user needs",
  "suggestedTool": "tool name if action required, null otherwise",
  "suggestedParams": { "param": "value" },
  "draft": "A factual draft response (will be rewritten)",
  "confidence": 0.0 to 1.0,
  "requiresData": ["list", "of", "data", "sources", "needed"],
  "riskLevel": "low|medium|high"
}`;
}

/**
 * Call Groq as internal reasoning engine
 * @param {string} message - User message
 * @param {object} context - Platform context
 * @returns {Promise<object>} Reasoning result
 */
async function callReasoningEngine(message, context = {}) {
  const systemPrompt = buildReasoningPrompt(message, context);

  try {
    const result = await callJarvisLLM({
      provider: "groq",
      model: process.env.JARVISX_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.3, // Lower for more deterministic reasoning
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Analyze: ${message}` },
      ],
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        fallback: true,
      };
    }

    // Parse JSON response
    const content = result.data?.content || "";
    const parsed = parseJsonResponse(content);

    if (!parsed) {
      return {
        ok: true,
        reasoning: "Unable to parse structured response",
        draft: content,
        confidence: 0.5,
        fallback: true,
      };
    }

    return {
      ok: true,
      ...parsed,
    };
  } catch (error) {
    console.error("[CoreBrain] Reasoning engine error:", error.message);
    return {
      ok: false,
      error: { code: "REASONING_FAILED", message: error.message },
      fallback: true,
    };
  }
}

/**
 * Parse JSON from LLM response
 * @param {string} content - Raw LLM output
 * @returns {object|null} Parsed object or null
 */
function parseJsonResponse(content) {
  if (!content || typeof content !== "string") return null;

  // Remove markdown code fences
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from mixed content
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// =============================================================================
// TONE REWRITING - PROFESSIONAL OUTPUT
// =============================================================================

/**
 * Rewrite draft into professional assistant tone
 * @param {string} draft - Raw draft from reasoning
 * @param {object} options - Rewriting options
 * @returns {string} Professional response
 */
function rewriteTone(draft, options = {}) {
  if (!draft || typeof draft !== "string") {
    return "I can assist you with that. Please provide more details.";
  }

  let text = draft.trim();

  // Remove emojis
  text = text.replace(/[\u{1F600}-\u{1F64F}]/gu, "");
  text = text.replace(/[\u{1F300}-\u{1F5FF}]/gu, "");
  text = text.replace(/[\u{1F680}-\u{1F6FF}]/gu, "");
  text = text.replace(/[\u{2600}-\u{26FF}]/gu, "");
  text = text.replace(/[\u{2700}-\u{27BF}]/gu, "");

  // Remove slang/informal phrases
  const slangReplacements = [
    [/\b(hey|yo|sup)\b/gi, ""],
    [
      /\b(gonna|wanna|gotta)\b/gi,
      (m) =>
        m === "gonna" ? "going to" : m === "wanna" ? "want to" : "got to",
    ],
    [/\b(cool|awesome|amazing|wow)\b/gi, ""],
    [/!+/g, "."],
    [/\.\.\./g, "."],
  ];

  for (const [pattern, replacement] of slangReplacements) {
    text = text.replace(pattern, replacement);
  }

  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Ensure proper sentence structure
  if (text && !text.endsWith(".") && !text.endsWith("?")) {
    text += ".";
  }

  // Capitalize first letter
  if (text) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text || "I can assist you with that request.";
}

// =============================================================================
// RESPONSE VALIDATION
// =============================================================================

/**
 * Validate response safety before sending to user
 * @param {string} response - Response text
 * @returns {object} { safe: boolean, issues: string[] }
 */
function validateResponse(response) {
  const issues = [];
  const text = String(response || "").toLowerCase();

  // Check for leaked system information
  const leakPatterns = [
    /api[_-]?key/i,
    /secret/i,
    /password/i,
    /internal\s*error/i,
    /stack\s*trace/i,
    /mongodb/i,
    /database\s*error/i,
    /groq/i,
    /llm/i,
    /prompt/i,
  ];

  for (const pattern of leakPatterns) {
    if (pattern.test(text)) {
      issues.push(`Potential information leak: ${pattern.source}`);
    }
  }

  // Check for inappropriate content
  const inappropriatePatterns = [/\b(fuck|shit|damn|ass|bitch)\b/i];

  for (const pattern of inappropriatePatterns) {
    if (pattern.test(text)) {
      issues.push("Inappropriate language detected");
    }
  }

  return {
    safe: issues.length === 0,
    issues,
  };
}

// =============================================================================
// ADMIN COMMAND PARSING
// =============================================================================

/**
 * Parse natural language admin command into structured action
 * @param {string} message - Admin command
 * @returns {object|null} Parsed action or null
 */
function parseAdminCommand(message) {
  const msg = String(message || "").trim();

  // Create service: "create service <title> price <price> category <category>"
  const createServiceMatch = msg.match(
    /create\s+service\s+(.+?)\s+price\s+(\d+(?:\.\d+)?)/i,
  );
  if (createServiceMatch) {
    const categoryMatch = msg.match(/category\s+(\w+)/i);
    return {
      action: "createService",
      payload: {
        title: createServiceMatch[1].trim(),
        price: parseFloat(createServiceMatch[2]),
        category: categoryMatch ? categoryMatch[1] : "microjobs",
      },
    };
  }

  // Update order status: "update order <id> status <status>"
  const updateOrderMatch = msg.match(
    /update\s+order\s+(\w+)\s+status\s+(\w+)/i,
  );
  if (updateOrderMatch) {
    return {
      action: "updateOrderStatus",
      payload: {
        orderId: updateOrderMatch[1],
        status: updateOrderMatch[2],
      },
    };
  }

  // Approve proof: "approve proof for order <id>"
  const approveProofMatch = msg.match(
    /approve\s+proof\s+(?:for\s+)?order\s+(\w+)/i,
  );
  if (approveProofMatch) {
    return {
      action: "approvePaymentProof",
      payload: {
        orderId: approveProofMatch[1],
      },
    };
  }

  // Get stats: "show stats", "get admin stats"
  if (/(?:show|get)\s*(?:admin\s*)?stats/i.test(msg)) {
    return {
      action: "getAdminStats",
      payload: {},
    };
  }

  // Get pending orders: "show pending orders"
  if (/(?:show|get|list)\s*pending\s*orders/i.test(msg)) {
    return {
      action: "getAdminPendingOrders",
      payload: {},
    };
  }

  // Get pending proofs: "show pending proofs"
  if (/(?:show|get|list)\s*pending\s*proofs/i.test(msg)) {
    return {
      action: "getAdminPendingProofs",
      payload: {},
    };
  }

  return null;
}

// =============================================================================
// MAIN PROCESS FUNCTION
// =============================================================================

/**
 * Process user message through Core Brain
 * This is the ONLY entry point to Groq LLM
 *
 * @param {object} params - Processing parameters
 * @param {string} params.message - User message
 * @param {object} params.session - JarvisSession document
 * @param {object} params.context - Platform context (services, settings, etc.)
 * @param {string} params.userId - User ID
 * @param {string} params.role - User role
 * @returns {Promise<object>} Processed response
 */
// HOTFIX: Cache env refs OUTSIDE the function to avoid shadowing Node's global `process`
const _env = globalThis.process.env;

async function process({ message, session, context = {}, userId, role }) {
  const startTime = Date.now();
  const logs = [];

  const log = (step, data) => {
    logs.push({ step, data, timestamp: Date.now() });
    if (_env.JARVISX_DEBUG === "true") {
      console.log(`[CoreBrain] ${step}:`, JSON.stringify(data));
    }
  };

  try {
    // =========== STEP 1: INPUT SANITIZATION ===========
    log("Step 1 - Sanitization", { originalLength: message?.length });

    const sanitized = sanitizeInput(message);
    if (!sanitized.safe) {
      log("Injection Detected", { patterns: sanitized.detectedPatterns });
      return {
        success: false,
        response: {
          message:
            "Your message could not be processed. Please rephrase your request.",
          actions: [],
        },
        meta: {
          blocked: true,
          reason: "injection_detected",
          processingTime: Date.now() - startTime,
        },
      };
    }

    const cleanMessage = sanitized.text;

    // =========== STEP 2: REQUEST CLASSIFICATION ===========
    log("Step 2 - Classification", { message: cleanMessage.slice(0, 50) });

    const requestType = classifyRequestType(cleanMessage, { role });
    const intent = classifyIntent(cleanMessage);

    log("Classified", { requestType, intent });

    // =========== STEP 3: ROLE ENFORCEMENT ===========
    log("Step 3 - Role Enforcement", { role, requestType });

    const roleCheck = enforceRole(role, requestType);
    if (!roleCheck.allowed) {
      return {
        success: false,
        response: {
          message: roleCheck.reason,
          actions:
            roleCheck.code === "AUTH_REQUIRED"
              ? [{ label: "Log In", action: "NAVIGATE", url: "/login" }]
              : [],
        },
        meta: {
          denied: true,
          code: roleCheck.code,
          processingTime: Date.now() - startTime,
        },
      };
    }

    // =========== STEP 4: ADMIN COMMAND FAST PATH ===========
    if (requestType === REQUEST_TYPES.ADMIN_COMMAND && role === "admin") {
      log("Step 4 - Admin Command", { message: cleanMessage });

      const parsed = parseAdminCommand(cleanMessage);
      if (parsed) {
        log("Parsed Command", parsed);

        // Validate tool access
        const toolAccess = validateToolAccess(parsed.action, role);
        if (!toolAccess.allowed) {
          return {
            success: false,
            response: { message: toolAccess.reason, actions: [] },
            meta: { denied: true, processingTime: Date.now() - startTime },
          };
        }

        // Execute tool directly for admin
        const tool = getToolByName(parsed.action);
        if (tool) {
          try {
            const toolResult = await tool.execute(parsed.payload, {
              userId,
              role,
            });

            const responseMessage = toolResult.success
              ? `Command executed successfully. ${toolResult.message || ""}`
              : `Command failed: ${toolResult.message || "Unknown error"}`;

            return {
              success: toolResult.success,
              response: {
                message: rewriteTone(responseMessage),
                actions: toolResult.actions || [],
                data: toolResult.data,
              },
              meta: {
                requestType,
                intent: INTENTS.ADMIN_ACTION,
                toolUsed: parsed.action,
                processingTime: Date.now() - startTime,
              },
            };
          } catch (toolError) {
            log("Tool Error", { error: toolError.message });
            return {
              success: false,
              response: {
                message: "Command execution failed. Please try again.",
                actions: [],
              },
              meta: {
                error: toolError.message,
                processingTime: Date.now() - startTime,
              },
            };
          }
        }
      }
    }

    // =========== STEP 5: DATA FETCH HANDLING ===========
    if (requestType === REQUEST_TYPES.DATA_FETCH) {
      log("Step 5 - Data Fetch", { intent });

      const dataToolMap = {
        [INTENTS.ORDER_STATUS]: "getOrders",
        [INTENTS.WALLET_QUERY]: "getWallet",
        [INTENTS.AFFILIATE_QUERY]: "getAffiliateStatus",
      };

      const toolName = dataToolMap[intent];
      if (toolName) {
        const tool = getToolByName(toolName);
        if (tool) {
          const toolResult = await tool.execute({}, { userId, role });

          if (toolResult.success) {
            return {
              success: true,
              response: {
                message: rewriteTone(
                  toolResult.message || "Here is your data.",
                ),
                actions: toolResult.actions || [],
                data: toolResult.data,
              },
              meta: {
                requestType,
                intent,
                toolUsed: toolName,
                processingTime: Date.now() - startTime,
              },
            };
          }
        }
      }
    }

    // =========== STEP 6: CALL REASONING ENGINE ===========
    log("Step 6 - Reasoning Engine", {
      hasGroqKey: !!_env.GROQ_API_KEY,
    });

    const reasoningResult = await callReasoningEngine(cleanMessage, {
      intent,
      requestType,
      role,
      availableServices: context.services?.slice(0, 10) || [],
      availableActions: context.availableActions || [],
    });

    log("Reasoning Result", {
      ok: reasoningResult.ok,
      confidence: reasoningResult.confidence,
      fallback: reasoningResult.fallback,
    });

    // =========== STEP 7: TOOL EXECUTION (if suggested) ===========
    if (reasoningResult.ok && reasoningResult.suggestedTool) {
      log("Step 7 - Tool Execution", { tool: reasoningResult.suggestedTool });

      const toolAccess = validateToolAccess(
        reasoningResult.suggestedTool,
        role,
      );
      if (toolAccess.allowed) {
        const tool = getToolByName(reasoningResult.suggestedTool);
        if (tool) {
          try {
            const toolResult = await tool.execute(
              reasoningResult.suggestedParams || {},
              { userId, role },
            );

            if (toolResult.success) {
              const enhancedDraft =
                `${reasoningResult.draft || ""} ${toolResult.message || ""}`.trim();
              reasoningResult.draft = enhancedDraft;
              reasoningResult.toolResult = toolResult;
            }
          } catch (toolError) {
            log("Tool Error", { error: toolError.message });
          }
        }
      }
    }

    // =========== STEP 8: POST-PROCESSING ===========
    log("Step 8 - Post-Processing", {});

    // Discard reasoning (internal only), rewrite draft
    let finalMessage = reasoningResult.draft || reasoningResult.reasoning || "";

    // Fallback handling
    if (reasoningResult.fallback || !finalMessage) {
      finalMessage = getFallbackResponse(intent, role);
    }

    // Rewrite to professional tone
    finalMessage = rewriteTone(finalMessage);

    // =========== STEP 9: RESPONSE VALIDATION ===========
    log("Step 9 - Validation", {});

    const validation = validateResponse(finalMessage);
    if (!validation.safe) {
      log("Validation Failed", { issues: validation.issues });
      finalMessage =
        "I can assist you with that request. Please provide more details.";
    }

    // =========== STEP 10: BUILD FINAL RESPONSE ===========
    log("Step 10 - Final Response", { messageLength: finalMessage.length });

    const suggestedActions = buildSuggestedActions(intent, role);

    return {
      success: true,
      response: {
        message: finalMessage,
        actions: suggestedActions,
        data: reasoningResult.toolResult?.data || null,
      },
      meta: {
        requestType,
        intent,
        confidence: reasoningResult.confidence || 0.7,
        toolUsed: reasoningResult.suggestedTool || null,
        processingTime: Date.now() - startTime,
        version: "CORE_BRAIN_1.0",
      },
    };
  } catch (error) {
    console.error("[CoreBrain] Processing error:", error);
    return {
      success: false,
      response: {
        message: "Service temporarily unavailable. Please try again.",
        actions: [],
      },
      meta: {
        error: error.message,
        processingTime: Date.now() - startTime,
      },
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get fallback response based on intent
 */
function getFallbackResponse(intent, role) {
  const fallbacks = {
    [INTENTS.GREETING]: "Welcome to UREMO. How may I assist you today?",
    [INTENTS.BUY_SERVICE]:
      "I can help you find the right service. Please describe what you are looking for.",
    [INTENTS.ORDER_STATUS]:
      "To check your order status, please provide your order ID or visit the Orders page.",
    [INTENTS.PAYMENT_HELP]:
      "For payment assistance, please visit the Payment page or describe your issue.",
    [INTENTS.APPLY_TO_WORK]:
      "To apply for work positions, please visit the Apply to Work page.",
    [INTENTS.WALLET_QUERY]:
      "To view your wallet balance, please visit the Wallet page.",
    [INTENTS.AFFILIATE_QUERY]:
      "For affiliate information, please visit the Affiliate page.",
    [INTENTS.SUPPORT_REQUEST]:
      "I understand you need support. Please describe your issue in detail.",
    [INTENTS.ADMIN_ACTION]:
      role === "admin"
        ? "Please specify the admin action you would like to perform."
        : "This action requires administrator privileges.",
    [INTENTS.GENERAL_QUERY]:
      "I can assist you with information about our services. What would you like to know?",
  };

  return fallbacks[intent] || fallbacks[INTENTS.GENERAL_QUERY];
}

/**
 * Build suggested actions based on intent
 */
function buildSuggestedActions(intent, role) {
  const actions = [];

  const intentActions = {
    [INTENTS.BUY_SERVICE]: [
      {
        label: "Browse Services",
        action: "NAVIGATE",
        url: "/explore-services",
      },
    ],
    [INTENTS.ORDER_STATUS]: [
      { label: "View Orders", action: "NAVIGATE", url: "/orders" },
    ],
    [INTENTS.PAYMENT_HELP]: [
      { label: "Payment Help", action: "NAVIGATE", url: "/payment" },
    ],
    [INTENTS.APPLY_TO_WORK]: [
      { label: "Apply to Work", action: "NAVIGATE", url: "/apply-to-work" },
    ],
    [INTENTS.WALLET_QUERY]: [
      { label: "View Wallet", action: "NAVIGATE", url: "/wallet" },
    ],
    [INTENTS.AFFILIATE_QUERY]: [
      { label: "Affiliate Dashboard", action: "NAVIGATE", url: "/affiliate" },
    ],
    [INTENTS.SUPPORT_REQUEST]: [
      { label: "Create Ticket", action: "CREATE_TICKET" },
    ],
  };

  if (intentActions[intent]) {
    actions.push(...intentActions[intent]);
  }

  // Admin-specific actions
  if (role === "admin") {
    actions.push({
      label: "Admin Dashboard",
      action: "NAVIGATE",
      url: "/admin",
    });
  }

  return actions.slice(0, 3);
}

// =============================================================================
// ADMIN COMMAND EXECUTION
// =============================================================================

/**
 * Execute admin command with authoritative power
 * Parses natural language into structured command and executes
 *
 * @param {string} command - Natural language command
 * @param {object} context - Admin context (must be admin role)
 * @returns {object} Execution result
 */
async function executeAdminCommand(command, context) {
  // Verify admin role
  if (context.role !== "admin" || !context.isAdmin) {
    return {
      success: false,
      error: "Administrator privileges required",
      response:
        "You must be logged in as an administrator to execute this command.",
    };
  }

  // Parse the command
  const parsed = parseAdminCommand(command);

  if (!parsed.isAdminCommand) {
    // Not an admin command, process as regular chat
    const result = await process(command, context);
    return {
      success: true,
      response: result.response,
      data: null,
      toolUsed: null,
    };
  }

  // Map action + target to tool
  const toolMap = {
    show_orders: "getAdminPendingOrders",
    show_stats: "getAdminStats",
    show_proofs: "getAdminPendingProofs",
    get_orders: "getAdminPendingOrders",
    get_stats: "getAdminStats",
    get_proofs: "getAdminPendingProofs",
    list_orders: "getAdminPendingOrders",
    list_users: "getAdminStats",
    create_service: "createService",
    update_order: "updateOrderStatus",
    approve_proof: "approvePaymentProof",
  };

  const toolKey = `${parsed.action}_${parsed.target}`.replace(/-/g, "_");
  const toolName = toolMap[toolKey];

  if (!toolName) {
    // Command parsed but no matching tool
    return {
      success: false,
      error: "Unknown admin command",
      response: `I understand you want to ${parsed.action} ${parsed.target}, but this action is not yet available. Available commands: show orders, show stats, show proofs, update order status, approve proof.`,
    };
  }

  // Validate tool access
  const accessCheck = validateToolAccess("admin", toolName);
  if (!accessCheck.allowed) {
    return {
      success: false,
      error: accessCheck.reason,
      response: accessCheck.reason,
    };
  }

  // Get and execute tool
  const tool = getToolByName(toolName);
  if (!tool) {
    return {
      success: false,
      error: "Tool not found",
      response: "This tool is currently unavailable.",
    };
  }

  try {
    // Execute tool
    const toolResult = await tool.execute({
      userId: context.userId,
      role: context.role,
      params: parsed.params || {},
    });

    // Format response
    let response = "";
    if (typeof toolResult === "string") {
      response = toolResult;
    } else if (toolResult?.message) {
      response = toolResult.message;
    } else if (toolResult?.data) {
      // Format data for admin viewing
      if (Array.isArray(toolResult.data)) {
        response = `Found ${toolResult.data.length} items:\n${toolResult.data
          .slice(0, 5)
          .map(
            (item) =>
              `- ${item.title || item.name || item._id || JSON.stringify(item)}`,
          )
          .join("\n")}`;
        if (toolResult.data.length > 5) {
          response += `\n... and ${toolResult.data.length - 5} more`;
        }
      } else {
        response = JSON.stringify(toolResult.data, null, 2);
      }
    } else {
      response = "Command executed successfully.";
    }

    return {
      success: true,
      response: response,
      data: toolResult?.data || toolResult,
      toolUsed: toolName,
      toolParams: parsed.params,
    };
  } catch (error) {
    console.error(`[CORE_BRAIN] Admin tool error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      response: `Failed to execute command: ${error.message}`,
      toolUsed: toolName,
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  process,
  executeAdminCommand,
  classifyRequestType,
  classifyIntent,
  enforceRole,
  parseAdminCommand,
  rewriteTone,
  validateResponse,
  REQUEST_TYPES,
  INTENTS,
};
