const express = require("express");

const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const JarvisWrite = require("../controllers/jarvisxWrite.controller");
const Service = require("../models/Service");

const router = express.Router();

// PATCH_16: Helper to slugify titles
function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// PATCH_16: Normalize category to canonical value
function normalizeCategory(input) {
  if (!input) return "general";
  const v = String(input).toLowerCase();
  if (v.includes("micro")) return "microjobs";
  if (v.includes("forex") || v.includes("crypto")) return "forex_crypto";
  if (v.includes("bank") || v.includes("gateway") || v.includes("wallet"))
    return "banks_gateways_wallets";
  if (
    ["microjobs", "forex_crypto", "banks_gateways_wallets", "general"].includes(
      v,
    )
  )
    return v;
  return "general";
}

// PATCH_16: Normalize service type to canonical value
function normalizeServiceType(input) {
  if (!input) return "general";
  const v = String(input).toLowerCase();
  if (v.includes("fresh")) return "fresh_profile";
  if (v.includes("already")) return "already_onboarded";
  if (v.includes("process")) return "interview_process";
  if (v.includes("passed")) return "interview_passed";
  if (
    [
      "fresh_profile",
      "already_onboarded",
      "interview_process",
      "interview_passed",
      "general",
    ].includes(v)
  )
    return v;
  return "general";
}

// PATCH_16: Real-time service creation endpoint for JarvisX Write
// This writes DIRECTLY to MongoDB, no proposal required
router.post("/execute", auth, admin, async (req, res) => {
  try {
    const {
      title,
      price,
      description,
      category,
      serviceType,
      countries,
      imageUrl,
    } = req.body;

    if (!title || price === undefined) {
      return res.status(400).json({
        ok: false,
        message: "title & price are required",
        realAction: false,
      });
    }

    const safeTitle = String(title).trim();
    const numericPrice = parseFloat(price);

    if (!safeTitle || !Number.isFinite(numericPrice)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid title or price",
        realAction: false,
      });
    }

    // Generate unique slug
    const baseSlug = slugify(safeTitle);
    let slug = baseSlug || `service-${Date.now()}`;
    let suffix = 1;
    while (await Service.exists({ slug })) {
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }

    // Normalize fields to canonical values
    const normalizedCategory = normalizeCategory(category);
    const normalizedServiceType = normalizeServiceType(serviceType);
    const normalizedCountries =
      Array.isArray(countries) && countries.length > 0
        ? countries.map((c) => String(c).trim()).filter(Boolean)
        : ["Global"];

    const service = await Service.create({
      title: safeTitle,
      slug,
      description: String(description || "Service created via JarvisX").trim(),
      price: numericPrice,
      currency: "USD",
      category: normalizedCategory,
      serviceType: normalizedServiceType,
      countries: normalizedCountries,
      status: "active",
      active: true,
      deliveryType: "manual",
      imageUrl: imageUrl || "",
      images: [],
      createdBy: req.user?._id || req.user?.id || null,
    });

    console.log(
      `[JARVISX_WRITE_EXECUTE] Service created: ${service._id} "${safeTitle}"`,
    );

    return res.json({
      ok: true,
      message: "✅ Service created & published in MongoDB",
      serviceId: service._id,
      service,
      realAction: true,
    });
  } catch (err) {
    console.error("[JARVISX_WRITE_EXECUTE] error:", err);
    return res.status(500).json({
      ok: false,
      message: "DB write failed",
      error: err?.message,
      realAction: false,
    });
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
