/**
 * PATCH-64: Worker Status State Machine
 *
 * Defines ALL valid worker status transitions.
 * Any transition not in this map MUST be rejected.
 */

const WORKER_STATUS_TRANSITIONS = {
  // Fresh applicant - just applied
  fresh: ["screening_unlocked"],

  // Application approved, can access training/screening
  applied: ["screening_unlocked"],

  // Screening materials accessible
  screening_unlocked: ["test_submitted"],

  // Test submitted, awaiting review
  test_submitted: ["ready_to_work", "screening_unlocked"], // Can retry if failed

  // Passed screening, ready for assignment
  ready_to_work: ["assigned"],

  // Assigned to a project
  assigned: ["working", "ready_to_work"], // Can unassign

  // Actively working on project
  working: ["suspended", "ready_to_work"], // Complete or suspend

  // Suspended (temporary)
  suspended: ["ready_to_work"], // Can reactivate
};

// Human-readable status labels
const WORKER_STATUS_LABELS = {
  fresh: "Fresh Application",
  applied: "Application Received",
  screening_unlocked: "Screening Unlocked",
  test_submitted: "Test Submitted",
  ready_to_work: "Ready to Work",
  assigned: "Assigned to Project",
  working: "Currently Working",
  suspended: "Suspended",
};

/**
 * Check if a status transition is allowed
 * @param {string} currentStatus
 * @param {string} targetStatus
 * @returns {{ allowed: boolean, reason?: string }}
 */
function canTransitionWorkerStatus(currentStatus, targetStatus) {
  // Normalize status
  const current = String(currentStatus || "")
    .toLowerCase()
    .trim();
  const target = String(targetStatus || "")
    .toLowerCase()
    .trim();

  // Same status - no change needed
  if (current === target) {
    return { allowed: true, reason: "No change needed" };
  }

  // Check if current status exists in map
  const allowedTargets = WORKER_STATUS_TRANSITIONS[current];

  if (!allowedTargets) {
    return {
      allowed: false,
      reason: `Unknown current status: "${current}"`,
    };
  }

  // Check if transition is allowed
  if (allowedTargets.includes(target)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Invalid transition: "${current}" → "${target}". Allowed: ${allowedTargets.join(", ") || "none"}`,
  };
}

/**
 * Get all allowed next statuses for a given status
 * @param {string} currentStatus
 * @returns {string[]}
 */
function getAllowedNextStatuses(currentStatus) {
  const current = String(currentStatus || "")
    .toLowerCase()
    .trim();
  return WORKER_STATUS_TRANSITIONS[current] || [];
}

module.exports = {
  WORKER_STATUS_TRANSITIONS,
  WORKER_STATUS_LABELS,
  canTransitionWorkerStatus,
  getAllowedNextStatuses,
};
