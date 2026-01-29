/**
 * PATCH_38: Workspace Controller
 * Handles worker status flow, screenings, projects, and earnings
 */
const ApplyWork = require("../models/ApplyWork");
const Screening = require("../models/Screening");
const Project = require("../models/Project");
const User = require("../models/User");

// Helper to get worker profile or create fresh one
const getOrCreateWorkerProfile = async (userId) => {
  let profile = await ApplyWork.findOne({ user: userId })
    .populate("position", "_id title category")
    .populate("currentProject", "title status payRate")
    .lean();

  return profile;
};

/**
 * GET /api/workspace/profile
 * Get current user's workspace profile (worker status, screenings, projects, earnings)
 */
exports.getWorkspaceProfile = async (req, res) => {
  try {
    const profile = await getOrCreateWorkerProfile(req.user.id);

    if (!profile) {
      return res.json({
        hasProfile: false,
        workerStatus: null,
        message: "No workspace profile. Apply to a position to get started.",
      });
    }

    // Get available screenings for their category
    const availableScreenings = await Screening.find({
      category: profile.category,
      active: true,
    })
      .select("title description timeLimit passingScore")
      .lean();

    // Filter out already completed screenings
    const completedScreeningIds = (profile.screeningsCompleted || []).map((s) =>
      s.screeningId?.toString(),
    );
    const pendingScreenings = availableScreenings.filter(
      (s) => !completedScreeningIds.includes(s._id.toString()),
    );

    // Get assigned projects
    const assignedProjects = await Project.find({
      assignedTo: req.user.id,
      status: { $in: ["assigned", "in_progress"] },
    })
      .select("title description payRate payType deadline status")
      .lean();

    // Get completed projects
    const completedProjects = await Project.find({
      assignedTo: req.user.id,
      status: "completed",
    })
      .select("title payRate earningsCredited completedAt adminRating")
      .lean();

    res.json({
      hasProfile: true,
      profile: {
        _id: profile._id,
        category: profile.category,
        positionTitle: profile.positionTitle,
        workerStatus: profile.workerStatus || "fresh",
        status: profile.status, // pending/approved/rejected
        totalEarnings: profile.totalEarnings || 0,
        pendingEarnings: profile.pendingEarnings || 0,
        payRate: profile.payRate || 0,
        screeningsCompleted: profile.screeningsCompleted || [],
        testsCompleted: profile.testsCompleted || [],
        createdAt: profile.createdAt,
      },
      availableScreenings: pendingScreenings,
      assignedProjects,
      completedProjects,
      stats: {
        totalEarnings: profile.totalEarnings || 0,
        pendingEarnings: profile.pendingEarnings || 0,
        projectsCompleted: completedProjects.length,
        screeningsCompleted: (profile.screeningsCompleted || []).length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/workspace/screenings
 * Get available screenings for the worker's category
 */
exports.getAvailableScreenings = async (req, res) => {
  try {
    const profile = await ApplyWork.findOne({ user: req.user.id }).lean();
    if (!profile) {
      return res.json({ screenings: [] });
    }

    const screenings = await Screening.find({
      category: profile.category,
      active: true,
    })
      .select("title description timeLimit passingScore trainingMaterials")
      .lean();

    // Mark completed ones
    const completedIds = (profile.screeningsCompleted || []).map((s) =>
      s.screeningId?.toString(),
    );
    const enriched = screenings.map((s) => ({
      ...s,
      completed: completedIds.includes(s._id.toString()),
      completedAt: profile.screeningsCompleted?.find(
        (sc) => sc.screeningId?.toString() === s._id.toString(),
      )?.completedAt,
    }));

    res.json({ screenings: enriched });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/workspace/screening/:id
 * Get a specific screening with questions (for taking)
 */
exports.getScreening = async (req, res) => {
  try {
    const screening = await Screening.findById(req.params.id)
      .select("-questions.correctAnswer") // Don't expose answers
      .lean();

    if (!screening) {
      return res.status(404).json({ message: "Screening not found" });
    }

    res.json({ screening });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/workspace/screening/:id/submit
 * Submit screening answers
 */
exports.submitScreening = async (req, res) => {
  try {
    const { answers } = req.body;
    const screening = await Screening.findById(req.params.id).lean();

    if (!screening) {
      return res.status(404).json({ message: "Screening not found" });
    }

    // Calculate score
    let totalPoints = 0;
    let earnedPoints = 0;

    screening.questions.forEach((q, idx) => {
      totalPoints += q.points || 1;
      if (q.type === "multiple_choice" && answers[idx] === q.correctAnswer) {
        earnedPoints += q.points || 1;
      } else if (q.type === "text" || q.type === "file_upload") {
        // Text/file answers need manual review - give partial credit
        earnedPoints += (q.points || 1) * 0.5;
      }
    });

    const score =
      totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= (screening.passingScore || 70);

    // Update worker profile
    const profile = await ApplyWork.findOne({ user: req.user.id });
    if (!profile) {
      return res.status(400).json({ message: "No worker profile found" });
    }

    // Add to completed screenings
    profile.screeningsCompleted = profile.screeningsCompleted || [];
    profile.screeningsCompleted.push({
      screeningId: screening._id,
      completedAt: new Date(),
      score,
    });

    // Update worker status if passed
    if (passed && profile.workerStatus === "fresh") {
      profile.workerStatus = "screening_available";
    }

    await profile.save();

    res.json({
      success: true,
      score,
      passed,
      message: passed
        ? "Screening completed successfully!"
        : "Screening completed. You may retake after reviewing the materials.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/workspace/projects
 * Get worker's assigned projects
 */
exports.getMyProjects = async (req, res) => {
  try {
    const projects = await Project.find({
      assignedTo: req.user.id,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ projects });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/workspace/project/:id
 * Get a specific project details
 */
exports.getProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      assignedTo: req.user.id,
    }).lean();

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({ project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/workspace/project/:id/submit
 * Submit project completion
 */
exports.submitProject = async (req, res) => {
  try {
    const { completionNotes } = req.body;

    const project = await Project.findOne({
      _id: req.params.id,
      assignedTo: req.user.id,
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.status === "completed") {
      return res.status(400).json({ message: "Project already completed" });
    }

    project.status = "completed";
    project.completedAt = new Date();
    project.completionNotes = completionNotes;
    await project.save();

    res.json({
      success: true,
      message:
        "Project submitted for review. Earnings will be credited after admin approval.",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/workspace/earnings
 * Get worker's earnings summary
 */
exports.getEarnings = async (req, res) => {
  try {
    const profile = await ApplyWork.findOne({ user: req.user.id }).lean();
    if (!profile) {
      return res.json({
        totalEarnings: 0,
        pendingEarnings: 0,
        withdrawable: 0,
        history: [],
      });
    }

    // Get completed projects with earnings
    const completedProjects = await Project.find({
      assignedTo: req.user.id,
      status: "completed",
      earningsCredited: { $gt: 0 },
    })
      .select("title earningsCredited creditedAt")
      .sort({ creditedAt: -1 })
      .lean();

    res.json({
      totalEarnings: profile.totalEarnings || 0,
      pendingEarnings: profile.pendingEarnings || 0,
      withdrawable: profile.totalEarnings || 0,
      payRate: profile.payRate || 0,
      history: completedProjects.map((p) => ({
        projectId: p._id,
        title: p.title,
        amount: p.earningsCredited,
        creditedAt: p.creditedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/workspace/withdraw
 * Request earnings withdrawal
 */
exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, method, details } = req.body;

    const profile = await ApplyWork.findOne({ user: req.user.id });
    if (!profile) {
      return res.status(400).json({ message: "No worker profile found" });
    }

    if (amount > (profile.totalEarnings || 0)) {
      return res.status(400).json({ message: "Insufficient earnings balance" });
    }

    // Deduct from earnings and add to user wallet for withdrawal
    profile.totalEarnings = (profile.totalEarnings || 0) - amount;
    await profile.save();

    // Add to user wallet
    const user = await User.findById(req.user.id);
    if (user) {
      user.walletBalance = (user.walletBalance || 0) + amount;
      await user.save();
    }

    res.json({
      success: true,
      message: `$${amount.toFixed(2)} transferred to your wallet. You can withdraw from the Wallet page.`,
      newEarningsBalance: profile.totalEarnings,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ============ ADMIN ENDPOINTS ============

/**
 * GET /api/admin/workspace/workers
 * Get all workers with their status
 */
exports.adminGetWorkers = async (req, res) => {
  try {
    const { status, workerStatus, category, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (workerStatus) filter.workerStatus = workerStatus;
    if (category) filter.category = category;

    const total = await ApplyWork.countDocuments(filter);
    const workers = await ApplyWork.find(filter)
      .populate("user", "name email")
      .populate("position", "title")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      workers,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/worker/:id/status
 * Update worker status
 */
exports.adminUpdateWorkerStatus = async (req, res) => {
  try {
    const { workerStatus, payRate, adminNotes } = req.body;

    const update = {};
    if (workerStatus) update.workerStatus = workerStatus;
    if (payRate !== undefined) update.payRate = payRate;
    if (adminNotes !== undefined) update.adminNotes = adminNotes;

    if (workerStatus === "ready_to_work") {
      update.approvedBy = req.user.id;
      update.approvedAt = new Date();
    }

    const worker = await ApplyWork.findByIdAndUpdate(req.params.id, update, {
      new: true,
    }).populate("user", "name email");

    if (!worker) {
      return res.status(404).json({ message: "Worker not found" });
    }

    res.json({ success: true, worker });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/admin/workspace/screenings
 * Create a new screening
 */
exports.adminCreateScreening = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      trainingMaterials,
      questions,
      passingScore,
      timeLimit,
    } = req.body;

    const screening = await Screening.create({
      title,
      description,
      category,
      trainingMaterials,
      questions,
      passingScore,
      timeLimit,
      createdBy: req.user.id,
    });

    res.status(201).json({ success: true, screening });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/workspace/screenings
 * Get all screenings
 */
exports.adminGetScreenings = async (req, res) => {
  try {
    const screenings = await Screening.find().sort({ createdAt: -1 }).lean();

    res.json({ screenings });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/admin/workspace/projects
 * Create a new project
 */
exports.adminCreateProject = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      instructions,
      deliverables,
      payRate,
      payType,
      estimatedTasks,
      deadline,
    } = req.body;

    const project = await Project.create({
      title,
      description,
      category,
      instructions,
      deliverables,
      payRate,
      payType,
      estimatedTasks,
      deadline,
      status: "open",
      createdBy: req.user.id,
    });

    res.status(201).json({ success: true, project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/workspace/projects
 * Get all projects
 */
exports.adminGetProjects = async (req, res) => {
  try {
    const { status, category } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;

    const projects = await Project.find(filter)
      .populate("assignedTo", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ projects });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/project/:id/assign
 * Assign project to a worker
 */
exports.adminAssignProject = async (req, res) => {
  try {
    const { workerId } = req.body;

    // Verify worker exists and is ready
    const worker = await ApplyWork.findById(workerId);
    if (!worker) {
      return res.status(404).json({ message: "Worker not found" });
    }
    if (
      worker.workerStatus !== "ready_to_work" &&
      worker.workerStatus !== "assigned"
    ) {
      return res.status(400).json({ message: "Worker is not ready to work" });
    }

    const project = await Project.findByIdAndUpdate(
      req.params.id,
      {
        assignedTo: worker.user,
        assignedAt: new Date(),
        status: "assigned",
      },
      { new: true },
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Update worker status
    worker.workerStatus = "assigned";
    worker.currentProject = project._id;
    await worker.save();

    res.json({ success: true, project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/project/:id/credit
 * Credit earnings for completed project
 */
exports.adminCreditEarnings = async (req, res) => {
  try {
    const { amount, rating } = req.body;

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    if (project.status !== "completed") {
      return res
        .status(400)
        .json({ message: "Project must be completed first" });
    }

    project.earningsCredited = amount;
    project.creditedAt = new Date();
    if (rating) project.adminRating = rating;
    await project.save();

    // Credit to worker's earnings
    const worker = await ApplyWork.findOne({ user: project.assignedTo });
    if (worker) {
      worker.totalEarnings = (worker.totalEarnings || 0) + amount;
      worker.projectsCompleted = worker.projectsCompleted || [];
      worker.projectsCompleted.push({
        projectId: project._id,
        completedAt: project.completedAt,
        rating,
        earnings: amount,
      });
      // Reset to ready_to_work if they were assigned
      if (worker.currentProject?.toString() === project._id.toString()) {
        worker.currentProject = null;
        worker.workerStatus = "ready_to_work";
      }
      await worker.save();
    }

    res.json({
      success: true,
      message: `$${amount.toFixed(2)} credited to worker`,
      project,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
