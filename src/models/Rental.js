/**
 * PATCH_22: Rental Model
 * Tracks rental/subscription services with time-based access
 */

const mongoose = require("mongoose");

const rentalSchema = new mongoose.Schema(
  {
    // User who rented the service
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Service being rented
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
      index: true,
    },

    // Associated order (for payment tracking)
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    // Rental type: days or months
    rentalType: {
      type: String,
      enum: ["days", "months"],
      required: true,
    },

    // Duration (e.g., 7 days, 30 days, 1 month)
    duration: {
      type: Number,
      required: true,
      min: 1,
    },

    // Price paid for this rental
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "USD",
    },

    // Rental period
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    endDate: {
      type: Date,
      required: true,
      index: true,
    },

    // Rental status
    status: {
      type: String,
      enum: ["pending", "active", "expired", "cancelled", "renewed"],
      default: "pending",
      index: true,
    },

    // Access credentials or details (encrypted/stored securely)
    accessDetails: {
      type: String,
      default: "",
    },

    // Admin notes
    notes: {
      type: String,
      default: "",
    },

    // Renewal tracking
    renewalCount: {
      type: Number,
      default: 0,
    },

    previousRental: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rental",
      default: null,
    },

    // Status history log
    statusLog: [
      {
        status: {
          type: String,
          enum: ["pending", "active", "expired", "cancelled", "renewed"],
        },
        at: {
          type: Date,
          default: Date.now,
        },
        by: {
          type: String,
          enum: ["system", "admin", "user"],
          default: "system",
        },
        note: String,
      },
    ],
  },
  { timestamps: true },
);

// Compound indexes for efficient queries
rentalSchema.index({ user: 1, status: 1 });
rentalSchema.index({ service: 1, status: 1 });
rentalSchema.index({ endDate: 1, status: 1 });
rentalSchema.index({ status: 1, endDate: 1 });

// Virtual for checking if rental is active
rentalSchema.virtual("isActive").get(function () {
  return this.status === "active" && new Date() < this.endDate;
});

// Virtual for days remaining
rentalSchema.virtual("daysRemaining").get(function () {
  if (this.status !== "active") return 0;
  const now = new Date();
  const end = new Date(this.endDate);
  const diff = end - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

// Pre-save hook to log status changes
rentalSchema.pre("save", async function () {
  if (this.isModified("status")) {
    this.statusLog.push({
      status: this.status,
      at: new Date(),
      by: "system",
    });
  }
});

module.exports = mongoose.model("Rental", rentalSchema);
