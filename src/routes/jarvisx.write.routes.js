const express = require("express");

const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const JarvisWrite = require("../controllers/jarvisxWrite.controller");
const Service = require("../models/Service");

const {
  canonCategory,
  canonType,
  canonCountry,
} = require("../controllers/services.controller");

const router = express.Router();

async function ensureUniqueSlug(baseSlug) {
  const cleanBase = String(baseSlug || "service")
    .trim()
    .toLowerCase();
  let candidate = cleanBase || `service-${Date.now()}`;
  let suffix = 1;
  // slug is unique in schema
  while (await Service.exists({ slug: candidate })) {
    suffix += 1;
    candidate = `${cleanBase}-${suffix}`;
  }
  return candidate;
}

// PATCH_16: REAL DB publish endpoint (admin-only)
// NOTE: Works even if GROQ_API_KEY is missing; this is not an AI operation.
router.post("/execute", auth, admin, async (req, res) => {
  try {
    const { title, price, description, category, serviceType, countries } =
      req.body || {};

    if (!title || price === undefined || price === null) {
      return res
        .status(400)
        .json({ ok: false, message: "title & price required" });
    }

    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice)) {
      return res
        .status(400)
        .json({ ok: false, message: "price must be a number" });
    }

    const safeTitle = String(title).trim();
    if (!safeTitle) {
      return res.status(400).json({ ok: false, message: "title required" });
    }

    const resolvedCountriesRaw = Array.isArray(countries)
      ? countries
      : countries
        ? [countries]
        : ["Global"];

    const resolvedCountries = resolvedCountriesRaw
      .map(canonCountry)
      .filter(Boolean);

    const service = await Service.create({
      title: safeTitle,
      slug: await ensureUniqueSlug(
        safeTitle
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-"),
      ),
      price: numericPrice,
      description: String(description || "").trim(),
      category: canonCategory(category),
      serviceType: canonType(serviceType),
      countries: resolvedCountries.length ? resolvedCountries : ["Global"],
      status: "active",
      active: true,
      createdBy: req.user?._id || req.user?.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.json({
      ok: true,
      message: "✅ Service created & published in MongoDB",
      serviceId: service._id,
      service,
      realAction: true,
    });
  } catch (e) {
    console.error("[JarvisX Write Execute] error:", e);
    return res
      .status(500)
      .json({ ok: false, message: "DB write failed", error: e.message });
  }
});

// Admin-only health
router.get("/health", auth, admin, JarvisWrite.health);

// Propose (admin-only)
router.post(
  "/propose",
  auth,
  admin,
  JarvisWrite.proposeLimiter,
  JarvisWrite.propose,
);

// Proposals
router.get("/proposals", auth, admin, JarvisWrite.listProposals);
router.get("/proposals/:id", auth, admin, JarvisWrite.getProposal);
router.patch("/proposals/:id", auth, admin, JarvisWrite.updateProposal);
router.put("/proposals/:id", auth, admin, JarvisWrite.updateProposal);
router.post(
  "/proposals/:id/approve",
  auth,
  admin,
  JarvisWrite.approveAndExecute,
);
router.post("/proposals/:id/reject", auth, admin, JarvisWrite.reject);

// Memory (admin-only)
router.get("/memory", auth, admin, JarvisWrite.listMemory);
router.delete("/memory/:id", auth, admin, JarvisWrite.deleteMemory);

module.exports = router;
