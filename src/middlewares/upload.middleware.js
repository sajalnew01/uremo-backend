const multer = require("multer");

// Allowed image MIME types
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Allowed document MIME types for chat attachments
const DOCUMENT_TYPES = [
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
];

// Combined allowed types for chat attachments
const CHAT_ALLOWED_TYPES = [...IMAGE_TYPES, ...DOCUMENT_TYPES];

// Standard image-only upload (existing behavior)
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_TYPES.includes(file.mimetype)) {
      return cb(new Error("Only images are allowed"), false);
    }
    cb(null, true);
  },
});

// Chat attachment upload - supports images + documents
const chatUpload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (!CHAT_ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(
        new Error(
          "Only images, PDF, ZIP, and text files are allowed (max 10MB)",
        ),
        false,
      );
    }
    cb(null, true);
  },
});

// Utility to determine file category
const getFileCategory = (mimetype) => {
  if (IMAGE_TYPES.includes(mimetype)) return "image";
  if (mimetype === "application/pdf") return "pdf";
  if (
    mimetype === "application/zip" ||
    mimetype === "application/x-zip-compressed"
  )
    return "archive";
  if (mimetype === "text/plain") return "text";
  return "unknown";
};

module.exports = upload;
module.exports.chatUpload = chatUpload;
module.exports.getFileCategory = getFileCategory;
module.exports.IMAGE_TYPES = IMAGE_TYPES;
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
module.exports.CHAT_ALLOWED_TYPES = CHAT_ALLOWED_TYPES;
