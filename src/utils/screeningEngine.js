/**
 * PATCH_90: Hybrid Screening Rubric Engine
 * Auto-validation layer + tier recalculation
 */

/**
 * Run auto-validation checks on screening submission
 * @param {Object} screening - The Screening document
 * @param {Array} answers - Worker's answers array
 * @returns {Object} { autoScore, autoPass, validationFlags, rubricBreakdown }
 */
function runAutoValidation(screening, answers) {
  const validationFlags = [];
  const rules = screening.autoValidationRules || {};
  const questions = screening.questions || [];
  const rubric = screening.rubric || [];
  const passThreshold = screening.passThreshold || screening.passingScore || 70;

  // --- Step 1: Auto-grade MCQs ---
  let totalPoints = 0;
  let earnedPoints = 0;

  const normalizeCorrectAnswers = (question) => {
    if (
      Array.isArray(question.correctAnswers) &&
      question.correctAnswers.length
    ) {
      return question.correctAnswers.map(String);
    }
    if (
      question.correctAnswer !== undefined &&
      question.correctAnswer !== null
    ) {
      if (typeof question.correctAnswer === "number") {
        const opt = question.options?.[question.correctAnswer];
        return opt ? [String(opt)] : [];
      }
      return [String(question.correctAnswer)];
    }
    return [];
  };

  questions.forEach((q, idx) => {
    totalPoints += q.points || 1;
    const questionType = q.type || "single";
    const correctAnswers = normalizeCorrectAnswers(q);
    const answer = answers[idx];

    if (questionType === "single" || questionType === "multiple_choice") {
      if (String(answer || "") === String(correctAnswers[0] || "")) {
        earnedPoints += q.points || 1;
      }
    } else if (questionType === "multi") {
      const given = Array.isArray(answer) ? answer.map(String) : [];
      const expected = [...new Set(correctAnswers.map(String))].sort();
      const actual = [...new Set(given.map(String))].sort();
      if (
        expected.length > 0 &&
        expected.length === actual.length &&
        expected.every((v, i) => v === actual[i])
      ) {
        earnedPoints += q.points || 1;
      }
    } else if (questionType === "text" || questionType === "file_upload") {
      // Text/file_upload: partial credit for auto, full review by admin
      earnedPoints += (q.points || 1) * 0.5;
    }
  });

  const autoScore =
    totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;

  // --- Step 2: Validation rules ---

  // Collect all text answers for validation
  const textAnswers = [];
  questions.forEach((q, idx) => {
    if (
      q.type === "text" ||
      q.type === "file_upload" ||
      typeof answers[idx] === "string"
    ) {
      if (typeof answers[idx] === "string") {
        textAnswers.push(answers[idx]);
      }
    }
  });
  const combinedText = textAnswers.join(" ");
  const wordCount = combinedText.trim()
    ? combinedText.trim().split(/\s+/).length
    : 0;

  // Min words check
  if (rules.minWords && rules.minWords > 0) {
    const passed = wordCount >= rules.minWords;
    validationFlags.push({
      rule: "minWords",
      passed,
      detail: passed
        ? `Word count ${wordCount} meets minimum ${rules.minWords}`
        : `Word count ${wordCount} below minimum ${rules.minWords}`,
    });
  }

  // Max words check
  if (rules.maxWords && rules.maxWords > 0) {
    const passed = wordCount <= rules.maxWords;
    validationFlags.push({
      rule: "maxWords",
      passed,
      detail: passed
        ? `Word count ${wordCount} within maximum ${rules.maxWords}`
        : `Word count ${wordCount} exceeds maximum ${rules.maxWords}`,
    });
  }

  // Banned words check
  if (rules.bannedWords && rules.bannedWords.length > 0) {
    const lowerText = combinedText.toLowerCase();
    const found = rules.bannedWords.filter((w) =>
      lowerText.includes(w.toLowerCase()),
    );
    const passed = found.length === 0;
    validationFlags.push({
      rule: "bannedWords",
      passed,
      detail: passed
        ? "No banned words detected"
        : `Banned words detected: ${found.join(", ")}`,
    });
  }

  // Required fields check
  if (rules.requiredFields && rules.requiredFields.length > 0) {
    const missingFields = [];
    rules.requiredFields.forEach((fieldLabel) => {
      // Check if there's a text question matching or any answer containing it
      const fieldIdx = questions.findIndex(
        (q) =>
          q.question &&
          q.question.toLowerCase().includes(fieldLabel.toLowerCase()),
      );
      if (fieldIdx >= 0) {
        const ans = answers[fieldIdx];
        if (!ans || (typeof ans === "string" && ans.trim().length === 0)) {
          missingFields.push(fieldLabel);
        }
      }
    });
    const passed = missingFields.length === 0;
    validationFlags.push({
      rule: "requiredFields",
      passed,
      detail: passed
        ? "All required fields answered"
        : `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Justification check
  if (rules.requireJustification) {
    // At least one text answer must be >= 20 words
    const hasJustification = textAnswers.some(
      (t) => t.trim().split(/\s+/).length >= 20,
    );
    validationFlags.push({
      rule: "requireJustification",
      passed: hasJustification,
      detail: hasJustification
        ? "Justification provided (≥20 words)"
        : "No adequate justification found (need ≥20 words in at least one text answer)",
    });
  }

  // --- Step 3: Rubric breakdown ---
  const rubricBreakdown = rubric.map((r) => {
    // Auto-score rubric items based on validation flags and auto score
    const maxScore = r.maxScore || 10;
    const weight = r.weight || 1;

    // For auto mode: proportional to autoScore
    const awarded = Math.round((autoScore / 100) * maxScore);

    return {
      criteria: r.criteria,
      weight,
      maxScore,
      awarded: Math.min(awarded, maxScore),
    };
  });

  // --- Step 4: Determine autoPass ---
  const autoPass = autoScore >= passThreshold;

  // Determine submission status based on evaluation mode
  let submissionStatus = "auto_graded";
  const evaluationMode = screening.evaluationMode || "hybrid";

  if (evaluationMode === "manual") {
    // All manual: always pending_review
    submissionStatus = "pending_review";
  } else if (evaluationMode === "hybrid") {
    // Has any text/file questions? Needs review
    const hasManualQuestions = questions.some(
      (q) => q.type === "text" || q.type === "file_upload",
    );
    if (hasManualQuestions) {
      submissionStatus = "pending_review";
    } else {
      // Pure MCQ with rubric → auto_graded but still needs review if rubric exists
      submissionStatus = rubric.length > 0 ? "pending_review" : "auto_graded";
    }
  }
  // evaluationMode === 'auto' → stays auto_graded

  return {
    autoScore,
    autoPass,
    validationFlags,
    rubricBreakdown,
    submissionStatus,
  };
}

/**
 * Calculate tier from qualityScore
 * @param {Number} qualityScore
 * @returns {String} tier: bronze|silver|gold|elite
 */
function calculateTier(qualityScore) {
  if (qualityScore >= 200) return "elite";
  if (qualityScore >= 100) return "gold";
  if (qualityScore >= 50) return "silver";
  return "bronze";
}

/**
 * Update worker quality score after screening approval
 * Screening weight: 0.2
 * @param {Object} profile - ApplyWork document (mutable)
 * @param {Number} autoScore - The auto score achieved
 */
function applyScreeningQualityImpact(profile, autoScore) {
  const weight = 0.2;
  const increment = Math.round(autoScore * weight);
  profile.qualityScore = (profile.qualityScore || 0) + increment;
  profile.tier = calculateTier(profile.qualityScore);
}

module.exports = {
  runAutoValidation,
  calculateTier,
  applyScreeningQualityImpact,
};
