const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const JarvisActionProposal = require("../models/JarvisActionProposal");
const JarvisMemory = require("../models/JarvisMemory");
const JarvisX = require("../controllers/jarvisx.lockdown.controller");
const {
  executeAction,
  MAX_ACTIONS_PER_PROPOSAL,
  validateProposal,
  SERVICE_REQUIRED_FIELDS,
  DEFAULT_SERVICE_HERO_IMAGE,
} = require("../services/jarvisExecutor.service");
const { groqChatCompletion } = require("../services/jarvisxProviders");

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

function isPlainObject(v) {
  return (
    !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)
  );
}

function extractToken(req) {
  const headerToken = req.headers.authorization?.split(" ")[1];
  if (typeof headerToken === "string" && headerToken.trim()) return headerToken;
  return null;
}

function tryAttachUser(req) {
  const token = extractToken(req);
  if (!token) return;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    const normalized = {
      ...(decoded && typeof decoded === "object" ? decoded : {}),
    };
    normalized.id =
      normalized.id || normalized._id || normalized.userId || normalized.uid;
    req.user = normalized;
  } catch {
    // ignore
  }
}

function safeJsonParse(maybeJson) {
  if (typeof maybeJson !== "string") return null;
  const trimmed = maybeJson.trim();
  if (!trimmed) return null;

  // Strip ```json fences if present
  const unfenced = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}

function getGroqHealth() {
  return {
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    configured: !!String(process.env.GROQ_API_KEY || "").trim(),
  };
}

const ALLOWED_ACTION_TYPES = new Set([
  "service.create",
  "service.update",
  "service.delete",
  "service.uploadHero",
  "paymentMethod.create",
  "paymentMethod.update",
  "paymentMethod.delete",
  "workPosition.create",
  "workPosition.update",
  "workPosition.delete",
  "settings.update",
  "serviceRequest.create",
]);

const TOOL_TO_ACTION_TYPE = {
  "services.create": "service.create",
  "services.update": "service.update",
  "services.delete": "service.delete",
  "services.uploadHero": "service.uploadHero",
  "cloudinary.upload_service_hero": "service.uploadHero",
  "paymentMethods.create": "paymentMethod.create",
  "paymentMethods.update": "paymentMethod.update",
  "paymentMethods.delete": "paymentMethod.delete",
  "workPositions.create": "workPosition.create",
  "workPositions.update": "workPosition.update",
  "workPositions.delete": "workPosition.delete",
  "settings.update": "settings.update",
  "serviceRequests.create": "serviceRequest.create",
};

function extractTagsFromActions(actions) {
  const tags = new Set();
  for (const a of Array.isArray(actions) ? actions : []) {
    const t = String(a?.type || "").trim();
    if (t) tags.add(t);
  }
  return Array.from(tags).slice(0, 8);
}

function tokenizeForSearch(text) {
  const msg = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!msg) return [];
  const tokens = msg
    .split(" ")
    .filter((t) => t.length >= 4)
    .slice(0, 8);
  return Array.from(new Set(tokens));
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getRelevantMemories(text, limit = 5) {
  const tokens = tokenizeForSearch(text);
  if (!tokens.length) return [];

  const or = tokens.map((t) => ({
    triggerText: { $regex: escapeRegex(t), $options: "i" },
  }));
  const tagOr = tokens.map((t) => ({ tags: t }));

  const items = await JarvisMemory.find({ $or: [...or, ...tagOr] })
    .sort({ confidence: -1, createdAt: -1 })
    .limit(Math.max(1, Math.min(10, limit)))
    .lean();

  return Array.isArray(items) ? items : [];
}

function normalizeActionItem(input) {
  if (!input || typeof input !== "object") return null;

  // Support both legacy ActionItem shape and Agent-OS tool call shape.
  const typeRaw = clampString(input.type, 64);
  const toolRaw = clampString(input.tool, 80);
  const type = typeRaw || TOOL_TO_ACTION_TYPE[toolRaw] || "";

  if (!ALLOWED_ACTION_TYPES.has(type)) return null;

  const payload = isPlainObject(input.payload)
    ? input.payload
    : isPlainObject(input.args)
    ? input.args
    : null;
  if (!isPlainObject(payload)) return null;

  const note = clampString(input.note, 400);
  return { type, payload, ...(note ? { note } : {}) };
}

// callChatCompletion removed - now using callProposalLLM from jarvisxProviders

function buildFallbackProposal(command) {
  return {
    actions: [],
    previewText:
      "Jarvis needs clarification. Please specify exact IDs and fields to change, or provide more details.",
  };
}

exports.health = async (req, res) => {
  const config = getGroqHealth();

  return res.json({
    provider: config.provider,
    model: config.model,
    configured: config.configured,
    actionsCountSupported: MAX_ACTIONS_PER_PROPOSAL,
    serverTime: new Date().toISOString(),
  });
};

exports.propose = async (req, res) => {
  const command = clampString(req.body?.command, 2000);
  if (!command) {
    return res.status(400).json({ message: "command is required" });
  }

  // admin auth enforced by route middleware; still normalize user id here.
  const adminId = req.user?.id;
  if (!adminId || !mongoose.Types.ObjectId.isValid(String(adminId))) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const config = getGroqHealth();

  let proposal = buildFallbackProposal(command);
  let intent = "";
  let reasoning = "";
  let requiresApproval = true;

  try {
    const context = await JarvisX._internal.getAdminContextObject();
    const memories = await getRelevantMemories(command, 5);
    const memoryBlock = memories.length
      ? `\n\nRELEVANT MEMORIES (admin feedback):\n${memories
          .map(
            (m) =>
              `- [${String(m.source)}|c=${Number(m.confidence).toFixed(
                2
              )}] trigger: ${clampString(
                m.triggerText,
                160
              )} | response: ${clampString(m.correctResponse, 220)}`
          )
          .join("\n")}`
      : "";

    if (!config.configured) {
      proposal = {
        actions: [],
        previewText: `AI provider (groq) is not configured. Please set GROQ_API_KEY in environment variables.`,
      };
    } else {
      // P0 FIX: Enhanced system prompt with required fields for service.create
      const system =
        "You are JarvisX Write Mode for UREMO (AI Operator OS). SAFETY: You must ONLY propose actions. Never execute anything.\n" +
        "Output ONLY valid JSON. No markdown. No extra keys. No comments.\n\n" +
        "Return JSON shape:\n" +
        "{\n" +
        '  "intent": string,\n' +
        '  "reasoning": string,\n' +
        '  "requiresApproval": true,\n' +
        '  "actions": [ {"tool": string, "args": object} ],\n' +
        '  "previewText": string\n' +
        "}\n\n" +
        "Allowed tools:\n" +
        "- services.create | services.update | services.delete | services.uploadHero\n" +
        "- paymentMethods.create | paymentMethods.update | paymentMethods.delete\n" +
        "- workPositions.create | workPositions.update | workPositions.delete\n" +
        "- settings.update\n" +
        "- serviceRequests.create\n\n" +
        "CRITICAL: For services.create, you MUST include ALL these fields:\n" +
        "- title: string (required, min 3 chars)\n" +
        "- description: string (required, min 10 chars, describe what the service does)\n" +
        "- price: number (required, e.g. 40)\n" +
        "- category: string (required, e.g. 'Onboarding', 'KYC', 'Interview', 'Marketing')\n" +
        "- deliveryType: 'instant' | 'manual' | 'assisted' (default: 'manual')\n" +
        "- imageUrl: string (use '" +
        DEFAULT_SERVICE_HERO_IMAGE +
        "' if no image provided)\n" +
        "- isActive: boolean (default: true)\n\n" +
        "Example services.create args:\n" +
        '{"title": "Handshake AI USA Gig", "description": "Professional setup for Handshake AI platform gig verification in the USA market.", "price": 40, "category": "Onboarding", "deliveryType": "manual", "imageUrl": "' +
        DEFAULT_SERVICE_HERO_IMAGE +
        '", "isActive": true}\n\n' +
        "Constraints: max 10 actions. If you do not have enough info (like IDs), return actions=[] and previewText asking for clarification.\n\n" +
        `ADMIN CONTEXT JSON: ${JSON.stringify(context)}${memoryBlock}`;

      const user = `Admin command: ${command}`;

      const first = await groqChatCompletion(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { temperature: 0.1, max_tokens: 1200 }
      );

      const firstText = String(first?.choices?.[0]?.message?.content || "");
      let parsed = safeJsonParse(firstText);

      if (!parsed) {
        // One retry with explicit JSON instruction
        const retry = await groqChatCompletion(
          [
            { role: "system", content: system },
            { role: "user", content: user },
            { role: "assistant", content: firstText },
            {
              role: "user",
              content:
                "Your response was not valid JSON. Please return ONLY valid JSON with no markdown, no code fences, no extra text. Start with { and end with }",
            },
          ],
          { temperature: 0.1, max_tokens: 1200 }
        );

        const retryText = String(retry?.choices?.[0]?.message?.content || "");
        parsed = safeJsonParse(retryText);
      }

      if (parsed && typeof parsed === "object") {
        intent = clampString(parsed.intent, 80);
        reasoning = clampString(parsed.reasoning, 1200);
        requiresApproval = parsed.requiresApproval !== false;

        const actionsRaw = Array.isArray(parsed.actions) ? parsed.actions : [];
        const normalizedActions = actionsRaw
          .map(normalizeActionItem)
          .filter(Boolean)
          .slice(0, MAX_ACTIONS_PER_PROPOSAL);

        const previewText = clampString(parsed.previewText, 2000);

        // P0 FIX: Validate actions before creating proposal
        const validation = validateProposal(normalizedActions);

        if (!validation.valid && normalizedActions.length > 0) {
          // Build helpful error message for UI
          const errorDetails = validation.actionErrors
            .map(
              (e) => `Action ${e.index + 1} (${e.type}): ${e.errors.join(", ")}`
            )
            .join("\n");

          proposal = {
            actions: normalizedActions,
            previewText: `⚠️ Proposal has validation issues:\n${errorDetails}\n\nPlease provide more details or edit the proposal before execution.`,
            validationErrors: validation.actionErrors,
          };
        } else {
          proposal = {
            actions: normalizedActions,
            previewText:
              previewText ||
              (normalizedActions.length
                ? "Proposal generated. Review actions before execution."
                : buildFallbackProposal(command).previewText),
          };
        }
      } else {
        proposal = {
          actions: [],
          previewText:
            "LLM error: Failed to generate proposal. Please try again or provide more details.",
        };
      }
    }
  } catch (err) {
    console.error(`[JARVISX_WRITE_PROPOSE_FAIL] errMessage=${err?.message}`);
    proposal = buildFallbackProposal(command);
  }

  if (proposal.actions.length > MAX_ACTIONS_PER_PROPOSAL) {
    return res.status(400).json({ message: "Too many actions (max 10)" });
  }

  const created = await JarvisActionProposal.create({
    createdByAdminId: adminId,
    rawAdminCommand: command,
    intent,
    reasoning,
    requiresApproval,
    status: "pending",
    actions: proposal.actions,
    previewText: proposal.previewText,
    validationErrors: proposal.validationErrors || [],
    ip: clampString(req.ip, 80),
  });

  return res.status(201).json({
    proposalId: created._id,
    actions: created.actions,
    previewText: created.previewText,
    validationErrors: created.validationErrors || [],
  });
};

exports.listProposals = async (req, res) => {
  const status = clampString(req.query?.status, 24);
  const limitRaw = Number(req.query?.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(100, limitRaw))
    : 50;

  const filter = {};
  if (
    status &&
    ["pending", "approved", "rejected", "executed", "failed"].includes(status)
  ) {
    filter.status = status;
  }

  const list = await JarvisActionProposal.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return res.json(Array.isArray(list) ? list : []);
};

exports.getProposal = async (req, res) => {
  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid proposal id" });
  }

  const doc = await JarvisActionProposal.findById(id).lean();
  if (!doc) return res.status(404).json({ message: "Not found" });
  return res.json(doc);
};

exports.reject = async (req, res) => {
  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid proposal id" });
  }

  const reason = clampString(req.body?.reason, 400);

  const doc = await JarvisActionProposal.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });

  if (doc.status !== "pending") {
    return res
      .status(400)
      .json({ message: "Only pending proposals can be rejected" });
  }

  doc.status = "rejected";
  doc.rejectionReason = reason;
  await doc.save();

  // Learn from rejection (negative example)
  try {
    await JarvisMemory.create({
      source: "rejection",
      triggerText: doc.rawAdminCommand,
      correctResponse:
        reason || "Rejected by admin (no reason provided) - avoid this plan",
      tags: extractTagsFromActions(doc.actions),
      confidence: 0.2,
    });
  } catch (err) {
    console.error(`[JARVISX_MEMORY_REJECTION_FAIL] errMessage=${err?.message}`);
  }

  return res.json(doc);
};

exports.approveAndExecute = async (req, res) => {
  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid proposal id" });
  }

  const adminId = req.user?.id;

  const doc = await JarvisActionProposal.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });

  if (doc.status !== "pending") {
    return res
      .status(400)
      .json({ message: "Only pending proposals can be approved" });
  }

  const actions = Array.isArray(doc.actions) ? doc.actions : [];
  if (actions.length > MAX_ACTIONS_PER_PROPOSAL) {
    return res.status(400).json({ message: "Too many actions (max 10)" });
  }

  // P0 FIX: Validate all actions BEFORE execution
  const validation = validateProposal(actions);
  if (!validation.valid) {
    const errorDetails = validation.actionErrors
      .map(
        (e) =>
          `Action ${e.index + 1} (${e.type}): Missing ${e.missingFields.join(
            ", "
          )}`
      )
      .join("; ");

    return res.status(400).json({
      message: "Proposal validation failed - missing required fields",
      validationErrors: validation.actionErrors,
      details: errorDetails,
    });
  }

  doc.status = "approved";
  await doc.save();

  let successCount = 0;
  let failCount = 0;
  const errors = [];
  const undoActions = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    try {
      const result = await executeAction(action, { actorAdminId: adminId });
      if (result?.undo && typeof result.undo === "object") {
        // Store as action items for rollback.
        const normalizedUndo = normalizeActionItem({
          type: result.undo.type,
          payload: result.undo.payload,
          note: result.undo.note,
        });
        if (normalizedUndo) undoActions.push(normalizedUndo);
      }
      successCount++;
    } catch (err) {
      failCount++;
      errors.push({
        index: i,
        type: String(action?.type || "unknown"),
        message:
          clampString(err?.message || "Action failed", 300) || "Action failed",
      });
    }
  }

  doc.executionResult = { successCount, failCount, errors };
  doc.executedAt = new Date();
  doc.status = failCount > 0 ? "failed" : "executed";
  doc.undoActions = undoActions;

  await doc.save();

  // Learn from approvals/executions (positive example)
  try {
    await JarvisMemory.create({
      source: "approval",
      triggerText: doc.rawAdminCommand,
      correctResponse: JSON.stringify(
        {
          intent: doc.intent || "",
          reasoning: doc.reasoning || "",
          actions: doc.actions || [],
        },
        null,
        2
      ),
      tags: extractTagsFromActions(doc.actions),
      confidence: 0.8,
    });
  } catch (err) {
    console.error(`[JARVISX_MEMORY_APPROVAL_FAIL] errMessage=${err?.message}`);
  }

  return res.json(doc);
};

// Compatibility with Agent-OS spec: POST /api/jarvisx/execute { proposalId }
exports.execute = async (req, res) => {
  const proposalId = String(req.body?.proposalId || "");
  if (!proposalId || !mongoose.Types.ObjectId.isValid(proposalId)) {
    return res.status(400).json({ message: "proposalId is required" });
  }

  req.params = req.params || {};
  req.params.id = proposalId;
  return exports.approveAndExecute(req, res);
};

exports.updateProposal = async (req, res) => {
  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid proposal id" });
  }

  const doc = await JarvisActionProposal.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (doc.status !== "pending") {
    return res
      .status(400)
      .json({ message: "Only pending proposals can be edited" });
  }

  const actionsRaw = Array.isArray(req.body?.actions) ? req.body.actions : [];
  const normalizedActions = actionsRaw
    .map(normalizeActionItem)
    .filter(Boolean)
    .slice(0, MAX_ACTIONS_PER_PROPOSAL);

  doc.actions = normalizedActions;

  const previewText = clampString(req.body?.previewText, 2000);
  if (previewText) doc.previewText = previewText;

  const intent = clampString(req.body?.intent, 80);
  if (intent) doc.intent = intent;
  const reasoning = clampString(req.body?.reasoning, 1200);
  if (reasoning) doc.reasoning = reasoning;

  await doc.save();
  return res.json(doc);
};

exports.listMemory = async (req, res) => {
  const source = clampString(req.query?.source, 32);
  const limitRaw = Number(req.query?.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(200, limitRaw))
    : 100;

  const filter = {};
  if (
    source &&
    ["admin_correction", "approval", "rejection", "system_outcome"].includes(
      source
    )
  ) {
    filter.source = source;
  }

  const items = await JarvisMemory.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return res.json(Array.isArray(items) ? items : []);
};

exports.deleteMemory = async (req, res) => {
  const id = String(req.params.id || "");
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  const deleted = await JarvisMemory.findByIdAndDelete(id);
  if (!deleted) return res.status(404).json({ message: "Not found" });
  return res.json({ message: "Deleted" });
};

// Rate limiter export for route use (optional reuse)
exports.proposeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." },
});
