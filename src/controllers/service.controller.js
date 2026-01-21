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

// PATCH_16: Canonical filter definitions (matches user's handwritten vision)
const CANON_CATEGORIES = [
  { id: "microjobs", label: "Microjobs" },
  { id: "forex_crypto", label: "Forex / Crypto" },
  { id: "banks_gateways_wallets", label: "Banks / Gateways / Wallets" },
  { id: "general", label: "General" },
];

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

exports.getActiveServices = async (req, res) => {
  try {
    setNoCache(res);

    // PATCH_16: Enhanced filtering with vision-aligned parameters
    const {
      status = "active",
      category = "all",
      country = "all",
      serviceType = "all",
      limit = 100,
      page = 1,
      sort = "createdAt",
    } = req.query;

    // Legacy active/status handling for backward compatibility
    const statusRaw = String(req.query?.status || "")
      .toLowerCase()
      .trim();
    const activeRaw = String(req.query?.active ?? req.query?.isActive ?? "")
      .toLowerCase()
      .trim();

    const filter = {};

    // PATCH_16: Support both status-based and active-based filtering
    if (status && status !== "all") {
      if (status === "active") {
        // Active can mean status='active' OR legacy active=true
        filter.$or = [
          { status: "active" },
          { active: true, status: { $exists: false } },
        ];
      } else if (status === "draft" || status === "archived") {
        filter.status = status;
      }
    } else if (
      statusRaw === "all" ||
      statusRaw === "inactive" ||
      activeRaw === "0" ||
      activeRaw === "false"
    ) {
      // Include all when explicitly requested
    } else {
      // Default: active only
      filter.$or = [{ status: "active" }, { active: true }];
    }

    // PATCH_16: Category filter (vision-aligned)
    const categoryRaw = String(category || req.query?.category || "").trim();
    if (categoryRaw && categoryRaw !== "all") {
      const normalizedCat = normalizeCategory(categoryRaw);
      filter.category = normalizedCat;
    }

    // PATCH_16: ServiceType filter
    const serviceTypeRaw = String(serviceType || "").trim();
    if (serviceTypeRaw && serviceTypeRaw !== "all") {
      const normalizedType = normalizeServiceType(serviceTypeRaw);
      filter.serviceType = normalizedType;
    }

    // PATCH_16: Country filter (match includes OR Global fallback)
    const countryRaw = String(country || "").trim();
    if (countryRaw && countryRaw !== "all") {
      filter.countries = { $in: [countryRaw, "Global"] };
    }

    const take = Math.min(parseInt(limit) || 100, 200);
    const skip = (parseInt(page) - 1) * take;

    // PATCH_16: Sort mapping
    let sortOption = { createdAt: -1, _id: -1 };
    if (sort === "topViewed") sortOption = { viewCount: -1, createdAt: -1 };
    if (sort === "priceLow") sortOption = { price: 1, createdAt: -1 };
    if (sort === "priceHigh") sortOption = { price: -1, createdAt: -1 };

    const rawServices = await Service.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(take)
      .lean();

    // PATCH_16: Normalize service data on response (fix old inconsistent DB values)
    const services = rawServices.map((s) => ({
      ...s,
      category: normalizeCategory(s.category),
      serviceType: normalizeServiceType(s.serviceType),
      countries: (s.countries && s.countries.length
        ? s.countries
        : ["Global"]
      ).map(normalizeCountry),
    }));

    const total = await Service.countDocuments(filter);

    // PATCH_16: Get raw country values from DB and normalize
    const activeFilter = { $or: [{ status: "active" }, { active: true }] };
    const countriesRaw = await Service.distinct("countries", activeFilter);
    const flatCountries = Array.isArray(countriesRaw)
      ? countriesRaw.flat()
      : [];
    const normalizedCountries = [
      ...new Set(flatCountries.map(normalizeCountry)),
    ].filter(Boolean);
    // Ensure "Global" is always first
    const sortedCountries = [
      "Global",
      ...normalizedCountries.filter((c) => c !== "Global"),
    ];

    if (process.env.DEBUG_REQUESTS === "1") {
      console.log("[SERVICES_LIST]", {
        path: req.originalUrl,
        filter: JSON.stringify(filter),
        count: Array.isArray(services) ? services.length : 0,
      });
    }

    // PATCH_16: Return enhanced response with canonical filter config
    return res.json({
      ok: true,
      services: Array.isArray(services) ? services : [],
      filters: {
        // PATCH_16: Canonical categories with id/label (vision-aligned order)
        categories: CANON_CATEGORIES,
        // PATCH_16: Canonical service types with id/label
        serviceTypes: CANON_SERVICE_TYPES,
        // PATCH_16: Countries from DB (normalized + Global first)
        countries: sortedCountries,
        // Legacy keys for backward compatibility
        availableCategories: CANON_CATEGORIES.map((c) => c.id),
        availableServiceTypes: CANON_SERVICE_TYPES.filter(
          (t) => t.id !== "all",
        ).map((t) => t.id),
        availableCountries: sortedCountries,
      },
      pagination: {
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
