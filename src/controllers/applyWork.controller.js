const ApplyWork = require("../models/ApplyWork");
const cloudinary = require("../config/cloudinary");
const {
  inferResourceType,
  normalizeCloudinaryUrl,
} = require("../utils/cloudinaryUrl");
const mongoose = require("mongoose");
const WorkPosition = require("../models/WorkPosition");

const User = require("../models/User");
const { sendEmail, getAdminEmails } = require("../services/email.service");
const {
  applicationSubmittedEmail,
  adminNewApplicationAlert,
} = require("../emails/templates");

exports.apply = async (req, res, next) => {
  try {
    const positionIdRaw = String(req.body?.positionId || "").trim();

    let position = null;
    if (positionIdRaw) {
      if (!mongoose.Types.ObjectId.isValid(positionIdRaw)) {
        return res.status(400).json({ message: "Invalid positionId" });
      }
      position = await WorkPosition.findById(positionIdRaw).lean();
      if (!position) {
        return res.status(400).json({ message: "Position not found" });
      }
    }

    const category = position
      ? String(position.category || "").trim()
      : String(req.body?.category || "").trim();
    if (!category) {
      return res.status(400).json({ message: "Category is required" });
    }

    const resumeUrlRaw = String(req.body?.resumeUrl || "").trim();
    if (!req.file && !resumeUrlRaw) {
      return res
        .status(400)
        .json({ message: "Resume required (file upload or resumeUrl)" });
    }

    let resumeDoc = {};

    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const resourceType = inferResourceType({ mimeType: req.file.mimetype });
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            folder: "uremo/resumes",
            use_filename: true,
            unique_filename: false,
          },
          (error, uploadResult) => {
            if (error) return reject(error);
            resolve(uploadResult);
          }
        );

        uploadStream.end(req.file.buffer);
      });

      resumeDoc = {
        resumeUrl: result.secure_url,
        resumePublicId: result.public_id,
        resumeResourceType: result.resource_type,
        resumeFormat: result.format,
        resumeOriginalName: req.file.originalname,
        resumeMimeType: req.file.mimetype,
      };
    } else {
      // Accept an already-uploaded resume URL.
      try {
        // eslint-disable-next-line no-new
        new URL(resumeUrlRaw);
      } catch {
        return res.status(400).json({ message: "Invalid resumeUrl" });
      }

      resumeDoc = {
        resumeUrl: resumeUrlRaw,
        resumeOriginalName: String(req.body?.resumeOriginalName || "").trim(),
        resumeMimeType: String(req.body?.resumeMimeType || "").trim(),
      };
    }

    const application = await ApplyWork.create({
      user: req.user.id,
      position: position ? position._id : undefined,
      positionTitle: position ? String(position.title || "").trim() : "",
      category,
      ...resumeDoc,
      message: req.body.message,
    });

    // Email notifications (best-effort)
    try {
      const user = await User.findById(req.user.id).select("email name").lean();
      const userEmail = user?.email;
      const userName = user?.name;

      const label = position
        ? String(position.title || "").trim() || category
        : category;

      if (userEmail) {
        await sendEmail({
          to: userEmail,
          subject: "Application submitted — UREMO",
          html: applicationSubmittedEmail({ name: userName, category: label }),
        });
      }

      const admins = getAdminEmails();
      if (admins.length) {
        await sendEmail({
          to: admins,
          subject: "Admin alert: new application",
          html: adminNewApplicationAlert({
            userEmail: userEmail || "",
            category: label,
          }),
        });
      }
    } catch (err) {
      console.error("[email] application submitted hooks failed", {
        userId: String(req.user.id),
        message: err?.message || String(err),
      });
    }

    res.status(201).json(application);
  } catch (err) {
    next(err);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const apps = await ApplyWork.find()
      .populate("user", "email name")
      .populate("position", "_id title category active")
      .sort({ createdAt: -1 })
      .lean();

    const normalized = apps.map((app) => ({
      ...app,
      resumeUrl: normalizeCloudinaryUrl(app.resumeUrl, {
        mimeType: app.resumeMimeType,
        resourceType: app.resumeResourceType,
      }),
    }));

    res.json(normalized);
  } catch (err) {
    next(err);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    await ApplyWork.findByIdAndUpdate(req.params.id, { status });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.getMyApplication = async (req, res, next) => {
  try {
    const app = await ApplyWork.findOne({ user: req.user.id })
      .populate("position", "_id title category active")
      .lean();
    if (!app) return res.json(null);
    res.json({
      ...app,
      resumeUrl: normalizeCloudinaryUrl(app.resumeUrl, {
        mimeType: app.resumeMimeType,
        resourceType: app.resumeResourceType,
      }),
    });
  } catch (err) {
    next(err);
  }
};
