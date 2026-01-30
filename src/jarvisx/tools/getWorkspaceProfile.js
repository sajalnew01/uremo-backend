/**
 * PATCH_51: Get Workspace Profile Tool
 * Returns user's worker profile and status
 */

const WorkerApplication = require("../../models/WorkerApplication");
const ProofOfWork = require("../../models/ProofOfWork");

/**
 * Get workspace profile for authenticated user
 * @param {Object} params - {}
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function getWorkspaceProfile(params, context) {
  if (!context.userId) {
    return {
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    };
  }

  try {
    // Get all applications for user
    const applications = await WorkerApplication.find({
      userId: context.userId,
    })
      .populate("positionId", "title category")
      .lean();

    // Get earnings stats
    const proofs = await ProofOfWork.find({
      userId: context.userId,
      status: "approved",
    }).lean();

    const totalEarnings = proofs.reduce(
      (sum, p) => sum + (p.earnedAmount || 0),
      0,
    );
    const pendingProofs = await ProofOfWork.countDocuments({
      userId: context.userId,
      status: "pending",
    });

    // Summarize applications by status
    const summary = {
      totalApplications: applications.length,
      approved: applications.filter((a) => a.applicationStatus === "approved")
        .length,
      pending: applications.filter((a) => a.applicationStatus === "pending")
        .length,
      screening: applications.filter(
        (a) => a.workerStatus === "screening_unlocked",
      ).length,
      activeProjects: applications.filter((a) =>
        ["assigned", "working"].includes(a.workerStatus),
      ).length,
    };

    return {
      data: {
        applications: applications.map((a) => ({
          id: a._id,
          position: a.positionId?.title || "Unknown",
          category: a.positionId?.category || "",
          applicationStatus: a.applicationStatus,
          workerStatus: a.workerStatus,
        })),
        summary,
        earnings: {
          total: totalEarnings,
          pendingProofs,
        },
      },
      message: "Workspace profile loaded",
    };
  } catch (err) {
    console.error("[getWorkspaceProfile] Error:", err.message);
    return {
      error: "Failed to fetch workspace profile",
      code: "FETCH_ERROR",
    };
  }
}

module.exports = getWorkspaceProfile;
