const mongoose = require("mongoose");

const actionItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        "service.create",
        "service.update",
        "service.delete",
        "paymentMethod.create",
        "paymentMethod.update",
        "paymentMethod.delete",
        "workPosition.create",
        "workPosition.update",
        "workPosition.delete",
        "settings.update",
      ],
    },
    payload: {
      type: Object,
      required: true,
      default: {},
    },
    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: 400,
    },
  },
  { _id: false }
);

const executionErrorSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const executionResultSchema = new mongoose.Schema(
  {
    successCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
    errors: { type: [executionErrorSchema], default: [] },
  },
  { _id: false }
);

const jarvisActionProposalSchema = new mongoose.Schema(
  {
    createdAt: { type: Date, default: Date.now, index: true },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rawAdminCommand: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "executed", "failed"],
      default: "pending",
      index: true,
    },
    rejectionReason: { type: String, default: "", trim: true, maxlength: 400 },
    actions: { type: [actionItemSchema], default: [] },
    previewText: { type: String, default: "", trim: true, maxlength: 2000 },
    executionResult: { type: executionResultSchema, default: undefined },
    executedAt: { type: Date, default: null },
    ip: { type: String, default: "", trim: true, maxlength: 80 },
  },
  { minimize: false }
);

jarvisActionProposalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model(
  "JarvisActionProposal",
  jarvisActionProposalSchema
);
