const mongoose = require("mongoose");

const jarvisChatEventSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ["public", "admin"], default: "public" },
    ok: { type: Boolean, default: true, index: true },
    usedAi: { type: Boolean, default: false },
    provider: { type: String, default: "" },
    model: { type: String, default: "" },
    page: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { minimize: false }
);

jarvisChatEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model("JarvisChatEvent", jarvisChatEventSchema);
