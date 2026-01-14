const SiteSettings = require("../models/SiteSettings");

const DEFAULTS = {
  site: {
    brandName: "UREMO",
    bannerText:
      "⚠️ All services are processed manually. Verification & approval may take time.",
  },
  support: {
    whatsappNumber: "",
    supportEmail: "support@uremo.online",
  },
  footer: {
    disclaimer:
      "UREMO is an independent service provider. We are not affiliated with, endorsed by, or sponsored by any third-party platforms.",
    dataSafetyNote:
      "Verification outcomes depend on platform rules and policies. UREMO does not store sensitive login credentials or personal data openly.",
  },
  landing: {
    heroTitle: "Verified Digital Onboarding & Marketplace",
    heroSubtitle:
      "Buy trusted onboarding, KYC, and verification assistance services. Track orders with human verification and admin support.",
    ctaPrimaryText: "Browse services",
    ctaSecondaryText: "How it works",
    features: [
      {
        title: "Manual verification",
        desc: "Real human checks — not bots — to reduce risk and delays.",
      },
      {
        title: "Order tracking",
        desc: "Pay, submit proof, and track status in your dashboard.",
      },
      {
        title: "Support chat",
        desc: "Message support directly from your order page anytime.",
      },
    ],
    popularTitle: "Popular services",
    popularSubtitle: "Start with our most-requested manual operations.",
    finalCtaTitle: "Ready to start?",
    finalCtaSubtitle:
      "Create an account, reserve a service, and complete payment to begin manual verification.",
  },
  payment: {
    beginnerSteps: [
      {
        title: "Reserve your service",
        desc: "Choose a service and place an order.",
      },
      {
        title: "Pay securely",
        desc: "Submit your payment reference and proof.",
      },
      { title: "Get verified", desc: "We verify manually and start delivery." },
    ],
    acceptedProofText:
      "Accepted proof: Screenshot/PDF with transaction ID, amount, and receiver details.",
    successRedirectText:
      "Payment received. We’ll verify and update your order shortly.",
    faq: [
      {
        q: "How long does verification take?",
        a: "Usually 5–60 minutes. During peak time it may take longer.",
      },
      {
        q: "What proof is accepted?",
        a: "Screenshot/PDF with transaction ID, amount, and receiver details.",
      },
      {
        q: "What if I uploaded wrong proof?",
        a: "Message Support using Order Chat and re-upload if needed.",
      },
    ],
  },
  services: {
    globalFaq: [],
    trustBlockText:
      "UREMO delivers manual operations with human verification and transparent order tracking.",
  },
  orderSupport: {
    quickReplies: [
      "I have paid, please verify.",
      "When will my service be delivered?",
      "I need urgent delivery.",
    ],
    supportGuidelines:
      "Share your order issue and any relevant proof/reference. Support replies within working hours.",
  },
  applyWork: {
    faq: [
      {
        q: "How long does approval take?",
        a: "24–72 hours depending on openings.",
      },
      { q: "What resume format is accepted?", a: "PDF is preferred." },
    ],
  },
};

const clampString = (value, maxLen) => {
  if (typeof value !== "string") return "";
  const out = value.trim();
  if (!out) return "";
  if (out.length <= maxLen) return out;
  return out.slice(0, maxLen);
};

const sanitizeFaqArray = (input, opts) => {
  const maxItems = opts?.maxItems ?? 25;
  const maxQ = opts?.maxQ ?? 200;
  const maxA = opts?.maxA ?? 1200;

  if (!Array.isArray(input)) return [];

  const cleaned = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const q = clampString(item.q, maxQ);
    const a = clampString(item.a, maxA);
    if (!q || !a) continue;
    cleaned.push({ q, a });
    if (cleaned.length >= maxItems) break;
  }
  return cleaned;
};

const sanitizeTitleDescArray = (input, opts) => {
  const maxItems = opts?.maxItems ?? 12;
  const maxTitle = opts?.maxTitle ?? 80;
  const maxDesc = opts?.maxDesc ?? 200;

  if (!Array.isArray(input)) return [];
  const cleaned = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const title = clampString(item.title, maxTitle);
    const desc = clampString(item.desc, maxDesc);
    if (!title || !desc) continue;
    cleaned.push({ title, desc });
    if (cleaned.length >= maxItems) break;
  }
  return cleaned;
};

const sanitizeStringArray = (input, opts) => {
  const maxItems = opts?.maxItems ?? 10;
  const maxLen = opts?.maxLen ?? 120;
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    const v = clampString(raw, maxLen);
    if (!v) continue;
    out.push(v);
    if (out.length >= maxItems) break;
  }
  return out;
};

const ensureMainSettings = async () => {
  const existing = await SiteSettings.findOne({ singletonKey: "main" });
  if (existing) return existing;

  const now = new Date();
  const created = await SiteSettings.create({
    singletonKey: "main",
    site: DEFAULTS.site,
    support: DEFAULTS.support,
    footer: DEFAULTS.footer,
    landing: DEFAULTS.landing,
    payment: DEFAULTS.payment,
    services: DEFAULTS.services,
    orderSupport: DEFAULTS.orderSupport,
    applyWork: DEFAULTS.applyWork,
    updatedAt: now,
  });

  return created;
};

const publicProjection = (doc) => {
  // Backward compatibility: support older keys (bannerText + faq.*)
  const legacyBannerText = String(doc?.bannerText || "").trim();

  const site = {
    brandName:
      String(doc?.site?.brandName || "").trim() || DEFAULTS.site.brandName,
    bannerText:
      String(doc?.site?.bannerText || "").trim() ||
      legacyBannerText ||
      DEFAULTS.site.bannerText,
  };

  const support = {
    whatsappNumber:
      String(doc?.support?.whatsappNumber || "").trim() ||
      DEFAULTS.support.whatsappNumber,
    supportEmail:
      String(doc?.support?.supportEmail || "").trim() ||
      DEFAULTS.support.supportEmail,
  };

  const footer = {
    disclaimer:
      String(doc?.footer?.disclaimer || "").trim() ||
      DEFAULTS.footer.disclaimer,
    dataSafetyNote:
      String(doc?.footer?.dataSafetyNote || "").trim() ||
      DEFAULTS.footer.dataSafetyNote,
  };

  const landing = {
    heroTitle:
      String(doc?.landing?.heroTitle || "").trim() ||
      DEFAULTS.landing.heroTitle,
    heroSubtitle:
      String(doc?.landing?.heroSubtitle || "").trim() ||
      DEFAULTS.landing.heroSubtitle,
    ctaPrimaryText:
      String(doc?.landing?.ctaPrimaryText || "").trim() ||
      DEFAULTS.landing.ctaPrimaryText,
    ctaSecondaryText:
      String(doc?.landing?.ctaSecondaryText || "").trim() ||
      DEFAULTS.landing.ctaSecondaryText,
    features:
      Array.isArray(doc?.landing?.features) && doc.landing.features.length
        ? doc.landing.features
        : DEFAULTS.landing.features,
    popularTitle:
      String(doc?.landing?.popularTitle || "").trim() ||
      DEFAULTS.landing.popularTitle,
    popularSubtitle:
      String(doc?.landing?.popularSubtitle || "").trim() ||
      DEFAULTS.landing.popularSubtitle,
    finalCtaTitle:
      String(doc?.landing?.finalCtaTitle || "").trim() ||
      DEFAULTS.landing.finalCtaTitle,
    finalCtaSubtitle:
      String(doc?.landing?.finalCtaSubtitle || "").trim() ||
      DEFAULTS.landing.finalCtaSubtitle,
  };

  const legacyPaymentFaq =
    Array.isArray(doc?.faq?.payment) && doc.faq.payment.length
      ? doc.faq.payment
      : [];
  const legacyApplyWorkFaq =
    Array.isArray(doc?.faq?.applyWork) && doc.faq.applyWork.length
      ? doc.faq.applyWork
      : [];
  const legacyGlobalFaq =
    Array.isArray(doc?.faq?.global) && doc.faq.global.length
      ? doc.faq.global
      : [];

  const payment = {
    beginnerSteps:
      Array.isArray(doc?.payment?.beginnerSteps) &&
      doc.payment.beginnerSteps.length
        ? doc.payment.beginnerSteps
        : DEFAULTS.payment.beginnerSteps,
    acceptedProofText:
      String(doc?.payment?.acceptedProofText || "").trim() ||
      DEFAULTS.payment.acceptedProofText,
    successRedirectText:
      String(doc?.payment?.successRedirectText || "").trim() ||
      DEFAULTS.payment.successRedirectText,
    faq:
      Array.isArray(doc?.payment?.faq) && doc.payment.faq.length
        ? doc.payment.faq
        : legacyPaymentFaq.length
        ? legacyPaymentFaq
        : DEFAULTS.payment.faq,
  };

  const services = {
    globalFaq:
      Array.isArray(doc?.services?.globalFaq) && doc.services.globalFaq.length
        ? doc.services.globalFaq
        : legacyGlobalFaq.length
        ? legacyGlobalFaq
        : DEFAULTS.services.globalFaq,
    trustBlockText:
      String(doc?.services?.trustBlockText || "").trim() ||
      DEFAULTS.services.trustBlockText,
  };

  const orderSupport = {
    quickReplies:
      Array.isArray(doc?.orderSupport?.quickReplies) &&
      doc.orderSupport.quickReplies.length
        ? doc.orderSupport.quickReplies
        : DEFAULTS.orderSupport.quickReplies,
    supportGuidelines:
      String(doc?.orderSupport?.supportGuidelines || "").trim() ||
      DEFAULTS.orderSupport.supportGuidelines,
  };

  const applyWork = {
    faq:
      Array.isArray(doc?.applyWork?.faq) && doc.applyWork.faq.length
        ? doc.applyWork.faq
        : legacyApplyWorkFaq.length
        ? legacyApplyWorkFaq
        : DEFAULTS.applyWork.faq,
  };

  return {
    site,
    support,
    footer,
    landing,
    payment,
    services,
    orderSupport,
    applyWork,
    updatedAt: doc?.updatedAt || null,
  };
};

exports.getPublicSettings = async (req, res) => {
  try {
    const doc = await ensureMainSettings();
    return res.json(publicProjection(doc));
  } catch (err) {
    return res.status(500).json({ message: err?.message || "Server error" });
  }
};

exports.getAdminSettings = async (req, res) => {
  try {
    const doc = await ensureMainSettings();
    await doc.populate("updatedBy", "_id name email role");
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ message: err?.message || "Server error" });
  }
};

exports.updateAdminSettings = async (req, res) => {
  try {
    const body = req.body || {};

    // Accept legacy payload fields too.
    const legacyBannerText = clampString(body.bannerText, 240);
    const legacyFaq = {
      global: sanitizeFaqArray(body?.faq?.global),
      payment: sanitizeFaqArray(body?.faq?.payment),
      applyWork: sanitizeFaqArray(body?.faq?.applyWork),
      orderSupport: sanitizeFaqArray(body?.faq?.orderSupport),
    };

    const payload = {
      site: {
        brandName: clampString(body?.site?.brandName, 48),
        bannerText:
          clampString(body?.site?.bannerText, 240) || legacyBannerText,
      },
      support: {
        whatsappNumber: clampString(body?.support?.whatsappNumber, 32),
        supportEmail: clampString(body?.support?.supportEmail, 120),
      },
      footer: {
        disclaimer: clampString(body?.footer?.disclaimer, 2000),
        dataSafetyNote: clampString(body?.footer?.dataSafetyNote, 2000),
      },
      landing: {
        heroTitle: clampString(body?.landing?.heroTitle, 120),
        heroSubtitle: clampString(body?.landing?.heroSubtitle, 300),
        ctaPrimaryText: clampString(body?.landing?.ctaPrimaryText, 32),
        ctaSecondaryText: clampString(body?.landing?.ctaSecondaryText, 32),
        features: sanitizeTitleDescArray(body?.landing?.features, {
          maxItems: 8,
          maxTitle: 48,
          maxDesc: 140,
        }),
        popularTitle: clampString(body?.landing?.popularTitle, 64),
        popularSubtitle: clampString(body?.landing?.popularSubtitle, 160),
        finalCtaTitle: clampString(body?.landing?.finalCtaTitle, 64),
        finalCtaSubtitle: clampString(body?.landing?.finalCtaSubtitle, 220),
      },
      payment: {
        beginnerSteps: sanitizeTitleDescArray(body?.payment?.beginnerSteps, {
          maxItems: 10,
          maxTitle: 48,
          maxDesc: 160,
        }),
        acceptedProofText: clampString(body?.payment?.acceptedProofText, 300),
        successRedirectText: clampString(
          body?.payment?.successRedirectText,
          220
        ),
        faq: sanitizeFaqArray(body?.payment?.faq),
      },
      services: {
        globalFaq: sanitizeFaqArray(body?.services?.globalFaq),
        trustBlockText: clampString(body?.services?.trustBlockText, 600),
      },
      orderSupport: {
        quickReplies: sanitizeStringArray(body?.orderSupport?.quickReplies, {
          maxItems: 10,
          maxLen: 80,
        }),
        supportGuidelines: clampString(
          body?.orderSupport?.supportGuidelines,
          600
        ),
      },
      applyWork: {
        faq: sanitizeFaqArray(body?.applyWork?.faq),
      },

      // Keep legacy fields so older frontends remain compatible if deployed.
      bannerText: legacyBannerText,
      faq: legacyFaq,

      updatedAt: new Date(),
      updatedBy: req.user?.id,
    };

    const updated = await SiteSettings.findOneAndUpdate(
      { singletonKey: "main" },
      { $set: { singletonKey: "main", ...payload } },
      { new: true, upsert: true, runValidators: true }
    );

    await updated.populate("updatedBy", "_id name email role");
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: err?.message || "Server error" });
  }
};
