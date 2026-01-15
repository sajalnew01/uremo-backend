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

module.exports = {
  callJarvisLLM,
};
