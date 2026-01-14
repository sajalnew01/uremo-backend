const mongoose = require("mongoose");

const simpleText = {
  type: String,
  trim: true,
  default: "",
};

const faqItemSchema = new mongoose.Schema(
  {
    q: simpleText,
    a: simpleText,
  },
  { _id: false }
);

const titleDescSchema = new mongoose.Schema(
  {
    title: simpleText,
    desc: simpleText,
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

    // =========================
    // CMS_FULL_STACK_PACK_02 (SiteSettings v2)
    // =========================
    site: {
      brandName: simpleText,
      bannerText: simpleText,
    },

    support: {
      whatsappNumber: simpleText,
      supportEmail: simpleText,
    },

    footer: {
      disclaimer: simpleText,
      dataSafetyNote: simpleText,
    },

    landing: {
      heroTitle: simpleText,
      heroSubtitle: simpleText,
      ctaPrimaryText: simpleText,
      ctaSecondaryText: simpleText,
      features: { type: [titleDescSchema], default: [] },
      popularTitle: simpleText,
      popularSubtitle: simpleText,
      finalCtaTitle: simpleText,
      finalCtaSubtitle: simpleText,
    },

    payment: {
      beginnerSteps: { type: [titleDescSchema], default: [] },
      acceptedProofText: simpleText,
      successRedirectText: simpleText,
      faq: { type: [faqItemSchema], default: [] },
    },

    services: {
      globalFaq: { type: [faqItemSchema], default: [] },
      trustBlockText: simpleText,
    },

    orderSupport: {
      quickReplies: { type: [String], default: [] },
      supportGuidelines: simpleText,
    },

    applyWork: {
      faq: { type: [faqItemSchema], default: [] },
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedAt: { type: Date },
  },
  { minimize: false }
);

module.exports = mongoose.model("SiteSettings", siteSettingsSchema);
