/**
 * PATCH_51: Get Admin Pending Proofs Tool
 * Returns list of work proofs awaiting review
 */

const ProofOfWork = require("../../models/ProofOfWork");

/**
 * Get pending proofs for admin review
 * @param {Object} params - { limit }
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function getAdminPendingProofs(params, context) {
  if (!context.isAdmin) {
    return {
      error: "Admin access required",
      code: "ADMIN_REQUIRED",
    };
  }

  const limit = Math.min(params.limit || 10, 50);

  try {
    const proofs = await ProofOfWork.find({ status: "pending" })
      .populate("userId", "name email")
      .populate("projectId", "title")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const count = await ProofOfWork.countDocuments({ status: "pending" });

    return {
      data: {
        proofs: proofs.map((p) => ({
          id: p._id,
          user: p.userId?.name || "Unknown",
          userEmail: p.userId?.email || "",
          project: p.projectId?.title || "Unknown Project",
          submittedAt: p.createdAt,
          hasAttachment: !!(p.attachmentUrl || p.proofUrl),
        })),
        count,
        hasMore: count > limit,
      },
      message: `Found ${count} pending proofs to review`,
    };
  } catch (err) {
    console.error("[getAdminPendingProofs] Error:", err.message);
    return {
      error: "Failed to fetch pending proofs",
      code: "FETCH_ERROR",
    };
  }
}

module.exports = getAdminPendingProofs;
