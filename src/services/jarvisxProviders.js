// GROQ CONFIGURATION
const Groq = require("groq-sdk");

let groq = null;
try {
  if (process.env.GROQ_API_KEY) {
    groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
} catch {
  groq = null;
}

function requireGroqClient() {
  if (!groq) {
    throw new Error(
      "GROQ_API_KEY not configured. Please set GROQ_API_KEY in environment variables.",
    );
  }
  return groq;
}

function withTimeout(promise, timeoutMs) {
  const ms =
    typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : 10000;

  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`Groq request timed out after ${ms}ms`);
      err.name = "GroqTimeoutError";
      reject(err);
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timeoutId),
  );
}

function safeGroqResult(error) {
  const status = Number(error?.status || error?.response?.status || 0) || null;
  return {
    choices: [{ message: { content: "" } }],
    error: {
      message: String(error?.message || "Groq error"),
      status,
      type:
        status === 401 || status === 403
          ? "auth"
          : status === 429
            ? "rate_limited"
            : error?.name === "GroqTimeoutError"
              ? "timeout"
              : "unknown",
    },
  };
}

// Chat completion (public and admin)
async function groqChatCompletion(messages, options = {}) {
  // IMPORTANT (PATCH_08): never throw up the stack for chat completions.
  // Controllers must be able to degrade gracefully.
  if (!groq) {
    return safeGroqResult(
      new Error(
        "GROQ_API_KEY not configured. Please set GROQ_API_KEY in environment variables.",
      ),
    );
  }
  const client = groq;
  const model = String(
    options.model || process.env.JARVISX_MODEL || "llama-3.3-70b-versatile",
  )
    .trim()
    .toLowerCase();
  try {
    const req = client.chat.completions.create({
      model: model || "llama-3.3-70b-versatile",
      messages,
      temperature:
        typeof options.temperature === "number" ? options.temperature : 0.7,
      max_tokens:
        typeof options.max_tokens === "number" ? options.max_tokens : 500,
    });

    return await withTimeout(req, options.timeoutMs || 10000);
  } catch (err) {
    return safeGroqResult(err);
  }
}

function buildJarvisxPublicSystemPrompt(context = {}) {
  // REQUIRED (PATCH_07): Public JarvisX Support must behave like a real assistant.
  const base =
    "You are JarvisX, UREMO’s Support assistant (uremo.online). Behave like a real LLM assistant. Rules:\n" +
    "- Be helpful, confident, and concise (1–4 short sentences).\n" +
    "- Do NOT spam menus, templates, or repeated quick-reply lists. Only show a menu if the user explicitly asks for 'menu', 'options', or 'what can you do'.\n" +
    "- Identity handling must be correct:\n" +
    "  - If user asks about YOU (e.g., 'what’s your name', 'who are you'): say you are JarvisX, UREMO Support assistant.\n" +
    "  - If user asks 'Who am I?': say you cannot identify them unless they are logged in (do NOT invent names/emails).\n" +
    "- If user asks for a specific platform purchase (e.g., Bybit/Binance accounts/KYC) and it’s not listed: propose a 'custom request to admin' and ask 2–3 clarifying questions: request type (KYC vs ready account), quantity, target unit price/budget, any constraints.\n" +
    "- If user asks for listed services: list relevant services from CONTEXT and ask which one they want.\n" +
    "- Never hallucinate that a service exists if it is not in CONTEXT.\n";

  const services = Array.isArray(context?.services) ? context.services : [];
  const titles = services
    .map((s) => String(s?.title || "").trim())
    .filter(Boolean)
    .slice(0, 18);

  const servicesLine = titles.length
    ? `Active services: ${titles.join(", ")}`
    : "Active services: (none listed)";

  return `${base}\n\nCONTEXT:\n- Website: uremo.online\n- ${servicesLine}`;
}

// Proposal generation (admin write mode)
async function groqGenerateProposal(actionType, context) {
  // STRICT JSON output for proposals
  const prompt = `Generate a proposal for admin action.
Action: ${actionType}
Context: ${JSON.stringify(context)}

Output ONLY valid JSON with this structure:
{
  "action": "${actionType}",
  "title": "Short descriptive title",
  "summary": "One-line summary",
  "steps": ["step1", "step2"],
  "dataFields": {},
  "requiresApproval": true
}`;

  const client = requireGroqClient();
  const completion = await client.chat.completions.create({
    model: String(process.env.JARVISX_MODEL || "llama-3.3-70b-versatile")
      .trim()
      .toLowerCase(),
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  return JSON.parse(completion.choices[0].message.content);
}

module.exports = {
  groq,
  groqChatCompletion,
  groqGenerateProposal,
  buildJarvisxPublicSystemPrompt,
};
