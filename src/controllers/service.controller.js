const Service = require("../models/Service");

function setNoCache(res) {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
}

const slugify = (str) => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

// PATCH_17: Canonical filter definitions (matches vision 3-step flow)
const CANON_CATEGORIES = [
  { id: "microjobs", label: "Microjobs" },
  { id: "forex_crypto", label: "Forex / Crypto" },
  { id: "banks_gateways_wallets", label: "Banks / Gateways / Wallets" },
  { id: "general", label: "General" },
];

// PATCH_17: Two-path listing types
const CANON_LISTING_TYPES = [
  { id: "fresh_account", label: "Fresh Account (with screening assessment)" },
  {
    id: "already_onboarded",
    label: "Already Onboarded (Instant project-ready)",
  },
  { id: "general", label: "General" },
];

// Legacy service types (kept for backward compatibility)
const CANON_SERVICE_TYPES = [
  { id: "all", label: "All types" },
  { id: "fresh_profile", label: "Apply Fresh / KYC" },
  { id: "already_onboarded", label: "Already Onboarded" },
  { id: "interview_process", label: "Interview Process" },
  { id: "interview_passed", label: "Interview Passed" },
  { id: "general", label: "General" },
];

// PATCH_16: Normalize category for vision-aligned filtering (canon mapping)
function normalizeCategory(input) {
  if (!input) return "general";
  const v = String(input).toLowerCase();
  if (v.includes("micro")) return "microjobs";
  if (v.includes("forex") || v.includes("crypto")) return "forex_crypto";
  if (v.includes("bank") || v.includes("gateway") || v.includes("wallet"))
    return "banks_gateways_wallets";
  // Return as-is if already a valid category id
  if (
    ["microjobs", "forex_crypto", "banks_gateways_wallets", "general"].includes(
      v,
    )
  )
    return v;
  return "general";
}

// PATCH_16: Normalize serviceType for vision-aligned filtering
function normalizeServiceType(input) {
  if (!input) return "general";
  const v = String(input).toLowerCase();
  if (v.includes("fresh")) return "fresh_profile";
  if (v.includes("already")) return "already_onboarded";
  if (v.includes("process")) return "interview_process";
  if (v.includes("passed")) return "interview_passed";
  // Return as-is if already a valid type id
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

// PATCH_17: Normalize listingType for two-path UX
function normalizeListingType(input) {
  if (!input) return "general";
  const v = String(input).toLowerCase();
  if (v.includes("fresh") || v === "fresh_account") return "fresh_account";
  if (
    v.includes("already") ||
    v.includes("onboard") ||
    v === "already_onboarded"
  )
    return "already_onboarded";
  if (["fresh_account", "already_onboarded", "general"].includes(v)) return v;
  return "general";
}

// PATCH_16: Normalize country names for consistent display
function normalizeCountry(input) {
  if (!input) return "Global";
  const v = String(input).trim();
  const lower = v.toLowerCase();
  if (lower === "in" || lower === "india") return "India";
  if (lower === "uae") return "UAE";
  if (lower === "us" || lower === "usa") return "USA";
  if (lower === "uk" || lower === "united kingdom") return "UK";
  if (lower === "global") return "Global";
  // Capitalize first letter for other countries
  return v.charAt(0).toUpperCase() + v.slice(1);
}

exports.createService = async (req, res) => {
  try {
    const {
      title,
      category,
      description,
      price,
      currency,
      deliveryType,
      images,
      imageUrl,
      requirements,
    } = req.body;

    if (!title || !category || !description || !price) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const slug = slugify(title);

    const service = await Service.create({
      title,
      slug,
      category,
      description,
      price,
      currency: currency || "USD",
      deliveryType: deliveryType || "manual",
      images: images || [],
      imageUrl: imageUrl || "",
      requirements: requirements || "",
      createdBy: req.user.id,
      active: true,
    });

    res.status(201).json(service);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// PATCH_18: Filter-safe guided filtering that never loses track
exports.getActiveServices = async (req, res) => {
  try {
    setNoCache(res);

    // Extract query params
    const {
      category,
      listingType,
      country,
      platform,
      subject,
      projectName,
      minPayRate,
      limit = 100,
      page = 1,
      sort = "createdAt",
    } = req.query;

    // PATCH_18: Build base filter - only active services
    const baseFilter = {
      $or: [{ status: "active" }, { active: true, status: { $exists: false } }],
    };

    const appliedFilters = {};
    const ignoredFilters = [];

    // Category filter
    const categoryVal = String(category || "").trim();
    if (categoryVal && categoryVal !== "all") {
      baseFilter.category = normalizeCategory(categoryVal);
      appliedFilters.category = baseFilter.category;
    }

    // ListingType filter
    const listingTypeVal = String(listingType || "").trim();
    const normalizedListingType =
      listingTypeVal && listingTypeVal !== "all"
        ? normalizeListingType(listingTypeVal)
        : null;

    if (normalizedListingType) {
      baseFilter.listingType = normalizedListingType;
      appliedFilters.listingType = normalizedListingType;
    }

    // Country filter
    const countryVal = String(country || "").trim();
    if (countryVal && countryVal !== "all") {
      baseFilter.countries = { $in: [countryVal, "Global"] };
      appliedFilters.country = countryVal;
    }

    // Platform filter
    const platformVal = String(platform || "").trim();
    if (platformVal && platformVal !== "all") {
      baseFilter.platform = { $regex: new RegExp(`^${platformVal}$`, "i") };
      appliedFilters.platform = platformVal;
    }

    // PATCH_18: Context-aware filter application
    const isFreshAccount = normalizedListingType === "fresh_account";
    const isAlreadyOnboarded = normalizedListingType === "already_onboarded";

    // Subject filter (only for fresh_account)
    const subjectVal = String(subject || "").trim();
    if (subjectVal && subjectVal !== "all") {
      if (isFreshAccount) {
        baseFilter.subject = { $regex: new RegExp(`^${subjectVal}$`, "i") };
        appliedFilters.subject = subjectVal;
      } else {
        ignoredFilters.push({
          field: "subject",
          reason: "only applies to fresh_account",
        });
      }
    }

    // ProjectName filter (only for already_onboarded)
    const projectVal = String(projectName || "").trim();
    if (projectVal && projectVal !== "all") {
      if (isAlreadyOnboarded) {
        baseFilter.projectName = { $regex: new RegExp(`^${projectVal}$`, "i") };
        appliedFilters.projectName = projectVal;
      } else {
        ignoredFilters.push({
          field: "projectName",
          reason: "only applies to already_onboarded",
        });
      }
    }

    // MinPayRate filter (only for already_onboarded)
    const minPayRateVal = parseFloat(minPayRate);
    if (Number.isFinite(minPayRateVal) && minPayRateVal > 0) {
      if (isAlreadyOnboarded) {
        baseFilter.payRate = { $gte: minPayRateVal };
        appliedFilters.minPayRate = minPayRateVal;
      } else {
        ignoredFilters.push({
          field: "minPayRate",
          reason: "only applies to already_onboarded",
        });
      }
    }

    // Pagination
    const take = Math.min(parseInt(limit) || 100, 200);
    const skip = (parseInt(page) - 1) * take;

    // Sort mapping
    let sortOption = { createdAt: -1, _id: -1 };
    if (sort === "topViewed") sortOption = { viewCount: -1, createdAt: -1 };
    if (sort === "priceLow") sortOption = { price: 1, createdAt: -1 };
    if (sort === "priceHigh") sortOption = { price: -1, createdAt: -1 };
    if (sort === "payRateHigh") sortOption = { payRate: -1, createdAt: -1 };

    // Fetch services
    const rawServices = await Service.find(baseFilter)
      .sort(sortOption)
      .skip(skip)
      .limit(take)
      .lean();

    // PATCH_18: Normalize service data and auto-fill missing defaults
    const services = rawServices.map((s) => ({
      ...s,
      category: s.category || "general",
      listingType: s.listingType || "general",
      countries:
        Array.isArray(s.countries) && s.countries.length > 0
          ? s.countries.map(normalizeCountry)
          : ["Global"],
      platform: s.platform || "",
      subject: s.subject || "",
      projectName: s.projectName || "",
      payRate: s.payRate || 0,
      instantDelivery: s.instantDelivery || false,
      tags: Array.isArray(s.tags) ? s.tags : [],
      features: Array.isArray(s.features) ? s.features : [],
    }));

    const total = await Service.countDocuments(baseFilter);

    // PATCH_18: Build dynamic filter options using distinct queries
    // Each filter list is scoped to currently applied filters (except that field)
    const activeBaseFilter = {
      $or: [{ status: "active" }, { active: true, status: { $exists: false } }],
    };

    // Categories (always show all canonical)
    const categoriesFromDb = await Service.distinct(
      "category",
      activeBaseFilter,
    );

    // ListingTypes - scoped by category if selected
    const listingTypesFilter = { ...activeBaseFilter };
    if (appliedFilters.category)
      listingTypesFilter.category = appliedFilters.category;
    const listingTypesFromDb = await Service.distinct(
      "listingType",
      listingTypesFilter,
    );

    // Countries - scoped by category + listingType
    const countriesFilter = { ...listingTypesFilter };
    if (appliedFilters.listingType)
      countriesFilter.listingType = appliedFilters.listingType;
    const countriesRaw = await Service.distinct("countries", countriesFilter);
    const flatCountries = Array.isArray(countriesRaw)
      ? countriesRaw.flat()
      : [];
    const normalizedCountries = [
      ...new Set(flatCountries.map(normalizeCountry)),
    ].filter(Boolean);
    const sortedCountries = [
      "Global",
      ...normalizedCountries.filter((c) => c !== "Global").sort(),
    ];

    // Platforms - scoped
    const platformsRaw = await Service.distinct("platform", countriesFilter);
    const platforms = [...new Set(platformsRaw.filter(Boolean))].sort();

    // PATCH_18: Context-aware filter lists
    let subjects = [];
    let projects = [];
    let payRateMinMax = { min: 0, max: 100 };

    // Subjects only for fresh_account
    if (!normalizedListingType || normalizedListingType === "fresh_account") {
      const subjectsFilter = {
        ...countriesFilter,
        listingType: "fresh_account",
      };
      const subjectsRaw = await Service.distinct("subject", subjectsFilter);
      subjects = [...new Set(subjectsRaw.filter(Boolean))].sort();
    }

    // Projects + payRate only for already_onboarded
    if (
      !normalizedListingType ||
      normalizedListingType === "already_onboarded"
    ) {
      const onboardedFilter = {
        ...countriesFilter,
        listingType: "already_onboarded",
      };
      const projectsRaw = await Service.distinct(
        "projectName",
        onboardedFilter,
      );
      projects = [...new Set(projectsRaw.filter(Boolean))].sort();

      // PayRate range
      const payRateAgg = await Service.aggregate([
        {
          $match: {
            ...activeBaseFilter,
            listingType: "already_onboarded",
            payRate: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            min: { $min: "$payRate" },
            max: { $max: "$payRate" },
          },
        },
      ]);
      if (payRateAgg[0])
        payRateMinMax = { min: payRateAgg[0].min, max: payRateAgg[0].max };
    }

    // Build response
    const responseFilters = {
      categories: CANON_CATEGORIES,
      listingTypes: CANON_LISTING_TYPES.filter(
        (lt) => listingTypesFromDb.includes(lt.id) || lt.id === "general",
      ),
      countries: sortedCountries,
      platforms,
    };

    // Only include subject/project/payRate when relevant
    if (isFreshAccount || !normalizedListingType) {
      responseFilters.subjects = subjects;
    }
    if (isAlreadyOnboarded || !normalizedListingType) {
      responseFilters.projects = projects;
      responseFilters.payRateMinMax = payRateMinMax;
    }

    return res.json({
      ok: true,
      services,
      filters: responseFilters,
      meta: {
        appliedFilters,
        ignoredFilters,
        total,
        page: parseInt(page),
        limit: take,
        pages: Math.ceil(total / take),
      },
      source: "mongodb",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Services] GET error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to load services",
      error: err.message,
    });
  }
};

exports.getServiceById = async (req, res) => {
  try {
    setNoCache(res);
    const { id } = req.params;
    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.json(service);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllServices = async (req, res) => {
  try {
    setNoCache(res);
    const services = await Service.find().sort({ createdAt: -1 });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      title,
      category,
      description,
      requirements,
      price,
      currency,
      images,
      imageUrl,
      deliveryType,
      type,
      active,
      isActive,
    } = req.body || {};

    const payload = {};

    if (typeof title === "string" && title.trim()) {
      payload.title = title.trim();
      payload.slug = slugify(payload.title);
    }
    if (typeof category === "string") payload.category = category;
    if (typeof description === "string") payload.description = description;
    if (typeof requirements === "string") payload.requirements = requirements;
    if (price !== undefined) payload.price = Number(price);
    if (typeof currency === "string" && currency.trim()) {
      payload.currency = currency.trim();
    }
    if (Array.isArray(images)) payload.images = images;
    if (typeof imageUrl === "string") payload.imageUrl = imageUrl;

    const resolvedDeliveryType =
      typeof deliveryType === "string"
        ? deliveryType
        : typeof type === "string"
          ? type
          : undefined;
    if (resolvedDeliveryType) payload.deliveryType = resolvedDeliveryType;

    const resolvedActive =
      typeof active === "boolean"
        ? active
        : typeof isActive === "boolean"
          ? isActive
          : undefined;
    if (resolvedActive !== undefined) payload.active = resolvedActive;

    const service = await Service.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.json(service);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findByIdAndDelete(id);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.json({ message: "Service deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
