const Service = require("../models/Service");

// CANONICAL FILTER ORDER (matches product vision)
const CANON_CATEGORIES = [
  { id: "microjobs", label: "Microjobs" },
  { id: "forex_crypto", label: "Forex / Crypto" },
  { id: "banks_gateways_wallets", label: "Banks / Gateways / Wallets" },
  { id: "general", label: "General" },
];

const CANON_TYPES = [
  { id: "all", label: "All types" },
  { id: "fresh_profile", label: "Apply Fresh / KYC" },
  { id: "already_onboarded", label: "Already Onboarded" },
  { id: "interview_process", label: "Interview Process" },
  { id: "interview_passed", label: "Interview Passed" },
  { id: "general", label: "General" },
];

function canonCategory(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("micro")) return "microjobs";
  if (s.includes("forex") || s.includes("crypto")) return "forex_crypto";
  if (s.includes("bank") || s.includes("gateway") || s.includes("wallet")) {
    return "banks_gateways_wallets";
  }
  return "general";
}

function canonType(v) {
  const s = String(v || "").toLowerCase();
  if (s.includes("fresh")) return "fresh_profile";
  if (s.includes("already")) return "already_onboarded";
  if (s.includes("process")) return "interview_process";
  if (s.includes("passed")) return "interview_passed";
  return "general";
}

function canonCountry(v) {
  if (!v) return "Global";
  const s = String(v || "").trim();
  const x = s.toLowerCase();
  if (x === "in" || x === "india") return "India";
  if (x === "uae") return "UAE";
  if (x === "us" || x === "usa") return "USA";
  if (x === "uk" || x === "united kingdom") return "UK";
  if (x === "global" || x === "worldwide") return "Global";
  return s;
}

function setNoCache(res) {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
}

exports.getServices = async (req, res) => {
  try {
    setNoCache(res);

    const {
      status = "active",
      category = "all",
      country = "all",
      serviceType = "all",
      sort = "createdAt",
      limit = 100,
      page = 1,
    } = req.query;

    // PATCH_16_FIX: Simple filter approach - fetch ALL active, then filter in JS
    // This avoids complex $or/$and MongoDB conflicts with legacy data
    const baseFilter = {};

    // Status filter (active by default)
    const statusVal = String(status || "active").toLowerCase();
    if (statusVal === "active") {
      // Match either status='active' OR legacy active=true
      baseFilter.$or = [
        { status: "active" },
        { active: true },
      ];
    } else if (statusVal === "draft" || statusVal === "archived") {
      baseFilter.status = statusVal;
    }

    let sortOption = { createdAt: -1, _id: -1 };
    if (sort === "topViewed") sortOption = { viewCount: -1, createdAt: -1 };
    if (sort === "priceLow") sortOption = { price: 1, createdAt: -1 };
    if (sort === "priceHigh") sortOption = { price: -1, createdAt: -1 };

    const take = Math.min(parseInt(limit) || 100, 200);
    const skip = (parseInt(page) - 1) * take;

    // Fetch from DB with only status filter
    const raw = await Service.find(baseFilter)
      .sort(sortOption)
      .lean();

    // Normalize all services first
    const allNormalized = (Array.isArray(raw) ? raw : []).map((s) => ({
      ...s,
      category: canonCategory(s.category),
      serviceType: canonType(s.serviceType),
      countries: (Array.isArray(s.countries) && s.countries.length
        ? s.countries
        : ["Global"]
      ).map(canonCountry),
    }));

    // Apply category/serviceType/country filters in JS on normalized data
    const categoryFilter = String(category || "all").toLowerCase();
    const typeFilter = String(serviceType || "all").toLowerCase();
    const countryFilter = String(country || "all");

    const filtered = allNormalized.filter((s) => {
      // Category filter
      if (categoryFilter !== "all" && s.category !== categoryFilter) {
        return false;
      }

      // Service type filter
      if (typeFilter !== "all" && typeFilter !== "general" && s.serviceType !== typeFilter) {
        return false;
      }

      // Country filter (match if service has the country OR is Global)
      if (countryFilter !== "all") {
        const canonC = canonCountry(countryFilter);
        const hasCountry = s.countries.includes(canonC) || s.countries.includes("Global");
        if (!hasCountry) return false;
      }

      return true;
    });

    // Paginate
    const paginated = filtered.slice(skip, skip + take);

    // Build countries list from all active services
    const allCountries = new Set();
    allNormalized.forEach((s) => {
      (s.countries || []).forEach((c) => allCountries.add(c));
    });
    const countriesList = [...allCountries].filter(Boolean).sort((a, b) => a.localeCompare(b));

    return res.json({
      ok: true,
      services: paginated,
      total: filtered.length,
      filters: {
        categories: CANON_CATEGORIES,
        countries: ["Global", ...countriesList.filter((c) => c !== "Global")],
        serviceTypes: CANON_TYPES,
      },
      timestamp: new Date().toISOString(),
      source: "mongodb",
    });
  } catch (err) {
    console.error("[Services] getServices error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to load services",
      error: err.message,
    });
  }
};

module.exports = {
  CANON_CATEGORIES,
  CANON_TYPES,
  canonCategory,
  canonType,
  canonCountry,
  getServices: exports.getServices,
};
