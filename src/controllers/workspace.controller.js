/**
 * PATCH_38/43: Workspace Controller
 * Handles worker status flow, screenings, projects, and earnings
 * PATCH_43: Multi-job support, new worker journey states
 */
const ApplyWork = require("../models/ApplyWork");
const Screening = require("../models/Screening");
const Project = require("../models/Project");
const User = require("../models/User");
const WorkPosition = require("../models/WorkPosition");

/**
 * PATCH_43: GET /api/workspace/profile
 * Get all user's job applications and their status
 * Supports multi-job with independent status per job
 */
exports.getWorkspaceProfile = async (req, res) => {
  try {
    // PATCH_43: Get ALL job applications for the user (multi-job support)
    const applications = await ApplyWork.find({ user: req.user.id })
      .populate(
        "position",
        "_id title category description trainingMaterials hasScreening screeningId",
      )
      .populate("currentProject", "title status payRate payType")
      .sort({ createdAt: -1 })
      .lean();

    if (!applications || applications.length === 0) {
      return res.json({
        hasProfile: false,
        applications: [],
        message: "No workspace profile. Apply to a position to get started.",
      });
    }

    // Enrich each application with screening/project info
    const enrichedApplications = await Promise.all(
      applications.map(async (app) => {
        // Get screening for this position if exists
        let screening = null;
        if (app.position?.screeningId) {
          screening = await Screening.findById(app.position.screeningId)
            .select(
              "title description timeLimit passingScore trainingMaterials",
            )
            .lean();
        } else if (app.position?.category) {
          // Fallback: find screening by category
          screening = await Screening.findOne({
            category: app.position.category,
            active: true,
          })
            .select(
              "title description timeLimit passingScore trainingMaterials",
            )
            .lean();
        }

        // Get assigned projects for this application
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
          .select("title payRate earningsCredited completedAt")
          .lean();

        // Normalize legacy worker status
        let normalizedStatus = app.workerStatus || "applied";
        if (normalizedStatus === "fresh") normalizedStatus = "applied";
        if (normalizedStatus === "screening_available")
          normalizedStatus = "screening_unlocked";
        if (normalizedStatus === "inactive") normalizedStatus = "suspended";

        return {
          _id: app._id,
          position: app.position,
          positionTitle: app.positionTitle || app.position?.title || "",
          category: app.category || app.position?.category || "",
          workerStatus: normalizedStatus,
          applicationStatus: app.status, // pending/approved/rejected
          attemptCount: app.attemptCount || 0,
          maxAttempts: app.maxAttempts || 2,
          totalEarnings: app.totalEarnings || 0,
          pendingEarnings: app.pendingEarnings || 0,
          payRate: app.payRate || 0,
          screening,
          trainingMaterials: app.position?.trainingMaterials || [],
          assignedProjects,
          completedProjects,
          screeningsCompleted: app.screeningsCompleted || [],
          createdAt: app.createdAt,
        };
      }),
    );

    // Calculate aggregate stats
    const totalEarnings = enrichedApplications.reduce(
      (sum, a) => sum + (a.totalEarnings || 0),
      0,
    );
    const pendingEarnings = enrichedApplications.reduce(
      (sum, a) => sum + (a.pendingEarnings || 0),
      0,
    );
    const projectsCompleted = enrichedApplications.reduce(
      (sum, a) => sum + a.completedProjects.length,
      0,
    );

    res.json({
      hasProfile: true,
      applications: enrichedApplications,
      stats: {
        totalEarnings,
        pendingEarnings,
        projectsCompleted,
        jobsApplied: enrichedApplications.length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH_43: GET /api/workspace/apply/:jobId
 * Apply to a specific job role
 */
exports.applyToJob = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { resumeUrl, message } = req.body;

    // Check if job exists
    const job = await WorkPosition.findById(jobId).lean();
    if (!job) {
      return res.status(404).json({ message: "Job role not found" });
    }

    if (!job.active) {
      return res.status(400).json({ message: "This position is not active" });
    }

    // Check if already applied
    const existing = await ApplyWork.findOne({
      user: req.user.id,
      position: jobId,
    });

    if (existing) {
      return res
        .status(400)
        .json({ message: "Already applied to this position" });
    }

    // Create application
    const application = await ApplyWork.create({
      user: req.user.id,
      position: jobId,
      positionTitle: job.title,
      category: job.category,
      resumeUrl: resumeUrl || "",
      message: message || "",
      status: "pending",
      workerStatus: "applied",
    });

    res.status(201).json({
      ok: true,
      message: "Application submitted successfully",
      application,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH_49: PUT /api/workspace/application/:appId/mark-training-viewed
 * Mark that the worker has viewed all training materials
 */
exports.markTrainingViewed = async (req, res) => {
  try {
    const { appId } = req.params;

    const application = await ApplyWork.findOne({
      _id: appId,
      user: req.user.id,
    });

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    // Only allow when status is screening_unlocked
    if (application.workerStatus !== "screening_unlocked") {
      return res.status(400).json({
        message:
          "Training can only be marked as viewed when screening is unlocked",
      });
    }

    // Update status to training_viewed
    application.workerStatus = "training_viewed";
    application.trainingViewedAt = new Date();
    await application.save();

    res.json({
      ok: true,
      message:
        "Training marked as viewed. You can now take the screening test.",
      workerStatus: application.workerStatus,
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
      .select("-questions.correctAnswer -questions.correctAnswers") // Don't expose answers
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
 * PATCH_43: POST /api/workspace/screening/:id/submit
 * Submit screening answers with retry logic
 */
exports.submitScreening = async (req, res) => {
  try {
    const { answers, positionId } = req.body;
    const screening = await Screening.findById(req.params.id).lean();

    if (!screening) {
      return res.status(404).json({ message: "Screening not found" });
    }

    // PATCH_43: Find the correct worker profile (for multi-job support)
    let profile;
    if (positionId) {
      profile = await ApplyWork.findOne({
        user: req.user.id,
        position: positionId,
      });
    } else {
      // Fallback to first profile for backwards compat
      profile = await ApplyWork.findOne({ user: req.user.id });
    }

    if (!profile) {
      return res.status(400).json({ message: "No worker profile found" });
    }

    // PATCH_43 + PATCH_49: Check if worker is allowed to take screening
    // Allow both "screening_unlocked" (legacy) and "training_viewed" (PATCH_49 flow)
    const allowedStatuses = ["screening_unlocked", "training_viewed"];
    if (!allowedStatuses.includes(profile.workerStatus)) {
      return res.status(400).json({
        message: `Cannot take screening. Current status: ${profile.workerStatus}. Required: screening_unlocked or training_viewed.`,
      });
    }

    // Calculate score
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

    screening.questions.forEach((q, idx) => {
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
        // Text/file answers need manual review - give partial credit
        earnedPoints += (q.points || 1) * 0.5;
      }
    });

    const score =
      totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= (screening.passingScore || 70);

    // PATCH_43: Update attempt count
    profile.attemptCount = (profile.attemptCount || 0) + 1;
    const maxAttempts = profile.maxAttempts || 2;

    // Add to completed screenings
    profile.screeningsCompleted = profile.screeningsCompleted || [];
    profile.screeningsCompleted.push({
      screeningId: screening._id,
      completedAt: new Date(),
      score,
      passed,
    });

    // PATCH_43: Worker status flow based on pass/fail
    if (passed) {
      // Passed - move to ready_to_work
      profile.workerStatus = "ready_to_work";
    } else {
      // Failed
      if (profile.attemptCount < maxAttempts) {
        // Can retry - keep as screening_unlocked
        profile.workerStatus = "screening_unlocked";
      } else {
        // Used all attempts - set to failed
        profile.workerStatus = "failed";
      }
    }

    await profile.save();

    // Build response message
    let message;
    if (passed) {
      message = "Congratulations! You passed and are now ready to work.";
    } else if (profile.attemptCount < maxAttempts) {
      message = `You scored ${score}%. You have ${maxAttempts - profile.attemptCount} attempt(s) remaining. Review the training materials and try again.`;
    } else {
      message = `You scored ${score}%. You've used all ${maxAttempts} attempts. Contact admin for re-evaluation.`;
    }

    res.json({
      success: true,
      score,
      passed,
      attemptsUsed: profile.attemptCount,
      attemptsRemaining: Math.max(0, maxAttempts - profile.attemptCount),
      newStatus: profile.workerStatus,
      message,
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
 * PATCH_47: POST /api/workspace/project/:id/start
 * Mark project as in progress
 */
exports.startProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      assignedTo: req.user.id,
    });

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.status !== "assigned") {
      return res
        .status(400)
        .json({ message: "Project already started or completed" });
    }

    project.status = "in_progress";
    await project.save();

    // Update worker status to working
    await ApplyWork.updateOne(
      { user: req.user.id, currentProject: project._id },
      { workerStatus: "working" },
    );

    res.json({
      success: true,
      message: "Project started! You're now working on it.",
      project,
    });
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
 * PATCH_49: Enhanced with additional counts for dashboard
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

    // PATCH_49: Get additional counts for dashboard
    const pendingCount = await ApplyWork.countDocuments({ status: "pending" });
    const waitingScreeningCount = await ApplyWork.countDocuments({
      workerStatus: "screening_unlocked",
    });
    const readyToWorkCount = await ApplyWork.countDocuments({
      workerStatus: "ready_to_work",
    });
    const activeCount = await ApplyWork.countDocuments({
      workerStatus: { $in: ["assigned", "working"] },
    });

    res.json({
      workers,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      // PATCH_49: Additional counts
      pendingCount,
      waitingScreeningCount,
      readyToWorkCount,
      activeCount,
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

const normalizeScreeningQuestions = (questions = []) => {
  if (!Array.isArray(questions)) return [];
  return questions.map((q) => {
    const options = Array.isArray(q.options) ? q.options : [];
    let correctAnswers = [];

    if (Array.isArray(q.correctAnswers)) {
      correctAnswers = q.correctAnswers.map(String).filter(Boolean);
    } else if (q.correctAnswer !== undefined && q.correctAnswer !== null) {
      if (typeof q.correctAnswer === "number") {
        const opt = options[q.correctAnswer];
        if (opt) correctAnswers = [String(opt)];
      } else {
        correctAnswers = [String(q.correctAnswer)];
      }
    }

    return {
      question: q.question,
      type: q.type || "single",
      options,
      correctAnswer: q.correctAnswer,
      correctAnswers,
      points: q.points || 1,
    };
  });
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
      questions: normalizeScreeningQuestions(questions),
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
 * GET /api/admin/workspace/screenings/:id
 * Get a single screening
 */
exports.adminGetScreeningById = async (req, res) => {
  try {
    const screening = await Screening.findById(req.params.id).lean();
    if (!screening) {
      return res.status(404).json({ message: "Screening not found" });
    }
    res.json({ screening });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/screenings/:id
 * Update a screening
 */
exports.adminUpdateScreening = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      trainingMaterials,
      questions,
      passingScore,
      timeLimit,
      active,
    } = req.body;

    const screening = await Screening.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        category,
        trainingMaterials,
        questions: normalizeScreeningQuestions(questions),
        passingScore,
        timeLimit,
        active,
      },
      { new: true },
    );

    if (!screening) {
      return res.status(404).json({ message: "Screening not found" });
    }

    res.json({ success: true, screening });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * POST /api/admin/workspace/screenings/:id/clone
 * Duplicate a screening
 */
exports.adminCloneScreening = async (req, res) => {
  try {
    const screening = await Screening.findById(req.params.id).lean();
    if (!screening) {
      return res.status(404).json({ message: "Screening not found" });
    }

    const cloned = await Screening.create({
      title: `Copy of ${screening.title}`,
      description: screening.description,
      category: screening.category,
      trainingMaterials: screening.trainingMaterials || [],
      questions: normalizeScreeningQuestions(screening.questions || []),
      passingScore: screening.passingScore,
      timeLimit: screening.timeLimit,
      active: screening.active,
      createdBy: req.user.id,
    });

    res.status(201).json({ success: true, screening: cloned });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * DELETE /api/admin/workspace/screenings/:id
 * Delete a screening
 */
exports.adminDeleteScreening = async (req, res) => {
  try {
    const deleted = await Screening.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Screening not found" });
    }
    res.json({ success: true });
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

    // Auto-credit wallet balance
    const user = await User.findById(project.assignedTo);
    if (user) {
      user.walletBalance = (user.walletBalance || 0) + amount;
      await user.save();
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

/**
 * PATCH_61B: POST /api/admin/workspace/workers/:id/assign-task
 * Assign a specialized task to a worker
 */
exports.adminAssignTask = async (req, res) => {
  try {
    const { taskDescription, jobId } = req.body;
    const workerId = req.params.id;

    if (!taskDescription || !taskDescription.trim()) {
      return res.status(400).json({ message: "Task description required" });
    }

    // Find the worker's profile (ApplyWork)
    const workerProfile = await ApplyWork.findById(workerId).populate("user position");
    if (!workerProfile) {
      return res.status(404).json({ message: "Worker profile not found" });
    }

    // Create task record (save in a new Task model or add to profile)
    // For now, we'll add to workerProfile and send notification email
    if (!workerProfile.assignedTasks) {
      workerProfile.assignedTasks = [];
    }

    const taskId = require("mongoose").Types.ObjectId();
    workerProfile.assignedTasks.push({
      _id: taskId,
      description: taskDescription,
      assignedAt: new Date(),
      status: "pending", // pending, in-progress, completed
      assignedBy: req.user.id,
    });

    await workerProfile.save();

    // Send notification email to worker
    const user = workerProfile.user;
    if (user && user.email) {
      // TODO: Send email with task details
      // await sendEmail(user.email, "New Task Assigned", `You have been assigned: ${taskDescription}`);
    }

    res.json({
      success: true,
      message: "Task assigned successfully",
      taskId,
      worker: {
        name: `${user?.firstName || ""} ${user?.lastName || ""}`.trim(),
        email: user?.email,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
