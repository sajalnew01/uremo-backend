/**
 * UREMO Injection Sanitizer - Prompt Injection Protection
 *
 * SECURITY ENFORCEMENT:
 * - Detect and block prompt injection attempts
 * - Strip dangerous patterns before processing
 * - Log all injection attempts
 */

// =============================================================================
// INJECTION PATTERNS
// =============================================================================

/**
 * Patterns that indicate prompt injection attempts
 * These patterns attempt to override or manipulate the AI system
 */
const INJECTION_PATTERNS = [
  // Direct prompt override attempts
  /ignore\s*(all\s*)?(previous|prior|above)\s*(instructions?|prompts?|rules?)/i,
  /disregard\s*(all\s*)?(previous|prior|above)\s*(instructions?|prompts?)/i,
  /forget\s*(all\s*)?(previous|prior|above|your)\s*(instructions?|prompts?|training)/i,

  // System prompt manipulation
  /system\s*:\s*/i,
  /\[system\]/i,
  /\<system\>/i,
  /\<\/?instruction\>/i,
  /\<\/?prompt\>/i,
  /\<\/?command\>/i,

  // Role manipulation
  /you\s*are\s*now\s*(a|an|the)/i,
  /act\s*as\s*(a|an|the|if)/i,
  /pretend\s*(to\s*be|you\s*are)/i,
  /roleplay\s*as/i,
  /from\s*now\s*on\s*(you|your)/i,

  // Jailbreak attempts
  /jailbreak/i,
  /dan\s*mode/i,
  /developer\s*mode/i,
  /bypass\s*(safety|filter|restriction)/i,
  /unlock\s*(full|all)\s*(capabilities|features)/i,

  // Prompt leaking attempts
  /show\s*(me\s*)?(your|the)\s*(system\s*)?prompt/i,
  /reveal\s*(your|the)\s*(system\s*)?prompt/i,
  /what\s*(is|are)\s*(your|the)\s*(system\s*)?instructions?/i,
  /print\s*(your|the)\s*(system\s*)?prompt/i,
  /output\s*(your|the)\s*(initial|system)\s*(prompt|instructions)/i,

  // Code injection attempts
  /```\s*(python|javascript|bash|shell|cmd)/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
  /__import__/i,
  /subprocess/i,
  /os\.system/i,

  // Data exfiltration attempts
  /api[_-]?key/i,
  /secret[_-]?key/i,
  /password\s*[:=]/i,
  /token\s*[:=]/i,
  /credential/i,

  // Markdown/HTML injection
  /<script/i,
  /<iframe/i,
  /javascript:/i,
  /onerror\s*=/i,
  /onclick\s*=/i,
];

/**
 * Patterns that should be stripped but don't necessarily indicate malicious intent
 */
const STRIP_PATTERNS = [
  // Control characters
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,

  // Excessive whitespace
  /\s{10,}/g,

  // Null bytes
  /\0/g,

  // Unicode direction overrides
  /[\u202A-\u202E\u2066-\u2069]/g,

  // Zero-width characters
  /[\u200B-\u200D\uFEFF]/g,
];

// =============================================================================
// SANITIZATION FUNCTIONS
// =============================================================================

/**
 * Detect if input contains injection patterns
 * @param {string} input - User input
 * @returns {object} { detected: boolean, patterns: string[] }
 */
function detectInjection(input) {
  if (!input || typeof input !== "string") {
    return { detected: false, patterns: [] };
  }

  const detectedPatterns = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      detectedPatterns.push(pattern.source);
    }
  }

  return {
    detected: detectedPatterns.length > 0,
    patterns: detectedPatterns,
  };
}

/**
 * Strip dangerous patterns from input
 * @param {string} input - User input
 * @returns {string} Cleaned input
 */
function stripDangerousPatterns(input) {
  if (!input || typeof input !== "string") {
    return "";
  }

  let cleaned = input;

  // Apply strip patterns
  for (const pattern of STRIP_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * Sanitize user input for safe processing
 * @param {string} input - User input
 * @param {object} options - Options
 * @returns {object} { safe: boolean, text: string, detectedPatterns?: string[] }
 */
function sanitizeInput(input, options = {}) {
  const { maxLength = 2000, strictMode = true } = options;

  if (!input || typeof input !== "string") {
    return { safe: true, text: "" };
  }

  // Trim and limit length
  let text = String(input).trim().slice(0, maxLength);

  // Detect injection attempts
  const detection = detectInjection(text);

  if (detection.detected) {
    // Log the attempt
    console.warn("[InjectionSanitizer] Injection attempt detected:", {
      patterns: detection.patterns,
      inputPreview: text.slice(0, 100),
      timestamp: new Date().toISOString(),
    });

    if (strictMode) {
      return {
        safe: false,
        text: "",
        detectedPatterns: detection.patterns,
      };
    }
  }

  // Strip dangerous patterns
  text = stripDangerousPatterns(text);

  // Additional safety: limit special character ratio
  const specialCharRatio =
    (text.match(/[^a-zA-Z0-9\s.,?!'-]/g) || []).length / text.length;
  if (specialCharRatio > 0.3 && text.length > 50) {
    console.warn(
      "[InjectionSanitizer] High special character ratio:",
      specialCharRatio,
    );
    // Don't block, just log
  }

  return {
    safe: !detection.detected,
    text,
    detectedPatterns: detection.detected ? detection.patterns : undefined,
  };
}

/**
 * Sanitize output before sending to user
 * Ensures no internal information leaks
 * @param {string} output - Response to sanitize
 * @returns {string} Sanitized output
 */
function sanitizeOutput(output) {
  if (!output || typeof output !== "string") {
    return "";
  }

  let text = output;

  // Remove any accidentally included system information
  const leakPatterns = [
    /GROQ_API_KEY\s*[:=]\s*\S+/gi,
    /JWT_SECRET\s*[:=]\s*\S+/gi,
    /MONGODB_URI\s*[:=]\s*\S+/gi,
    /process\.env\.\w+/gi,
    /Error:\s*[A-Z][a-z]+Error:/gi,
    /at\s+\w+\s+\([^)]+:\d+:\d+\)/gi, // Stack trace lines
    /node_modules/gi,
  ];

  for (const pattern of leakPatterns) {
    text = text.replace(pattern, "[REDACTED]");
  }

  return text;
}

/**
 * Validate that a value is safe to use as a parameter
 * @param {string} value - Parameter value
 * @param {string} type - Expected type (string, number, email, etc.)
 * @returns {object} { valid: boolean, value: any, error?: string }
 */
function validateParameter(value, type = "string") {
  if (value === undefined || value === null) {
    return { valid: true, value: null };
  }

  switch (type) {
    case "string":
      const strVal = String(value).trim();
      const sanitized = sanitizeInput(strVal, {
        maxLength: 1000,
        strictMode: false,
      });
      return { valid: true, value: sanitized.text };

    case "number":
      const numVal = Number(value);
      if (!Number.isFinite(numVal)) {
        return { valid: false, error: "Invalid number" };
      }
      return { valid: true, value: numVal };

    case "email":
      const emailVal = String(value).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailVal)) {
        return { valid: false, error: "Invalid email format" };
      }
      return { valid: true, value: emailVal };

    case "objectId":
      const idVal = String(value).trim();
      const objectIdRegex = /^[a-f\d]{24}$/i;
      if (!objectIdRegex.test(idVal)) {
        return { valid: false, error: "Invalid ID format" };
      }
      return { valid: true, value: idVal };

    case "boolean":
      if (typeof value === "boolean") {
        return { valid: true, value };
      }
      const boolStr = String(value).toLowerCase();
      if (["true", "1", "yes"].includes(boolStr)) {
        return { valid: true, value: true };
      }
      if (["false", "0", "no"].includes(boolStr)) {
        return { valid: true, value: false };
      }
      return { valid: false, error: "Invalid boolean" };

    default:
      return { valid: true, value: String(value) };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  detectInjection,
  stripDangerousPatterns,
  sanitizeInput,
  sanitizeOutput,
  validateParameter,
  INJECTION_PATTERNS,
};
