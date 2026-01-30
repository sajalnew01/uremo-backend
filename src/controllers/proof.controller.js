/**
 * PATCH_48: Proof of Work Controller
 * Handles worker proof submissions and admin review
 */

const ProofOfWork = require("../models/ProofOfWork");
const Project = require("../models/Project");
const ApplyWork = require("../models/ApplyWork");
const User = require("../models/User");
const { isPublicProofEnabled } = require("../utils/featureFlags");

// ============================================
// WORKER ENDPOINTS
// ============================================

/**
 * POST /api/workspace/project/:id/proof
 * Worker submits proof of work for a project
 */
exports.submitProof = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { submissionText, attachments } = req.body;
    const workerId = req.user.id;

    const text = String(submissionText || "").trim();
    if (!text) {
      return res.status(400).json({ message: "submissionText is required" });
    }

    const normalizeAttachments = (input) => {
      if (!Array.isArray(input)) return [];
      return input
        .map((a) => {
          if (!a) return null;
          if (typeof a === "string") {
            const url = a.trim();
            return url ? { url } : null;
          }
          if (typeof a === "object" && typeof a.url === "string") {
            const url = a.url.trim();
            if (!url) return null;
            return {
              url,
              publicId: a.publicId || a.public_id,
              filename: a.filename || a.originalname,
              type: a.type || a.fileType,
            };
          }
          return null;
        })
        .filter(Boolean);
    };

    const normalizedAttachments = normalizeAttachments(attachments);

    // Validate project exists and belongs to worker
    const project = await Project.findOne({
      _id: projectId,
      assignedTo: workerId,
    });

    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found or not assigned to you" });
    }

    // Get worker's job role
    const workerProfile = await ApplyWork.findOne({ user: workerId });
    if (!workerProfile) {
      return res.status(400).json({ message: "Worker profile not found" });
    }

    // Check if proof already exists
    const existingProof = await ProofOfWork.findOne({
      workerId,
      projectId,
    });

    if (existingProof) {
      // Only allow resubmission if previous was rejected
      if (existingProof.status === "pending") {
        return res
          .status(400)
          .json({ message: "Proof already submitted and pending review" });
      }
      if (existingProof.status === "approved") {
        return res.status(400).json({ message: "Proof already approved" });
      }

      // Update rejected proof for resubmission
      existingProof.submissionText = text;
      existingProof.attachments = normalizedAttachments;
      existingProof.status = "pending";
      existingProof.reviewedBy = null;
      existingProof.reviewedAt = null;
      existingProof.rejectionReason = null;
      await existingProof.save();

      return res.json({
        success: true,
        message: "Proof resubmitted successfully",
        proof: existingProof,
      });
    }

    // Create new proof
    const proof = await ProofOfWork.create({
      workerId,
      jobRoleId: workerProfile.jobId || workerProfile.position,
      projectId,
      submissionText: text,
      attachments: normalizedAttachments,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Proof submitted successfully",
      proof,
    });
  } catch (err) {
    console.error("[submitProof] Error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/workspace/project/:id/proof
 * Get proof status for a specific project
 */
exports.getProjectProof = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const workerId = req.user.id;

    const proof = await ProofOfWork.findOne({
      workerId,
      projectId,
    }).populate("jobRoleId", "title");

    res.json({
      success: true,
      proof: proof || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/workspace/my-proofs
 * Get all proofs submitted by logged-in worker
 */
exports.getMyProofs = async (req, res) => {
  try {
    const workerId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { workerId };
    if (status) filter.status = status;

    const proofs = await ProofOfWork.find(filter)
      .populate("projectId", "title payRate payType status earningsCredited")
      .populate("jobRoleId", "title")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await ProofOfWork.countDocuments(filter);

    res.json({
      success: true,
      proofs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * GET /api/admin/proofs
 * Get all proof submissions with filters
 */
exports.adminGetProofs = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const proofs = await ProofOfWork.find(filter)
      .populate("workerId", "firstName lastName email")
      .populate("projectId", "title payRate payType status earningsCredited")
      .populate("jobRoleId", "title")
      .populate("reviewedBy", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await ProofOfWork.countDocuments(filter);

    // Count by status
    const stats = {
      pending: await ProofOfWork.countDocuments({ status: "pending" }),
      approved: await ProofOfWork.countDocuments({ status: "approved" }),
      rejected: await ProofOfWork.countDocuments({ status: "rejected" }),
    };

    res.json({
      success: true,
      proofs,
      total,
      stats,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/proofs/:id
 * Get single proof details
 */
exports.adminGetProofById = async (req, res) => {
  try {
    const proof = await ProofOfWork.findById(req.params.id)
      .populate("workerId", "firstName lastName email")
      .populate(
        "projectId",
        "title description payRate payType status assignedAt earningsCredited",
      )
      .populate("jobRoleId", "title category")
      .populate("reviewedBy", "firstName lastName");

    if (!proof) {
      return res.status(404).json({ message: "Proof not found" });
    }

    res.json({ success: true, proof });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /api/admin/proofs/:id/approve
 * Approve proof and credit worker
 */
exports.adminApproveProof = async (req, res) => {
  try {
    const { adminNotes } = req.body;
    const adminId = req.user.id;

    const proof = await ProofOfWork.findById(req.params.id);
    if (!proof) {
      return res.status(404).json({ message: "Proof not found" });
    }

    if (proof.status === "approved") {
      return res.status(400).json({ message: "Proof already approved" });
    }

    // Update proof status
    proof.status = "approved";
    proof.reviewedBy = adminId;
    proof.reviewedAt = new Date();
    if (adminNotes) proof.adminNotes = adminNotes;
    await proof.save();

    // Get project and mark as completed
    const project = await Project.findById(proof.projectId);
    if (project) {
      // Mark completed if not already
      if (project.status !== "completed") {
        project.status = "completed";
        project.completedAt = new Date();
      }

      // Prevent double-credit
      const alreadyCredited = Number(project.earningsCredited || 0) > 0;
      if (!alreadyCredited) {
        const amount = Number(project.payRate || 0);
        if (amount > 0) {
          project.earningsCredited = amount;
          project.creditedAt = new Date();

          // Credit worker earnings (existing worker-wallet logic)
          const worker = await ApplyWork.findOne({ user: proof.workerId });
          if (worker) {
            worker.totalEarnings = (worker.totalEarnings || 0) + amount;

            // Add to completed projects
            worker.projectsCompleted = worker.projectsCompleted || [];
            worker.projectsCompleted.push({
              projectId: project._id,
              completedAt: project.completedAt || new Date(),
              earnings: amount,
            });

            // Reset worker status to ready_to_work
            if (worker.currentProject?.toString() === project._id.toString()) {
              worker.currentProject = null;
              worker.workerStatus = "ready_to_work";
            }
            await worker.save();
          }
        }
      }

      await project.save();
    }

    res.json({
      success: true,
      message: "Proof approved and earnings credited",
      proof,
    });
  } catch (err) {
    console.error("[adminApproveProof] Error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /api/admin/proofs/:id/reject
 * Reject proof with reason
 */
exports.adminRejectProof = async (req, res) => {
  try {
    const { rejectionReason, adminNotes } = req.body;
    const adminId = req.user.id;

    if (!rejectionReason) {
      return res.status(400).json({ message: "Rejection reason required" });
    }

    const proof = await ProofOfWork.findById(req.params.id);
    if (!proof) {
      return res.status(404).json({ message: "Proof not found" });
    }

    if (proof.status === "approved") {
      return res.status(400).json({ message: "Cannot reject approved proof" });
    }

    proof.status = "rejected";
    proof.reviewedBy = adminId;
    proof.reviewedAt = new Date();
    proof.rejectionReason = rejectionReason;
    if (adminNotes) proof.adminNotes = adminNotes;
    await proof.save();

    res.json({
      success: true,
      message: "Proof rejected",
      proof,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============================================
// PUBLIC ENDPOINTS (Feature Flagged)
// ============================================

/**
 * GET /api/proofs/public
 * Get public proof gallery (only if enabled)
 */
exports.getPublicProofs = async (req, res) => {
  if (!isPublicProofEnabled()) {
    return res.status(404).json({ message: "Not found" });
  }

  try {
    const proofs = await ProofOfWork.find({ status: "approved" })
      .populate("jobRoleId", "title")
      .select("submissionText attachments createdAt jobRoleId")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({ success: true, proofs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
