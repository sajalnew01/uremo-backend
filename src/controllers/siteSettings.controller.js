const SiteSettings = require("../models/SiteSettings");

const DEFAULTS = {
  bannerText:
    "⚠️ All services are processed manually. Verification & approval may take time.",
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
  faq: {
    global: [],
    payment: [
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
    applyWork: [
      {
        q: "How long does approval take?",
        a: "24–72 hours depending on openings.",
      },
      {
        q: "What resume format is accepted?",
        a: "PDF is preferred.",
      },
    ],
    orderSupport: [
      {
        q: "How do I get faster delivery?",
        a: "Use the Order Support Chat and share your order issue.",
      },
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

const ensureMainSettings = async () => {
  const existing = await SiteSettings.findOne({ singletonKey: "main" });
  if (existing) return existing;

  const now = new Date();
  const created = await SiteSettings.create({
    singletonKey: "main",
    bannerText: DEFAULTS.bannerText,
    support: DEFAULTS.support,
    footer: DEFAULTS.footer,
    faq: DEFAULTS.faq,
    updatedAt: now,
  });

  return created;
};

const publicProjection = (doc) => {
  const safe = {
    bannerText: doc?.bannerText || DEFAULTS.bannerText,
    support: {
      whatsappNumber:
        doc?.support?.whatsappNumber || DEFAULTS.support.whatsappNumber,
      supportEmail: doc?.support?.supportEmail || DEFAULTS.support.supportEmail,
    },
    footer: {
      disclaimer: doc?.footer?.disclaimer || DEFAULTS.footer.disclaimer,
      dataSafetyNote:
        doc?.footer?.dataSafetyNote || DEFAULTS.footer.dataSafetyNote,
    },
    faq: {
      global:
        Array.isArray(doc?.faq?.global) && doc.faq.global.length
          ? doc.faq.global
          : DEFAULTS.faq.global,
      payment:
        Array.isArray(doc?.faq?.payment) && doc.faq.payment.length
          ? doc.faq.payment
          : DEFAULTS.faq.payment,
      applyWork:
        Array.isArray(doc?.faq?.applyWork) && doc.faq.applyWork.length
          ? doc.faq.applyWork
          : DEFAULTS.faq.applyWork,
      orderSupport:
        Array.isArray(doc?.faq?.orderSupport) && doc.faq.orderSupport.length
          ? doc.faq.orderSupport
          : DEFAULTS.faq.orderSupport,
    },
  };

  return safe;
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

    const payload = {
      bannerText: clampString(body.bannerText, 240),
      support: {
        whatsappNumber: clampString(body?.support?.whatsappNumber, 32),
        supportEmail: clampString(body?.support?.supportEmail, 120),
      },
      footer: {
        disclaimer: clampString(body?.footer?.disclaimer, 2000),
        dataSafetyNote: clampString(body?.footer?.dataSafetyNote, 2000),
      },
      faq: {
        global: sanitizeFaqArray(body?.faq?.global),
        payment: sanitizeFaqArray(body?.faq?.payment),
        applyWork: sanitizeFaqArray(body?.faq?.applyWork),
        orderSupport: sanitizeFaqArray(body?.faq?.orderSupport),
      },
      updatedAt: new Date(),
      updatedBy: req.user?.id,
    };

    // If admin clears some fields, keep them as empty strings/arrays (allowed)

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
