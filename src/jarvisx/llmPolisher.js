/**
 * PATCH_51: JarvisX LLM Polisher
 * LLM only polishes tone/grammar at the END
 * NEVER generates facts, data, or logic
 */

const Groq = require("groq-sdk");

// System prompt that enforces polishing-only behavior
const POLISH_SYSTEM_PROMPT = `You are a friendly assistant named JarvisX. Your ONLY job is to polish the grammar and tone of the given message.

CRITICAL RULES:
1. DO NOT add any new facts or data
2. DO NOT invent information
3. DO NOT change numbers, dates, or statistics
4. DO NOT add greetings if not present
5. DO NOT remove important information
6. ONLY fix grammar and make it sound natural and friendly
7. Keep the message concise
8. Preserve ALL data points exactly as given

If the message contains lists or numbers, keep them exactly as provided.
Your output should be a polished version of the input, nothing more.`;

// Grow mode prompt (for interactive, dynamic responses)
const GROW_SYSTEM_PROMPT = `You are JarvisX, a friendly AI assistant for UREMO platform.

CRITICAL RULES:
1. Use the provided data ONLY - do not invent facts
2. Polish the message to sound natural and engaging
3. Keep responses concise (under 150 words)
4. Preserve ALL numbers and data points exactly
5. You may add light personality but NEVER fabricate information
6. Do not promise features that aren't mentioned in the data

Make the response feel conversational while being accurate.`;

/**
 * Polish a blueprint response using LLM
 * @param {Object} blueprint - Blueprint from blueprints.js
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Polished response
 */
async function polishResponse(blueprint, options = {}) {
  const { mode = "classic", skipPolish = false } = options;

  // If polishing is disabled or no API key, return raw blueprint
  if (skipPolish || !process.env.GROQ_API_KEY) {
    return {
      text: blueprint.text,
      list: blueprint.list,
      actions: blueprint.actions,
      polished: false,
    };
  }

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // Build the message to polish
    let messageToPolish = blueprint.text;

    // Add list items if present (for context only)
    if (blueprint.list && blueprint.list.length > 0) {
      messageToPolish += "\n\n[List data attached - preserve exactly]";
    }

    const systemPrompt =
      mode === "grow" ? GROW_SYSTEM_PROMPT : POLISH_SYSTEM_PROMPT;

    const response = await groq.chat.completions.create({
      model: process.env.JARVISX_MODEL || "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Polish this message:\n\n${messageToPolish}` },
      ],
      temperature: 0.3, // Low temperature for consistent polishing
      max_tokens: 300,
    });

    const polishedText =
      response.choices[0]?.message?.content?.trim() || blueprint.text;

    // Remove any bracketed annotations the LLM might have added
    const cleanText = polishedText
      .replace(/\[List data attached.*?\]/g, "")
      .trim();

    return {
      text: cleanText,
      list: blueprint.list,
      actions: blueprint.actions,
      polished: true,
    };
  } catch (error) {
    console.error("[JarvisX Polisher] LLM error:", error.message);
    // Fallback to raw blueprint on error
    return {
      text: blueprint.text,
      list: blueprint.list,
      actions: blueprint.actions,
      polished: false,
      error: error.message,
    };
  }
}

/**
 * Quick polish for simple text (no list/actions)
 */
async function polishText(text, mode = "classic") {
  return polishResponse({ text, list: null, actions: [] }, { mode });
}

/**
 * Format final response for API output
 */
function formatResponse(polishedBlueprint) {
  const response = {
    message: polishedBlueprint.text,
    actions: polishedBlueprint.actions || [],
  };

  // Add list if present
  if (polishedBlueprint.list && polishedBlueprint.list.length > 0) {
    response.data = {
      items: polishedBlueprint.list,
      type: polishedBlueprint.listType || "generic",
    };
  }

  // Add metadata
  response.meta = {
    polished: polishedBlueprint.polished,
    version: "51",
  };

  return response;
}

module.exports = {
  polishResponse,
  polishText,
  formatResponse,
  POLISH_SYSTEM_PROMPT,
  GROW_SYSTEM_PROMPT,
};
