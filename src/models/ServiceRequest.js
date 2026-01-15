const mongoose = require("mongoose");

const serviceRequestEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    message: { type: String, default: "", trim: true },
    meta: { type: Object, default: {} },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const serviceRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    name: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },

    source: {
      type: String,
      enum: ["jarvisx", "public"],
      default: "public",
    },

    rawMessage: { type: String, default: "" },
    requestedService: { type: String, trim: true, default: "" },

    // JarvisX lead-capture state (multi-turn)
    captureStep: {
      type: String,
      enum: [
        "",
        "requestedService",
        "platform",
        "country",
        "urgency",
        "budget",
        "created",
        "cancelled",
      ],
      default: "",
      index: true,
    },
    budgetProvided: { type: Boolean, default: false },

    platform: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },

    urgency: {
      type: String,
      enum: ["asap", "this_week", "this_month", "flexible", ""],
      default: "",
    },

    budget: { type: Number },
    budgetCurrency: { type: String, trim: true, default: "USD" },

    notes: { type: String, default: "" },

    status: {
      type: String,
      enum: [
        "draft",
        "new",
        "contacted",
        "in_progress",
        "converted",
        "closed",
        "cancelled",
      ],
      default: "new",
      index: true,
    },

    adminNotes: { type: String, default: "" },

    createdFrom: {
      page: { type: String, default: "" },
      userAgent: { type: String, default: "" },
    },

    events: { type: [serviceRequestEventSchema], default: [] },
  },
  { timestamps: true }
);

serviceRequestSchema.index({ createdAt: -1 });
serviceRequestSchema.index({ requestedService: "text", rawMessage: "text" });

module.exports = mongoose.model("ServiceRequest", serviceRequestSchema);
