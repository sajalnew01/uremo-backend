const ApplyWork = require("../models/ApplyWork");
const cloudinary = require("../config/cloudinary");

exports.apply = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Resume required" });
    }

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "uremo/resumes" },
        (error, uploadResult) => {
          if (error) return reject(error);
          resolve(uploadResult);
        }
      );

      uploadStream.end(req.file.buffer);
    });

    const application = await ApplyWork.create({
      user: req.user.id,
      resumeUrl: result.secure_url,
      message: req.body.message,
    });

    res.status(201).json(application);
  } catch (err) {
    next(err);
  }
};

exports.getAll = async (req, res, next) => {
  try {
    const apps = await ApplyWork.find()
      .populate("user", "email name")
      .sort({ createdAt: -1 });

    res.json(apps);
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
    const app = await ApplyWork.findOne({ user: req.user.id });
    res.json(app);
  } catch (err) {
    next(err);
  }
};
