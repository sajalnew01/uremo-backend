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

function buildStatusFilter(status) {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  if (!s || s === "all") return {};

  // For backward compatibility: treat active services as status='active' OR legacy active=true
  if (s === "active") {
    return {
      $or: [{ status: "active" }, { active: true, status: { $exists: false } }],
    };
  }

  if (s === "draft" || s === "archived") return { status: s };
  return {};
}

function buildCategoryFilter(category) {
  const c = String(category || "").trim();
  if (!c || c === "all") return {};

  const canon = canonCategory(c);

  // Match canonical stored values AND legacy/free-text values via regex heuristics.
  if (canon === "microjobs") {
    return { $or: [{ category: "microjobs" }, { category: /micro/i }] };
  }
  if (canon === "forex_crypto") {
    return {
      $or: [
        { category: "forex_crypto" },
        { category: /forex/i },
        { category: /crypto/i },
      ],
    };
  }
  if (canon === "banks_gateways_wallets") {
    return {
      $or: [
        { category: "banks_gateways_wallets" },
        { category: /bank/i },
        { category: /gateway/i },
        { category: /wallet/i },
      ],
    };
  }

  return { category: canon };
}

function buildTypeFilter(serviceType) {
  const t = String(serviceType || "").trim();
  if (!t || t === "all") return {};

  const canon = canonType(t);

  if (canon === "fresh_profile") {
    return {
      $or: [{ serviceType: "fresh_profile" }, { serviceType: /fresh/i }],
    };
  }
  if (canon === "already_onboarded") {
    return {
      $or: [
        { serviceType: "already_onboarded" },
        { serviceType: /already/i },
        { serviceType: /onboard/i },
      ],
    };
  }
  if (canon === "interview_process") {
    return {
      $or: [
        { serviceType: "interview_process" },
        { serviceType: /interview/i },
        { serviceType: /process/i },
      ],
    };
  }
  if (canon === "interview_passed") {
    return {
      $or: [
        { serviceType: "interview_passed" },
        { serviceType: /interview/i },
        { serviceType: /passed/i },
      ],
    };
  }

  return { serviceType: canon };
}

function buildCountryFilter(country) {
  const c = String(country || "").trim();
  if (!c || c === "all") return {};
  const canon = canonCountry(c);

  // Keep Global fallback for services not tied to a specific country.
  return { countries: { $in: [canon, "Global"] } };
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

    const filter = {
      ...buildStatusFilter(status),
      ...buildCountryFilter(country),
    };

    const categoryFilter = buildCategoryFilter(category);
    const typeFilter = buildTypeFilter(serviceType);

    // Merge possible $or blocks carefully
    if (categoryFilter.$or && typeFilter.$or) {
      filter.$and = [{ $or: categoryFilter.$or }, { $or: typeFilter.$or }];
    } else if (categoryFilter.$or) {
      filter.$or = categoryFilter.$or;
    } else if (typeFilter.$or) {
      filter.$or = typeFilter.$or;
    } else {
      Object.assign(filter, categoryFilter, typeFilter);
    }

    let sortOption = { createdAt: -1, _id: -1 };
    if (sort === "topViewed") sortOption = { viewCount: -1, createdAt: -1 };
    if (sort === "priceLow") sortOption = { price: 1, createdAt: -1 };
    if (sort === "priceHigh") sortOption = { price: -1, createdAt: -1 };

    const take = Math.min(parseInt(limit) || 100, 200);
    const skip = (parseInt(page) - 1) * take;

    const raw = await Service.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(take)
      .lean();

    const services = (Array.isArray(raw) ? raw : []).map((s) => ({
      ...s,
      category: canonCategory(s.category),
      serviceType: canonType(s.serviceType),
      countries: (Array.isArray(s.countries) && s.countries.length
        ? s.countries
        : ["Global"]
      ).map(canonCountry),
    }));

    // Stable countries list for dropdown
    const activeFilter = buildStatusFilter("active");
    const countriesRaw = await Service.distinct("countries", activeFilter);
    const flatCountries = Array.isArray(countriesRaw)
      ? countriesRaw.flat?.() || countriesRaw
      : [];
    const countries = [...new Set(flatCountries.map(canonCountry))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return res.json({
      ok: true,
      services,
      filters: {
        categories: CANON_CATEGORIES,
        countries: ["Global", ...countries.filter((c) => c !== "Global")],
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
