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
};
