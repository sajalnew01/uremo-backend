/**
 * JarvisX LLM Providers
 * Handles LLM calls for JarvisX assistant
 */

const Groq = require("groq-sdk");

console.log("Jarvisx providers updated");

/**
 * Call Groq LLM API
 * @param {Array} messages - Chat messages array
 * @param {Object} options - Options like temperature, max_tokens
 * @returns {Promise<Object>} - Groq completion result
 */
async function groqChatCompletion(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const groq = new Groq({ apiKey });
  const model =
    options.model || process.env.JARVISX_MODEL || "llama-3.3-70b-versatile";

  const response = await groq.chat.completions.create({
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 500,
  });

  return response;
}

/**
 * Call JarvisX LLM with standardized interface
 * @param {Object} config - Configuration object
 * @param {string} config.provider - LLM provider (groq, openai, etc.)
 * @param {string} config.apiKey - API key
 * @param {string} config.model - Model name
 * @param {number} config.temperature - Temperature setting
 * @param {number} config.max_tokens - Max tokens
 * @param {Array} config.messages - Chat messages
 * @returns {Promise<Object>} - Standardized response { ok, data, error }
 */
async function callJarvisLLM(config) {
  const {
    provider = "groq",
    apiKey,
    model,
    temperature = 0.7,
    max_tokens = 500,
    messages,
  } = config;

  try {
    if (provider === "groq") {
      const key = apiKey || process.env.GROQ_API_KEY;
      if (!key) {
        return {
          ok: false,
          error: { code: "NO_API_KEY", message: "GROQ_API_KEY not configured" },
        };
      }

      const groq = new Groq({ apiKey: key });
      const response = await groq.chat.completions.create({
        model: model || "llama-3.3-70b-versatile",
        messages,
        temperature,
        max_tokens,
      });

      const content = response?.choices?.[0]?.message?.content;
      if (!content) {
        return {
          ok: false,
          error: { code: "NO_CONTENT", message: "Empty LLM response" },
        };
      }

      return {
        ok: true,
        data: {
          content,
          model: response?.model,
          usage: response?.usage,
        },
      };
    }

    // Unsupported provider
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_PROVIDER",
        message: `Provider ${provider} not supported`,
      },
    };
  } catch (err) {
    console.error(
      `[JARVISX_LLM_ERROR] provider=${provider} err=${err.message}`,
    );
    return {
      ok: false,
      error: {
        code: "LLM_ERROR",
        message: err.message,
      },
    };
  }
}

module.exports = {
  groqChatCompletion,
  callJarvisLLM,
};
