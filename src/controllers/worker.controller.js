const cloudinary = require("../config/cloudinary");
const Worker = require("../models/WorkerApplication");
const {
  inferResourceType,
  normalizeCloudinaryUrl,
} = require("../utils/cloudinaryUrl");

exports.applyWork = async (req, res) => {
  try {
    const { name, email, country, skills } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Resume file is required" });
    }

    const resourceType = inferResourceType({ mimeType: req.file.mimetype });
    const stream = cloudinary.uploader.upload_stream(
      { folder: "uremo/resumes", resource_type: resourceType },
      async (err, result) => {
        if (err) return res.status(500).json({ message: "Upload failed" });

        await Worker.create({
          userId: req.user.id,
          name,
          email,
          country,
          skills,
          resumeUrl: result.secure_url,
          resumePublicId: result.public_id,
          resumeResourceType: result.resource_type,
          resumeFormat: result.format,
          resumeMimeType: req.file.mimetype,
        });

        res.json({ message: "Application submitted" });
      }
    );

    stream.end(req.file.buffer);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

exports.listApplications = async (req, res) => {
  try {
    const apps = await Worker.find().populate("userId", "email").lean();
    const normalized = apps.map((app) => ({
      ...app,
      resumeUrl: normalizeCloudinaryUrl(app.resumeUrl, {
        mimeType: app.resumeMimeType,
        resourceType: app.resumeResourceType,
      }),
    }));
    res.json(normalized);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateApplication = async (req, res) => {
  try {
    await Worker.findByIdAndUpdate(req.params.id, { status: req.body.status });
    res.json({ message: "Status updated" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};
