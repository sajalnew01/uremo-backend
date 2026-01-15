function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

function normalizeProvider(provider) {
  const p = String(provider || "")
    .trim()
    .toLowerCase();
  if (!p) return "";
  if (p === "groq") return "groq";
  if (p === "openrouter") return "openrouter";
  if (p === "openai") return "openai";
  return p;
}

function getEndpointForProvider(provider) {
  if (provider === "groq")
    return "https://api.groq.com/openai/v1/chat/completions";
  if (provider === "openrouter")
    return "https://openrouter.ai/api/v1/chat/completions";
  // default/future: openai
  return "https://api.openai.com/v1/chat/completions";
}

function buildHeaders({ provider, apiKey }) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // OpenRouter optional headers (safe if missing)
  if (provider === "openrouter") {
    if (process.env.OPENROUTER_SITE_URL)
      headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
    if (process.env.OPENROUTER_APP_NAME)
      headers["X-Title"] = process.env.OPENROUTER_APP_NAME;
  }

  return headers;
}

function normalizeProviderError({ provider, status, payload, errorMessage }) {
  const safeProvider = clampString(provider, 20) || "unknown";
  const safeStatus = Number.isFinite(Number(status))
    ? Number(status)
    : undefined;

  // Never pass raw provider error payload upward.
  const msg = clampString(errorMessage, 180) || "LLM provider request failed";

  return {
    code: "LLM_PROVIDER_ERROR",
    provider: safeProvider,
    status: safeStatus,
    message: msg,
    // Note: keep a tiny hint for server logs only if needed.
    hint: clampString(payload?.error?.type || payload?.error?.code || "", 60),
  };
}

/**
 * Get the configured LLM provider and API key
 * Groq is the default and preferred provider
 */
function getLLMConfig() {
  const provider =
    normalizeProvider(process.env.JARVISX_PROVIDER || "groq") || "groq";

  // For Groq, use GROQ_API_KEY; for others, use JARVISX_API_KEY
  let apiKey = "";
  if (provider === "groq") {
    apiKey = String(process.env.GROQ_API_KEY || "").trim();
  } else {
    apiKey = String(process.env.JARVISX_API_KEY || "").trim();
  }

  const model = String(
    process.env.JARVISX_MODEL ||
      (provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini")
  ).trim();

  return { provider, apiKey, model };
}

/**
 * callJarvisLLM
 * - Never throws raw provider errors upward.
 * - Returns { ok, assistantText, error }.
 */
async function callJarvisLLM({
  provider,
  apiKey,
  model,
  messages,
  temperature,
  max_tokens,
}) {
  const normalizedProvider = normalizeProvider(provider);

  if (!normalizedProvider) {
    return {
      ok: false,
      assistantText: "",
      error: {
        code: "LLM_PROVIDER_MISSING",
        provider: "",
        status: undefined,
        message: "LLM provider not configured",
      },
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      assistantText: "",
      error: {
        code: "LLM_API_KEY_MISSING",
        provider: normalizedProvider,
        status: undefined,
        message: "LLM api key not configured",
      },
    };
  }

  const url = getEndpointForProvider(normalizedProvider);
  const headers = buildHeaders({ provider: normalizedProvider, apiKey });

  const body = {
    model,
    messages,
    temperature,
    max_tokens,
  };

  try {
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
        `LLM provider error (${res.status})`;

      return {
        ok: false,
        assistantText: "",
        error: normalizeProviderError({
          provider: normalizedProvider,
          status: res.status,
          payload,
          errorMessage: msg,
        }),
      };
    }

    const content = payload?.choices?.[0]?.message?.content;
    const assistantText = typeof content === "string" ? content : "";

    return {
      ok: true,
      assistantText,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      assistantText: "",
      error: normalizeProviderError({
        provider: normalizedProvider,
        status: undefined,
        payload: null,
        errorMessage: err?.message || "LLM request failed",
      }),
    };
  }
}

/**
 * Call LLM for proposal/write mode with JSON output
 * Uses Groq by default, with JSON retry logic
 */
async function callProposalLLM({
  messages,
  temperature = 0.1,
  max_tokens = 1200,
}) {
  const config = getLLMConfig();

  if (!config.apiKey) {
    return {
      ok: false,
      content: "",
      error: {
        code: "LLM_API_KEY_MISSING",
        provider: config.provider,
        message: `LLM api key not configured for ${config.provider}`,
      },
    };
  }

  const url = getEndpointForProvider(config.provider);
  const headers = buildHeaders({
    provider: config.provider,
    apiKey: config.apiKey,
  });

  const body = {
    model: config.model,
    messages,
    temperature,
    max_tokens,
  };

  try {
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
        `LLM error (${res.status})`;
      return {
        ok: false,
        content: "",
        error: normalizeProviderError({
          provider: config.provider,
          status: res.status,
          payload,
          errorMessage: msg,
        }),
      };
    }

    const content = payload?.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";

    // Try to parse as JSON
    let parsed = safeJsonParse(text);

    // If JSON parse failed, retry once with explicit JSON instruction
    if (!parsed && text) {
      console.log(
        `[JARVISX_PROPOSAL_JSON_RETRY] First attempt returned non-JSON, retrying...`
      );

      const retryMessages = [
        ...messages,
        { role: "assistant", content: text },
        {
          role: "user",
          content:
            "Your response was not valid JSON. Please return ONLY valid JSON with no markdown, no code fences, no extra text. Start with { and end with }",
        },
      ];

      const retryRes = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...body, messages: retryMessages }),
      });

      const retryPayload = await retryRes.json().catch(() => null);
      if (retryRes.ok) {
        const retryContent = retryPayload?.choices?.[0]?.message?.content;
        const retryText = typeof retryContent === "string" ? retryContent : "";
        parsed = safeJsonParse(retryText);
        if (parsed) {
          console.log(`[JARVISX_PROPOSAL_JSON_RETRY] Retry successful`);
          return { ok: true, content: retryText, parsed, error: null };
        }
      }
    }

    return {
      ok: true,
      content: text,
      parsed,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      content: "",
      error: normalizeProviderError({
        provider: config.provider,
        status: undefined,
        payload: null,
        errorMessage: err?.message || "Proposal LLM request failed",
      }),
    };
  }
}

/**
 * Safe JSON parse with fence stripping
 */
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

module.exports = {
  callJarvisLLM,
  callProposalLLM,
  getLLMConfig,
  safeJsonParse,
};
