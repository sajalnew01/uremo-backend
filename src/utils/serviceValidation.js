// PATCH_106: Hard validation rules for service allowed actions
// Enforced in service.controller.js and adminServices.controller.js (create + update)

const WorkPosition = require("../models/WorkPosition");

/**
 * Validate service data against PATCH_106 structural rules.
 * Returns { valid: boolean, errors: string[] }
 *
 * Rules:
 *  1. buy=true  → price > 0, currency exists
 *  2. apply=true → linkedJobId must exist and reference a valid WorkPosition
 *  3. rent=true  → isRental must be true, rentalPlans.length > 0
 *  4. deal=true  → price > 0
 */
async function validateServiceActions(
  data,
  { isUpdate = false, existingService = null } = {},
) {
  const errors = [];

  // Merge with existing service values for update context
  const effective =
    isUpdate && existingService ? { ...existingService, ...data } : data;

  const actions = effective.allowedActions || {};

  // RULE 1 — BUY VALIDATION
  if (actions.buy === true) {
    const price = Number(effective.price);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push("Buy-enabled services must have price greater than 0.");
    }
    if (!effective.currency || !String(effective.currency).trim()) {
      errors.push("Buy-enabled services must have a currency.");
    }
  }

  // RULE 2 — APPLY VALIDATION
  if (actions.apply === true) {
    const linkedJobId = effective.linkedJobId;
    if (!linkedJobId) {
      errors.push("Apply-enabled services must be linked to a valid job role.");
    } else {
      // Verify linkedJobId references a valid WorkPosition
      try {
        const exists = await WorkPosition.exists({ _id: linkedJobId });
        if (!exists) {
          errors.push(
            "Apply-enabled services must be linked to a valid job role.",
          );
        }
      } catch {
        // If we can't verify (e.g. invalid ObjectId), skip DB check during creation
        // The post-save hook will auto-create the WorkPosition
        if (isUpdate) {
          errors.push(
            "Apply-enabled services must be linked to a valid job role.",
          );
        }
        // For create: the post-save hook auto-creates the WorkPosition, so skip this check
      }
    }
  }

  // RULE 3 — RENT VALIDATION
  if (actions.rent === true) {
    if (effective.isRental !== true) {
      errors.push(
        "Rent-enabled services must define at least one rental plan.",
      );
    }
    const plans = effective.rentalPlans;
    if (!Array.isArray(plans) || plans.length === 0) {
      errors.push(
        "Rent-enabled services must define at least one rental plan.",
      );
    }
  }

  // RULE 4 — DEAL VALIDATION
  if (actions.deal === true) {
    const price = Number(effective.price);
    if (!Number.isFinite(price) || price <= 0) {
      errors.push("Deal-enabled services must have a base price.");
    }
  }

  // Deduplicate errors
  const unique = [...new Set(errors)];

  return { valid: unique.length === 0, errors: unique };
}

/**
 * RULE 5 — Inconsistency auto-cleanup (applied on update).
 * Mutates the payload in-place.
 *
 * If isRental=false → rentalPlans=[], allowedActions.rent=false
 * If linkedJobId=null → allowedActions.apply=false
 */
function autoCleanupInconsistencies(data) {
  if (data.isRental === false) {
    data.rentalPlans = [];
    if (data.allowedActions) {
      data.allowedActions.rent = false;
    }
  }

  if (data.linkedJobId === null || data.linkedJobId === undefined) {
    if (data.allowedActions) {
      data.allowedActions.apply = false;
    }
  }

  return data;
}

module.exports = {
  validateServiceActions,
  autoCleanupInconsistencies,
};
