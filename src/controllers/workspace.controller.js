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
        "_id title category description trainingMaterials hasScreening screeningId screeningIds",
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
        // PATCH_89: Support multiple screenings via screeningIds
        let screening = null;
        let requiredScreenings = [];

        if (
          app.position?.screeningIds &&
          app.position.screeningIds.length > 0
        ) {
          // Multi-screening: load all required screenings
          requiredScreenings = await Screening.find({
            _id: { $in: app.position.screeningIds },
          })
            .select(
              "title description timeLimit passingScore trainingMaterials",
            )
            .lean();
          // Keep backward compat — first screening as primary
          screening = requiredScreenings[0] || null;
        } else if (app.position?.screeningId) {
          screening = await Screening.findById(app.position.screeningId)
            .select(
              "title description timeLimit passingScore trainingMaterials",
            )
            .lean();
          if (screening) requiredScreenings = [screening];
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
          if (screening) requiredScreenings = [screening];
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
          requiredScreenings,
          trainingMaterials: app.position?.trainingMaterials || [],
          assignedProjects,
          completedProjects,
          screeningsCompleted: app.screeningsCompleted || [],
          createdAt: app.createdAt,
        };
      }),
    );

    // Calculate aggregate stats
    const workEarnings = enrichedApplications.reduce(
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

    // PATCH_76: Include affiliate earnings from User model
    const userDoc = await User.findById(req.user.id).select(
      "totalAffiliateEarned affiliateBalance",
    );
    const affiliateEarnings = userDoc?.totalAffiliateEarned || 0;
    const totalEarnings = workEarnings + affiliateEarnings;

    res.json({
      hasProfile: true,
      applications: enrichedApplications,
      stats: {
        totalEarnings,
        workEarnings,
        affiliateEarnings,
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

    // PATCH_43 + PATCH_57: Find the correct worker profile (for multi-job support)
    // The positionId from frontend is actually the ApplyWork._id (the application ID)
    let profile;
    if (positionId) {
      // First try to find by ApplyWork._id (the application record itself)
      profile = await ApplyWork.findOne({
        _id: positionId,
        user: req.user.id,
      });

      // Fallback: try to find by position field (WorkPosition ID) for backwards compat
      if (!profile) {
        profile = await ApplyWork.findOne({
          user: req.user.id,
          position: positionId,
        });
      }
    } else {
      // Fallback to first profile for backwards compat
      profile = await ApplyWork.findOne({ user: req.user.id });
    }

    if (!profile) {
      return res.status(400).json({
        message:
          "No worker profile found. Please apply to a work position first.",
        debug: { positionId, userId: req.user.id },
      });
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
      // PATCH_89: Check if ALL required screenings are completed before marking ready_to_work
      const jobRole = await WorkPosition.findById(profile.position)
        .select("screeningIds screeningId hasScreening")
        .lean();

      const requiredIds = (jobRole?.screeningIds || []).map((id) =>
        id.toString(),
      );

      if (requiredIds.length > 1) {
        // Multiple screenings required — check all passed
        const passedIds = (profile.screeningsCompleted || [])
          .filter((sc) => sc.passed !== false)
          .map((sc) => sc.screeningId?.toString());

        const allPassed = requiredIds.every((rid) => passedIds.includes(rid));
        if (allPassed) {
          profile.workerStatus = "ready_to_work";
        } else {
          // More screenings remain — keep at screening_unlocked so user can take next
          profile.workerStatus = "screening_unlocked";
        }
      } else {
        // Single or no screening required — original behavior
        profile.workerStatus = "ready_to_work";
      }
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
      .populate("user", "name email firstName lastName")
      .populate("position", "title category")
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

    // PATCH_90: Transform workers to include proper userId structure with firstName/lastName
    const transformedWorkers = workers.map((w) => {
      // Handle user name - multiple strategies for robustness
      let firstName = "";
      let lastName = "";
      let email = w.user?.email || "";
      let fullName = "";

      if (w.user) {
        // Strategy 1: Use existing firstName/lastName if available
        if (w.user.firstName || w.user.lastName) {
          firstName = w.user.firstName || "";
          lastName = w.user.lastName || "";
          fullName = `${firstName} ${lastName}`.trim();
        }
        // Strategy 2: Split name field if available
        else if (w.user.name && w.user.name.trim()) {
          const nameParts = w.user.name.trim().split(" ");
          firstName = nameParts[0] || "";
          lastName = nameParts.slice(1).join(" ") || "";
          fullName = w.user.name.trim();
        }
        // Strategy 3: Use email username as firstName
        else if (email) {
          firstName = email.split("@")[0];
          fullName = firstName;
        }
      }

      return {
        ...w,
        userId: w.user
          ? {
              _id: w.user._id,
              firstName: firstName,
              lastName: lastName,
              email: email,
              name: fullName || firstName || email || "Unknown", // Include consolidated name
            }
          : {
              _id: null,
              firstName: "Unknown",
              lastName: "Worker",
              email: "No email",
              name: "Unknown Worker",
            },
        jobId: w.position
          ? {
              _id: w.position._id,
              title: w.position.title,
              category: w.position.category,
            }
          : null,
        positionTitle: w.position?.title || w.positionTitle || "No Position",
      };
    });

    res.json({
      workers: transformedWorkers,
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
 * PATCH_62: GET /api/admin/workspace/workers/qualified-count
 * Get count of qualified workers (ready_to_work) per category
 * Used by Master Workspace to determine if projects can be created
 */
exports.adminGetQualifiedWorkerCounts = async (req, res) => {
  try {
    // Aggregate workers with ready_to_work status grouped by category
    const pipeline = [
      {
        $match: {
          workerStatus: "ready_to_work",
          category: { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ];

    const results = await ApplyWork.aggregate(pipeline);

    // Convert to object { category: count }
    const qualifiedCounts = {};
    results.forEach((r) => {
      qualifiedCounts[r._id] = r.count;
    });

    // Include all defined categories with 0 defaults
    const categories = [
      "microjobs",
      "writing",
      "teaching",
      "coding_math",
      "outlier",
      "other",
    ];
    categories.forEach((cat) => {
      if (!(cat in qualifiedCounts)) {
        qualifiedCounts[cat] = 0;
      }
    });

    res.json({
      qualifiedCounts,
      total: results.reduce((sum, r) => sum + r.count, 0),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH_61: GET /api/admin/workspace/worker/:id
 * Get single worker with full details for Worker 360 page
 */
exports.adminGetWorkerById = async (req, res) => {
  try {
    const { id } = req.params;

    const worker = await ApplyWork.findById(id)
      .populate("user", "firstName lastName name email phone avatar createdAt")
      .populate("position", "title category description payRate")
      .lean();

    if (!worker) {
      return res.status(404).json({ message: "Worker not found" });
    }

    // Get all projects assigned to this worker
    const projects = await Project.find({ assignedTo: worker.user?._id })
      .sort({ createdAt: -1 })
      .lean();

    // Get all applications for this user
    const applications = await ApplyWork.find({ user: worker.user?._id })
      .populate("position", "title category")
      .sort({ createdAt: -1 })
      .lean();

    // Build activity log
    const activityLog = [];

    // Application events
    applications.forEach((app) => {
      activityLog.push({
        type: "application_created",
        description: `Applied for ${app.position?.title || app.positionTitle || "Unknown Position"}`,
        timestamp: app.createdAt,
      });

      if (app.trainingViewedAt) {
        activityLog.push({
          type: "training_viewed",
          description: "Viewed training materials",
          timestamp: app.trainingViewedAt,
        });
      }

      if (app.screeningsCompleted && app.screeningsCompleted.length > 0) {
        app.screeningsCompleted.forEach((s) => {
          activityLog.push({
            type: "screening_completed",
            description: `Completed screening with score ${s.score}%`,
            timestamp: s.completedAt,
          });
        });
      }

      if (app.testsCompleted && app.testsCompleted.length > 0) {
        app.testsCompleted.forEach((t) => {
          activityLog.push({
            type: t.passed ? "test_passed" : "test_failed",
            description: `${t.passed ? "Passed" : "Failed"} test with score ${t.score}%`,
            timestamp: t.completedAt,
          });
        });
      }
    });

    // Project events
    projects.forEach((p) => {
      if (p.assignedAt) {
        activityLog.push({
          type: "project_assigned",
          description: `Assigned to project: ${p.title}`,
          timestamp: p.assignedAt,
        });
      }
      if (p.completedAt) {
        activityLog.push({
          type: "project_completed",
          description: `Completed project: ${p.title}`,
          timestamp: p.completedAt,
        });
      }
    });

    // Sort activity log by timestamp
    activityLog.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      worker: {
        ...worker,
        projects,
        allApplications: applications,
        activityLog,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PUT /api/admin/workspace/worker/:id/status
 * Update worker status
 * PATCH_87: State machine validation - only allow valid transitions
 */
exports.adminUpdateWorkerStatus = async (req, res) => {
  try {
    const { workerStatus, payRate, adminNotes, forceOverride } = req.body;

    // PATCH_87: Define valid state transitions
    const ALLOWED_TRANSITIONS = {
      applied: ["screening_unlocked", "suspended"],
      screening_unlocked: [
        "training_viewed",
        "test_submitted",
        "ready_to_work",
        "suspended",
      ],
      training_viewed: ["test_submitted", "ready_to_work", "suspended"],
      test_submitted: [
        "ready_to_work",
        "screening_unlocked",
        "failed",
        "suspended",
      ],
      failed: ["screening_unlocked", "suspended"], // retry allowed
      ready_to_work: ["assigned", "suspended"],
      assigned: ["working", "ready_to_work", "suspended"],
      working: ["ready_to_work", "suspended"],
      suspended: ["ready_to_work", "screening_unlocked", "applied"],
    };

    // First, get the current worker state
    const worker = await ApplyWork.findById(req.params.id);
    if (!worker) {
      return res.status(404).json({ message: "Worker not found" });
    }

    // PATCH_87: Validate state transition (unless forceOverride is set)
    if (workerStatus && workerStatus !== worker.workerStatus) {
      const currentStatus = worker.workerStatus || "applied";
      const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];

      if (!allowedNext.includes(workerStatus) && !forceOverride) {
        return res.status(400).json({
          message: `Invalid transition: ${currentStatus} → ${workerStatus}. Allowed: ${allowedNext.join(", ")}`,
          currentStatus,
          requestedStatus: workerStatus,
          allowedTransitions: allowedNext,
          hint: "Use forceOverride=true to bypass (admin only)",
        });
      }

      // Log if using force override
      if (forceOverride && !allowedNext.includes(workerStatus)) {
        console.log(
          `[PATCH_87] ADMIN OVERRIDE: ${currentStatus} → ${workerStatus} by admin ${req.user.id}`,
        );
      }
    }

    const update = {};
    if (workerStatus) update.workerStatus = workerStatus;
    if (payRate !== undefined) update.payRate = payRate;
    if (adminNotes !== undefined) update.adminNotes = adminNotes;

    if (workerStatus === "ready_to_work") {
      update.approvedBy = req.user.id;
      update.approvedAt = new Date();
    }

    const updatedWorker = await ApplyWork.findByIdAndUpdate(
      req.params.id,
      update,
      {
        new: true,
      },
    ).populate("user", "name email");

    res.json({ success: true, worker: updatedWorker });
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
 * PATCH-64: Enhanced with validation guardrails
 */
exports.adminCreateScreening = async (req, res) => {
  try {
    const { logAdminAction } = require("../services/adminAudit.service");

    const {
      title,
      description,
      category,
      trainingMaterials,
      questions,
      passingScore,
      timeLimit,
    } = req.body;

    // PATCH-64 GUARDRAIL: Title required
    if (!title || title.trim().length < 3) {
      return res.status(400).json({
        message: "Screening title is required (minimum 3 characters)",
      });
    }

    // PATCH-64 GUARDRAIL: Category required
    if (!category) {
      return res.status(400).json({
        message: "Category is required for screening",
      });
    }

    // PATCH-64 GUARDRAIL: Questions required - cannot save empty screening
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        message: "Screening must have at least 1 question",
        hint: "Add questions before saving the screening",
      });
    }

    // PATCH-64 GUARDRAIL: Validate each question has required fields
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question || q.question.trim().length < 5) {
        return res.status(400).json({
          message: `Question ${i + 1} text is missing or too short`,
        });
      }
      if (q.type !== "text" && q.type !== "file_upload") {
        if (!q.options || q.options.length < 2) {
          return res.status(400).json({
            message: `Question ${i + 1} must have at least 2 options`,
          });
        }
      }
    }

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

    // PATCH-64: Log admin action
    await logAdminAction({
      adminId: req.user?._id || req.user?.id,
      adminEmail: req.user?.email,
      action: "screening_create",
      entityType: "screening",
      entityId: String(screening._id),
      previousState: null,
      newState: { title, category, questionCount: questions.length },
      reason: `Created screening: ${title}`,
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
 * PATCH_86: Projects MUST be linked to a Job Role
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
      screeningId,
      screeningIds, // PATCH_88: Multiple screenings
      earnings,
      priority,
      workPositionId, // PATCH_86: Job Role ID
    } = req.body;

    // PATCH_86: Validate job role if provided
    let jobRole = null;
    if (workPositionId) {
      const WorkPosition = require("../models/WorkPosition");
      jobRole = await WorkPosition.findById(workPositionId);
      if (!jobRole) {
        return res.status(400).json({
          message: "Invalid Job Role ID",
          hint: "Select a valid job role for this project",
        });
      }
    }

    const project = await Project.create({
      title,
      description,
      category: jobRole?.category || category, // Use job role's category if available
      instructions,
      deliverables,
      payRate: payRate || earnings || 0,
      payType,
      estimatedTasks,
      deadline,
      status: "open",
      createdBy: req.user.id,
      screeningId: jobRole?.screeningId || screeningId || undefined, // Inherit from job role
      screeningIds: screeningIds || [], // PATCH_88: Multiple screenings
      workPositionId: workPositionId || undefined, // PATCH_86
      priority: priority || "medium",
    });

    // PATCH_58: Notify ready workers about new project
    try {
      const {
        notifyReadyWorkers,
      } = require("../services/smartEngagement.service");
      await notifyReadyWorkers(title, category, project._id.toString());
    } catch (engErr) {
      console.warn(
        "[WORKSPACE] Engagement notification failed:",
        engErr.message,
      );
    }

    res.status(201).json({ success: true, project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/admin/workspace/projects
 * Get all projects
 * PATCH_86: Include job role info
 */
exports.adminGetProjects = async (req, res) => {
  try {
    const { status, category, workPositionId } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (workPositionId) filter.workPositionId = workPositionId; // PATCH_86

    const projects = await Project.find(filter)
      .populate("assignedTo", "name email firstName lastName")
      .populate("workPositionId", "title category hasScreening") // PATCH_86
      .populate("screeningId", "title passingScore")
      .populate("screeningIds", "title passingScore") // PATCH_88
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
 * PATCH-64: Enhanced with category matching and guardrails
 * PATCH_86: Enforce job role eligibility - worker must have passed screening
 */
exports.adminAssignProject = async (req, res) => {
  try {
    const { logAdminAction } = require("../services/adminAudit.service");
    const { workerId } = req.body;

    // Get project first to check category and job role
    const project = await Project.findById(req.params.id).populate(
      "workPositionId",
      "screeningId hasScreening title",
    );
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // PATCH-64 GUARDRAIL: Check if project is already assigned
    if (project.status === "assigned" && project.assignedTo) {
      return res.status(400).json({
        message: "Project is already assigned to another worker",
        currentAssignee: project.assignedTo,
        hint: "Unassign the current worker first",
      });
    }

    // Verify worker exists and is ready
    const worker = await ApplyWork.findById(workerId).populate(
      "position",
      "category screeningId hasScreening _id title",
    );
    if (!worker) {
      return res.status(404).json({ message: "Worker not found" });
    }

    // PATCH-64 GUARDRAIL: Worker must be ready_to_work
    if (
      worker.workerStatus !== "ready_to_work" &&
      worker.workerStatus !== "assigned"
    ) {
      return res.status(400).json({
        message: "Worker is not ready to work",
        currentStatus: worker.workerStatus,
        hint: "Worker must complete screening and be marked as ready_to_work",
      });
    }

    // PATCH_86: Enforce job role eligibility
    if (project.workPositionId) {
      const projectJobRoleId =
        project.workPositionId._id?.toString() ||
        project.workPositionId.toString();
      const workerJobRoleId = worker.position?._id?.toString();

      // Check worker is in the same job role
      if (!workerJobRoleId || workerJobRoleId !== projectJobRoleId) {
        return res.status(400).json({
          message: "Worker is not eligible for this project",
          reason: "Worker's job role does not match project's job role",
          projectJobRole: project.workPositionId.title || projectJobRoleId,
          workerJobRole: worker.position?.title || "None",
          hint: "Only workers who applied for the same job role can be assigned",
        });
      }

      // Check if job role requires screening and worker has passed it
      const jobRole = project.workPositionId;
      if (jobRole.hasScreening && jobRole.screeningId) {
        const hasPassedScreening = worker.screeningsCompleted?.some(
          (sc) => sc.screeningId?.toString() === jobRole.screeningId.toString(),
        );

        // Also check testsCompleted for legacy compatibility
        const hasPassedTest = worker.testsCompleted?.some(
          (tc) => tc.passed === true,
        );

        // If worker is ready_to_work, they must have passed (trust the status)
        // Otherwise, require explicit proof
        if (
          !hasPassedScreening &&
          !hasPassedTest &&
          worker.workerStatus !== "ready_to_work"
        ) {
          return res.status(400).json({
            message: "Worker has not passed required screening",
            reason:
              "This project requires workers who passed the job role's screening test",
            hint: "Worker must complete and pass the screening test first",
          });
        }
      }

      // PATCH_89: Check project-level screeningIds
      if (project.screeningIds && project.screeningIds.length > 0) {
        const requiredProjectScreenings = project.screeningIds.map((sid) =>
          sid.toString(),
        );
        const passedScreenings = (worker.screeningsCompleted || [])
          .filter((sc) => sc.passed !== false)
          .map((sc) => sc.screeningId?.toString());

        const missingScreenings = requiredProjectScreenings.filter(
          (rid) => !passedScreenings.includes(rid),
        );

        if (
          missingScreenings.length > 0 &&
          worker.workerStatus !== "ready_to_work"
        ) {
          return res.status(400).json({
            message: "Worker has not passed all project-required screenings",
            reason: `Missing ${missingScreenings.length} screening(s)`,
            hint: "Worker must pass all screening tests linked to this project",
          });
        }
      }
    }

    // PATCH-64 GUARDRAIL: Category matching (warning, not blocking)
    const workerCategory = worker.category || worker.position?.category;
    if (
      workerCategory &&
      project.category &&
      workerCategory !== project.category
    ) {
      console.warn(
        `[AUDIT] Category mismatch: Worker (${workerCategory}) assigned to project (${project.category}) by ${req.user?.email}`,
      );
    }

    const previousStatus = project.status;

    project.assignedTo = worker.user;
    project.assignedAt = new Date();
    project.status = "assigned";
    await project.save();

    // Update worker status
    worker.workerStatus = "assigned";
    worker.currentProject = project._id;
    await worker.save();

    // PATCH-64: Log admin action
    await logAdminAction({
      adminId: req.user?._id || req.user?.id,
      adminEmail: req.user?.email,
      action: "project_assign",
      entityType: "project",
      entityId: String(project._id),
      previousState: { status: previousStatus, assignedTo: null },
      newState: { status: "assigned", assignedTo: String(worker.user) },
      reason: `Assigned to worker ${workerId}`,
      metadata: {
        workerId: String(workerId),
        projectCategory: project.category,
        workerCategory,
      },
    });

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
    const workerProfile =
      await ApplyWork.findById(workerId).populate("user position");
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
};

/**
 * PATCH_65.1: GET /api/admin/workspace/project/:id
 * Get single project by ID with full details
 */
exports.adminGetProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("assignedTo", "name email workerStatus")
      .populate("createdBy", "firstName lastName email")
      .populate("screeningId", "title passingScore timeLimit")
      .populate("screeningIds", "title passingScore timeLimit")
      .lean();

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Get worker profile if assigned
    let workerProfile = null;
    if (project.assignedTo) {
      workerProfile = await ApplyWork.findOne({ user: project.assignedTo._id })
        .populate("user", "firstName lastName email")
        .populate("position", "name category")
        .lean();
    }

    // Get proofs for this project
    const ProofOfWork = require("../models/ProofOfWork");
    let proofs = [];
    try {
      proofs = await ProofOfWork.find({ projectId: req.params.id })
        .populate("workerId", "firstName lastName email name")
        .sort({ createdAt: -1 })
        .lean();
    } catch (proofErr) {
      console.warn("[WORKSPACE] Failed to fetch proofs:", proofErr.message);
    }

    res.json({
      success: true,
      project,
      workerProfile,
      proofs,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH_65.1: PUT /api/admin/workspace/project/:id
 * Update project details
 */
exports.adminUpdateProject = async (req, res) => {
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
      status,
      screeningId,
      screeningIds, // PATCH_88: Multiple screenings
    } = req.body;

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Update allowed fields
    if (title) project.title = title;
    if (description) project.description = description;
    if (category) project.category = category;
    if (instructions) project.instructions = instructions;
    if (deliverables) project.deliverables = deliverables;
    if (payRate !== undefined) project.payRate = payRate;
    if (payType) project.payType = payType;
    if (estimatedTasks !== undefined) project.estimatedTasks = estimatedTasks;
    if (deadline) project.deadline = deadline;
    if (status) project.status = status;
    if (screeningId !== undefined) project.screeningId = screeningId;
    if (screeningIds !== undefined) project.screeningIds = screeningIds; // PATCH_88

    project.updatedAt = new Date();
    await project.save();

    // Log admin action
    try {
      const { logAdminAction } = require("../services/adminAudit.service");
      await logAdminAction(
        req.user.id,
        "PROJECT_UPDATED",
        `Updated project: ${project.title}`,
        { projectId: project._id, changes: req.body },
      );
    } catch (logErr) {
      console.warn("[WORKSPACE] Audit log failed:", logErr.message);
    }

    res.json({
      success: true,
      message: "Project updated successfully",
      project,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH_65.1: DELETE /api/admin/workspace/project/:id
 * Delete a project (only if not assigned)
 */
exports.adminDeleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // GUARDRAIL: Cannot delete assigned or completed projects
    if (project.status === "assigned" || project.status === "in_progress") {
      return res.status(400).json({
        message: "Cannot delete an active project",
        hint: "Unassign the worker first or mark as cancelled",
      });
    }

    if (project.status === "completed") {
      return res.status(400).json({
        message: "Cannot delete a completed project",
        hint: "Completed projects are kept for records",
      });
    }

    await Project.findByIdAndDelete(req.params.id);

    // Log admin action
    try {
      const { logAdminAction } = require("../services/adminAudit.service");
      await logAdminAction(
        req.user.id,
        "PROJECT_DELETED",
        `Deleted project: ${project.title}`,
        { projectId: project._id },
      );
    } catch (logErr) {
      console.warn("[WORKSPACE] Audit log failed:", logErr.message);
    }

    res.json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * PATCH_86: GET /api/admin/workspace/project/:id/eligible-workers
 * Get workers who are eligible to be assigned to this project
 * Based on job role matching and screening completion
 */
exports.adminGetEligibleWorkers = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate(
      "workPositionId",
      "screeningId hasScreening title category",
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Build worker filter
    const workerFilter = {
      workerStatus: { $in: ["ready_to_work", "assigned"] },
    };

    // If project has a job role, filter to workers with that job role
    if (project.workPositionId) {
      workerFilter.position = project.workPositionId._id;
    }

    // Get workers that match the filter
    const workers = await ApplyWork.find(workerFilter)
      .populate("user", "name email firstName lastName")
      .populate("position", "title category")
      .select(
        "user position workerStatus screeningsCompleted testsCompleted totalEarnings",
      )
      .lean();

    // Additional filter: If job role requires screening, only return workers who passed
    let eligibleWorkers = workers;

    if (
      project.workPositionId?.hasScreening &&
      project.workPositionId?.screeningId
    ) {
      const requiredScreeningId = project.workPositionId.screeningId.toString();

      eligibleWorkers = workers.filter((w) => {
        // Check if worker passed the required screening
        const hasPassedScreening = w.screeningsCompleted?.some(
          (sc) => sc.screeningId?.toString() === requiredScreeningId,
        );
        const hasPassedTest = w.testsCompleted?.some(
          (tc) => tc.passed === true,
        );

        // Workers with ready_to_work status are considered eligible
        return (
          hasPassedScreening ||
          hasPassedTest ||
          w.workerStatus === "ready_to_work"
        );
      });
    }

    // PATCH_89: Also check project-level screeningIds
    if (project.screeningIds && project.screeningIds.length > 0) {
      const requiredProjectScreenings = project.screeningIds.map((sid) =>
        sid.toString(),
      );
      eligibleWorkers = eligibleWorkers.filter((w) => {
        if (w.workerStatus === "ready_to_work") return true; // Trust status
        const passedIds = (w.screeningsCompleted || [])
          .filter((sc) => sc.passed !== false)
          .map((sc) => sc.screeningId?.toString());
        return requiredProjectScreenings.every((rid) =>
          passedIds.includes(rid),
        );
      });
    }

    res.json({
      success: true,
      project: {
        _id: project._id,
        title: project.title,
        category: project.category,
        workPositionId: project.workPositionId,
      },
      workers: eligibleWorkers.map((w) => ({
        _id: w._id,
        userId: w.user,
        position: w.position,
        workerStatus: w.workerStatus,
        totalEarnings: w.totalEarnings || 0,
      })),
      eligibilityInfo: project.workPositionId
        ? {
            jobRole: project.workPositionId.title,
            requiresScreening: project.workPositionId.hasScreening || false,
          }
        : { jobRole: null, requiresScreening: false },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getWorkspaceProfile: exports.getWorkspaceProfile,
  applyToJob: exports.applyToJob,
  markTrainingViewed: exports.markTrainingViewed,
  getAvailableScreenings: exports.getAvailableScreenings,
  getScreening: exports.getScreening,
  submitScreening: exports.submitScreening,
  getMyProjects: exports.getMyProjects,
  getProject: exports.getProject,
  startProject: exports.startProject,
  submitProject: exports.submitProject,
  getEarnings: exports.getEarnings,
  requestWithdrawal: exports.requestWithdrawal,
  adminGetWorkers: exports.adminGetWorkers,
  adminGetQualifiedWorkerCounts: exports.adminGetQualifiedWorkerCounts, // PATCH_62
  adminGetWorkerById: exports.adminGetWorkerById, // PATCH_61
  adminUpdateWorkerStatus: exports.adminUpdateWorkerStatus,
  adminCreateScreening: exports.adminCreateScreening,
  adminGetScreenings: exports.adminGetScreenings,
  adminGetScreeningById: exports.adminGetScreeningById,
  adminUpdateScreening: exports.adminUpdateScreening,
  adminCloneScreening: exports.adminCloneScreening,
  adminDeleteScreening: exports.adminDeleteScreening,
  adminCreateProject: exports.adminCreateProject,
  adminGetProjects: exports.adminGetProjects,
  adminGetProjectById: exports.adminGetProjectById, // PATCH_65.1
  adminUpdateProject: exports.adminUpdateProject, // PATCH_65.1
  adminDeleteProject: exports.adminDeleteProject, // PATCH_65.1
  adminAssignProject: exports.adminAssignProject,
  adminGetEligibleWorkers: exports.adminGetEligibleWorkers, // PATCH_86
  adminCreditEarnings: exports.adminCreditEarnings,
  adminAssignTask: exports.adminAssignTask,
};
