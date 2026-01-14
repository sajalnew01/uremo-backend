const mongoose = require("mongoose");

const simpleText = {
  type: String,
  trim: true,
  default: "",
};

const workPositionSchema = new mongoose.Schema(
  {
    title: {
      ...simpleText,
      required: true,
    },
    category: {
      ...simpleText,
      required: true,
      index: true,
    },
    description: {
      ...simpleText,
      default: "",
    },
    requirements: {
      ...simpleText,
      default: "",
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  { timestamps: true }
);

workPositionSchema.index({ active: 1, sortOrder: 1, createdAt: -1 });

module.exports = mongoose.model("WorkPosition", workPositionSchema);
