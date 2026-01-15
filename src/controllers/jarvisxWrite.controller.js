const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const JarvisActionProposal = require("../models/JarvisActionProposal");
const JarvisX = require("../controllers/jarvisx.controller");
const {
  executeAction,
  MAX_ACTIONS_PER_PROPOSAL,
} = require("../services/jarvisExecutor.service");

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

  // Strip common fences
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

const ALLOWED_ACTION_TYPES = new Set([
  "service.create",
  "service.update",
  "service.delete",
  "paymentMethod.create",
  "paymentMethod.update",
  "paymentMethod.delete",
  "workPosition.create",
  "workPosition.update",
  "workPosition.delete",
  "settings.update",
]);

function normalizeActionItem(input) {
  if (!input || typeof input !== "object") return null;
  const type = clampString(input.type, 64);
  if (!ALLOWED_ACTION_TYPES.has(type)) return null;

  const payload = input.payload;
  if (!isPlainObject(payload)) return null;

  const note = clampString(input.note, 400);
  return { type, payload, ...(note ? { note } : {}) };
}

async function callChatCompletion({ provider, apiKey, model, messages }) {
  const url =
    provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (provider === "openrouter") {
    if (process.env.OPENROUTER_SITE_URL)
      headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
    if (process.env.OPENROUTER_APP_NAME)
      headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
  }

  const body = {
    model,
    messages,
    temperature: 0.1,
    max_tokens: 600,
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      payload?.error?.message ||
      payload?.message ||
      `JarvisX provider error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const content = payload?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

function buildFallbackProposal(command) {
  return {
    actions: [],
    previewText:
      "Jarvis needs clarification. Please specify exact IDs and fields to change, or provide more details.",
  };
}

exports.health = async (req, res) => {
  const provider =
    String(process.env.JARVISX_PROVIDER || "openai").trim() || "openai";
  const model =
    String(process.env.JARVISX_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";

  return res.json({
    provider,
    model,
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

  const provider =
    String(process.env.JARVISX_PROVIDER || "openai").trim() || "openai";
  const apiKey = String(process.env.JARVISX_API_KEY || "").trim();
  const model =
    String(process.env.JARVISX_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";

  let proposal = buildFallbackProposal(command);

  try {
    const context = await JarvisX._internal.getAdminContextObject();

    if (!apiKey) {
      proposal = {
        actions: [],
        previewText:
          "AI is not configured (missing JARVISX_API_KEY). Please describe the exact changes, including IDs, or configure the provider.",
      };
    } else {
      const system =
        "You are JarvisX Write Mode for UREMO. READ SAFETY: You must ONLY propose actions. Never execute anything.\n" +
        "Output ONLY valid JSON. No markdown. No extra keys. No comments.\n\n" +
        'Return JSON shape: {"actions": ActionItem[], "previewText": string}.\n\n' +
        'ActionItem schema: {"type": string, "payload": object, "note"?: string}.\n' +
        "Allowed action types: service.create, service.update, service.delete, paymentMethod.create, paymentMethod.update, paymentMethod.delete, workPosition.create, workPosition.update, workPosition.delete, settings.update.\n\n" +
        "Constraints: max 10 actions. If you do not have enough info (like IDs), return actions=[] and previewText asking for clarification.\n\n" +
        `ADMIN CONTEXT JSON: ${JSON.stringify(context)}`;

      const user = `Admin command: ${command}`;

      const raw = await callChatCompletion({
        provider,
        apiKey,
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });

      const parsed = safeJsonParse(raw);
      if (parsed && typeof parsed === "object") {
        const actionsRaw = Array.isArray(parsed.actions) ? parsed.actions : [];
        const normalizedActions = actionsRaw
          .map(normalizeActionItem)
          .filter(Boolean)
          .slice(0, MAX_ACTIONS_PER_PROPOSAL);

        const previewText = clampString(parsed.previewText, 2000);

        proposal = {
          actions: normalizedActions,
          previewText:
            previewText ||
            (normalizedActions.length
              ? "Proposal generated. Review actions before execution."
              : buildFallbackProposal(command).previewText),
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
    status: "pending",
    actions: proposal.actions,
    previewText: proposal.previewText,
    ip: clampString(req.ip, 80),
  });

  return res.status(201).json({
    proposalId: created._id,
    actions: created.actions,
    previewText: created.previewText,
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

  doc.status = "approved";
  await doc.save();

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    try {
      await executeAction(action, { actorAdminId: adminId });
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

  await doc.save();

  return res.json(doc);
};

// Rate limiter export for route use (optional reuse)
exports.proposeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." },
});
