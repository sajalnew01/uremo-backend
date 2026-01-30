/**
 * PATCH_48: ProofOfWork Model
 * Tracks worker proof submissions for completed projects
 * All proof data is PRIVATE by default
 */

const mongoose = require("mongoose");

const proofOfWorkSchema = new mongoose.Schema(
  {
    // Worker who submitted the proof
    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Job role the worker is working under
    jobRoleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkPosition",
      required: true,
      index: true,
    },

    // Project this proof is for
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },

    // Text description of the work done
    submissionText: {
      type: String,
      required: true,
      maxlength: 5000,
    },

    // File attachments (screenshots, documents, etc.)
    attachments: [
      {
        url: { type: String, required: true },
        publicId: { type: String },
        filename: { type: String },
        type: { type: String }, // image, document, etc.
      },
    ],

    // Proof status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    // Admin who reviewed
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Review timestamp
    reviewedAt: {
      type: Date,
      default: null,
    },

    // Rejection reason (if rejected)
    rejectionReason: {
      type: String,
      default: null,
    },

    // Admin notes (internal)
    adminNotes: {
      type: String,
      default: null,
    },

    // PATCH_49: Privacy control - proof is private by default
    isPublic: {
      type: Boolean,
      default: false,
    },

    // PATCH_49: Verification status - admin can mark as verified for public display
    isVerified: {
      type: Boolean,
      default: false,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for unique proof per project per worker
proofOfWorkSchema.index({ workerId: 1, projectId: 1 });

module.exports = mongoose.model("ProofOfWork", proofOfWorkSchema);
