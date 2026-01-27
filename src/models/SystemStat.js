const mongoose = require("mongoose");

const systemStatSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now },
});

// Index for fast lookups
systemStatSchema.index({ key: 1 });

module.exports = mongoose.model("SystemStat", systemStatSchema);
