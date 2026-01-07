const cloudinary = require("../config/cloudinary");
const Worker = require("../models/WorkerApplication");

exports.applyWork = async (req, res) => {
  try {
    const { name, email, country, skills } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Resume file is required" });
    }

    const stream = cloudinary.uploader.upload_stream(
      { folder: "resumes" },
      async (err, result) => {
        if (err) return res.status(500).json({ message: "Upload failed" });

        await Worker.create({
          userId: req.user.id,
          name,
          email,
          country,
          skills,
          resumeUrl: result.secure_url,
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
    const apps = await Worker.find().populate("userId", "email");
    res.json(apps);
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
