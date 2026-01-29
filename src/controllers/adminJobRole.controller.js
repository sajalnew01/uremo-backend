/**
 * PATCH_43: Admin Job Role Controller
 * Full control over job roles, applicants, screenings, and assignments
 */
const mongoose = require("mongoose");
const ApplyWork = require("../models/ApplyWork");
const WorkPosition = require("../models/WorkPosition");
const Screening = require("../models/Screening");
const Project = require("../models/Project");
const User = require("../models/User");

// ============ JOB ROLE MANAGEMENT ============

/**
 * GET /api/admin/workspace/job/:id
 * Get full job role details with stats
 */
exports.getJobRole = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "Invalid job ID" });
    }

    const job = await WorkPosition.findById(id)
      .populate("screeningId", "title passingScore timeLimit")
      .populate("serviceId", "title category")
      .lean();

    if (!job) {
      return res.status(404).json({ ok: false, message: "Job role not found" });
    }

    // Get applicant counts by status
    const applicantCounts = await ApplyWork.aggregate([
      { $match: { position: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: "$workerStatus", count: { $sum: 1 } } },
    ]);

    const countsByStatus = {};
    applicantCounts.forEach((c) => {
      countsByStatus[c._id] = c.count;
    });

    res.json({
      ok: true,
      job,
      stats: {
        totalApplicants: Object.values(countsByStatus).reduce(
          (a, b) => a + b,
          0,
        ),
        applied: countsByStatus.applied || 0,
        screeningUnlocked: countsByStatus.screening_unlocked || 0,
        testSubmitted: countsByStatus.test_submitted || 0,
        failed: countsByStatus.failed || 0,
        readyToWork: countsByStatus.ready_to_work || 0,
        assigned: countsByStatus.assigned || 0,
        working: countsByStatus.working || 0,
        suspended: countsByStatus.suspended || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * GET /api/admin/workspace/job/:id/applicants
 * Get all applicants for a job role with filtering
 */
exports.getApplicants = async (req, res) => {
  try {
    const { id } = req.params;
    const { workerStatus, page = 1, limit = 20 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "Invalid job ID" });
    }

    const filter = { position: new mongoose.Types.ObjectId(id) };
    if (workerStatus) {
      filter.workerStatus = workerStatus;
    }

    const total = await ApplyWork.countDocuments(filter);
    const applicants = await ApplyWork.find(filter)
      .populate("user", "name email createdAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      ok: true,
      applicants,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/job/:id/approve
 * Approve an applicant (changes status from pending to approved)
 */
exports.approveApplicant = async (req, res) => {
  try {
    const { id } = req.params;
    const { applicantId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(applicantId)) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid applicant ID" });
    }

    const applicant = await ApplyWork.findOne({
      _id: applicantId,
      position: id,
    });

    if (!applicant) {
      return res
        .status(404)
        .json({ ok: false, message: "Applicant not found" });
    }

    applicant.status = "approved";
    applicant.approvedBy = req.user.id;
    applicant.approvedAt = new Date();
    await applicant.save();

    res.json({
      ok: true,
      message: "Applicant approved",
      applicant,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/job/:id/reject
 * Reject an applicant
 */
exports.rejectApplicant = async (req, res) => {
  try {
    const { id } = req.params;
    const { applicantId, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(applicantId)) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid applicant ID" });
    }

    const applicant = await ApplyWork.findOne({
      _id: applicantId,
      position: id,
    });

    if (!applicant) {
      return res
        .status(404)
        .json({ ok: false, message: "Applicant not found" });
    }

    applicant.status = "rejected";
    applicant.adminNotes = reason || "";
    await applicant.save();

    res.json({
      ok: true,
      message: "Applicant rejected",
      applicant,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/job/:id/unlock-screening
 * Unlock screening for an approved applicant
 */
exports.unlockScreening = async (req, res) => {
  try {
    const { id } = req.params;
    const { applicantId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(applicantId)) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid applicant ID" });
    }

    const applicant = await ApplyWork.findOne({
      _id: applicantId,
      position: id,
    });

    if (!applicant) {
      return res
        .status(404)
        .json({ ok: false, message: "Applicant not found" });
    }

    if (applicant.status !== "approved") {
      return res
        .status(400)
        .json({ ok: false, message: "Must approve applicant first" });
    }

    applicant.workerStatus = "screening_unlocked";
    await applicant.save();

    res.json({
      ok: true,
      message: "Screening unlocked for applicant",
      applicant,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/job/:id/set-training
 * Set training materials for the job role
 */
exports.setTraining = async (req, res) => {
  try {
    const { id } = req.params;
    const { trainingMaterials } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "Invalid job ID" });
    }

    const job = await WorkPosition.findByIdAndUpdate(
      id,
      { trainingMaterials: trainingMaterials || [] },
      { new: true },
    );

    if (!job) {
      return res.status(404).json({ ok: false, message: "Job role not found" });
    }

    res.json({
      ok: true,
      message: "Training materials updated",
      job,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/job/:id/set-screening
 * Attach a screening to the job role
 */
exports.setScreening = async (req, res) => {
  try {
    const { id } = req.params;
    const { screeningId, hasScreening } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "Invalid job ID" });
    }

    const update = {
      hasScreening: hasScreening !== false,
    };

    if (screeningId && mongoose.Types.ObjectId.isValid(screeningId)) {
      update.screeningId = screeningId;
    }

    const job = await WorkPosition.findByIdAndUpdate(id, update, { new: true });

    if (!job) {
      return res.status(404).json({ ok: false, message: "Job role not found" });
    }

    res.json({
      ok: true,
      message: "Screening attached to job role",
      job,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/job/:id/assign-project
 * Assign a project to a worker in this job role
 */
exports.assignProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { applicantId, projectId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(applicantId)) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid applicant ID" });
    }
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({ ok: false, message: "Invalid project ID" });
    }

    const applicant = await ApplyWork.findOne({
      _id: applicantId,
      position: id,
    });

    if (!applicant) {
      return res
        .status(404)
        .json({ ok: false, message: "Applicant not found" });
    }

    if (!["ready_to_work", "assigned"].includes(applicant.workerStatus)) {
      return res
        .status(400)
        .json({
          ok: false,
          message: "Worker must be ready_to_work or assigned",
        });
    }

    const project = await Project.findByIdAndUpdate(
      projectId,
      {
        assignedTo: applicant.user,
        assignedAt: new Date(),
        status: "assigned",
      },
      { new: true },
    );

    if (!project) {
      return res.status(404).json({ ok: false, message: "Project not found" });
    }

    applicant.workerStatus = "assigned";
    applicant.currentProject = project._id;
    await applicant.save();

    res.json({
      ok: true,
      message: "Project assigned to worker",
      applicant,
      project,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/job/:id/set-status
 * Manually set worker status (admin override)
 */
exports.setWorkerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { applicantId, workerStatus, resetAttempts, adminNotes, payRate } =
      req.body;

    if (!mongoose.Types.ObjectId.isValid(applicantId)) {
      return res
        .status(400)
        .json({ ok: false, message: "Invalid applicant ID" });
    }

    const validStatuses = [
      "applied",
      "screening_unlocked",
      "test_submitted",
      "failed",
      "ready_to_work",
      "assigned",
      "working",
      "suspended",
    ];

    if (!validStatuses.includes(workerStatus)) {
      return res
        .status(400)
        .json({
          ok: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
    }

    const applicant = await ApplyWork.findOne({
      _id: applicantId,
      position: id,
    });

    if (!applicant) {
      return res
        .status(404)
        .json({ ok: false, message: "Applicant not found" });
    }

    applicant.workerStatus = workerStatus;

    if (resetAttempts) {
      applicant.attemptCount = 0;
    }

    if (adminNotes !== undefined) {
      applicant.adminNotes = adminNotes;
    }

    if (payRate !== undefined) {
      applicant.payRate = Number(payRate);
    }

    // If setting to ready_to_work, mark as approved
    if (workerStatus === "ready_to_work") {
      applicant.status = "approved";
      applicant.approvedBy = req.user.id;
      applicant.approvedAt = new Date();
    }

    await applicant.save();

    res.json({
      ok: true,
      message: `Worker status set to ${workerStatus}`,
      applicant,
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * GET /api/admin/workspace/jobs
 * Get all job roles with applicant counts
 */
exports.getAllJobRoles = async (req, res) => {
  try {
    const { active, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (active !== undefined) {
      filter.active = active === "true";
    }

    const total = await WorkPosition.countDocuments(filter);
    const jobs = await WorkPosition.find(filter)
      .populate("serviceId", "title category")
      .sort({ active: -1, sortOrder: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Get applicant counts for each job
    const jobIds = jobs.map((j) => j._id);
    const applicantCounts = await ApplyWork.aggregate([
      { $match: { position: { $in: jobIds } } },
      {
        $group: {
          _id: { position: "$position", workerStatus: "$workerStatus" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Map counts to jobs
    const countMap = {};
    applicantCounts.forEach((c) => {
      const posId = c._id.position.toString();
      if (!countMap[posId]) {
        countMap[posId] = { total: 0 };
      }
      countMap[posId][c._id.workerStatus] = c.count;
      countMap[posId].total += c.count;
    });

    const enrichedJobs = jobs.map((j) => ({
      ...j,
      applicantStats: countMap[j._id.toString()] || { total: 0 },
    }));

    res.json({
      ok: true,
      jobs: enrichedJobs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};
