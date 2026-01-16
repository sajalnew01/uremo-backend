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
      "GROQ_API_KEY not configured. Please set GROQ_API_KEY in environment variables."
    );
  }
  return groq;
}

// Chat completion (public and admin)
async function groqChatCompletion(messages, options = {}) {
  const client = requireGroqClient();
  const model = String(
    options.model || process.env.JARVISX_MODEL || "llama-3.3-70b-versatile"
  )
    .trim()
    .toLowerCase();
  return await client.chat.completions.create({
    model: model || "llama-3.3-70b-versatile",
    messages,
    temperature:
      typeof options.temperature === "number" ? options.temperature : 0.7,
    max_tokens:
      typeof options.max_tokens === "number" ? options.max_tokens : 500,
  });
}

function buildJarvisxPublicSystemPrompt(context = {}) {
  // REQUIRED (PATCH_07): Public JarvisX Support must behave like a real assistant.
  const base =
    "You are JarvisX Support, a helpful human-like assistant for UREMO (uremo.online). You MUST:\n" +
    "- Answer naturally like a real assistant.\n" +
    "- If asked your name/identity: say you're JarvisX Support.\n" +
    "- If asked about UREMO offerings: explain briefly and list active services from context.\n" +
    "- If user asks for a service not listed: ask what they need, then offer to create a request for admin.\n" +
    "- If user asks a general question: answer normally.\n" +
    "- Keep replies short (1–3 sentences).\n" +
    "- Do NOT repeatedly output a menu unless the user explicitly asks for options/menu.";

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
