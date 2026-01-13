const mongoose = require("mongoose");

const faqItemSchema = new mongoose.Schema(
  {
    q: { type: String, trim: true, default: "" },
    a: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const siteSettingsSchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      default: "main",
      unique: true,
      index: true,
    },

    bannerText: { type: String, default: "" },

    support: {
      whatsappNumber: { type: String, default: "" },
      supportEmail: { type: String, default: "" },
    },

    footer: {
      disclaimer: { type: String, default: "" },
      dataSafetyNote: { type: String, default: "" },
    },

    faq: {
      global: { type: [faqItemSchema], default: [] },
      payment: { type: [faqItemSchema], default: [] },
      applyWork: { type: [faqItemSchema], default: [] },
      orderSupport: { type: [faqItemSchema], default: [] },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedAt: { type: Date },
  },
  { minimize: false }
);

module.exports = mongoose.model("SiteSettings", siteSettingsSchema);
