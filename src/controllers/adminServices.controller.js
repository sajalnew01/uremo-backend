const Service = require("../models/Service");

// PATCH_20: No-cache headers for admin CMS endpoints
function setNoCache(res) {
  res.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
}

// PATCH_18/20/21: Canonical enums (single source of truth) - synced with Service model
const VALID_CATEGORIES = [
  "microjobs",
  "forex_crypto",
  "banks_gateways_wallets",
  "rentals", // PATCH_21: Added rentals category
  "general",
];
// PATCH_19/20/21: All valid subcategories across categories
const VALID_SUBCATEGORIES = [
  "fresh_account",
  "already_onboarded",
  "forex_platform_creation",
  "crypto_platform_creation",
  "banks",
  "payment_gateways",
  "wallets",
  // PATCH_21: Rental subcategories
  "whatsapp_business_verified",
  "linkedin_premium_account",
  "social_media_verified",
  "email_accounts",
  "general",
];
const VALID_LISTING_TYPES = ["fresh_account", "already_onboarded", "general"];
const VALID_STATUSES = ["draft", "active", "archived"];

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function ensureUniqueSlug(baseSlug) {
  let candidate = baseSlug;
  let suffix = 1;

  while (await Service.exists({ slug: candidate })) {
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }

  return candidate;
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

// PATCH_18: Normalize category to valid enum
function normalizeCategory(val) {
  const v = String(val || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, "_");
  if (VALID_CATEGORIES.includes(v)) return v;
  return "general";
}

// PATCH_18: Normalize listingType to valid enum
function normalizeListingType(val) {
  const v = String(val || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  if (VALID_LISTING_TYPES.includes(v)) return v;
  return "general";
}

// PATCH_20/21: Normalize subcategory to valid enum
function normalizeSubcategory(val, category) {
  const v = String(val || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  if (VALID_SUBCATEGORIES.includes(v)) return v;
  // PATCH_21: Default subcategory based on category (includes rentals)
  const defaults = {
    microjobs: "fresh_account",
    forex_crypto: "forex_platform_creation",
    banks_gateways_wallets: "banks",
    rentals: "whatsapp_business_verified",
    general: "general",
  };
  return defaults[category] || "fresh_account";
}

// PATCH_18: Normalize status to valid enum
function normalizeStatus(val) {
  const v = String(val || "")
    .toLowerCase()
    .trim();
  if (VALID_STATUSES.includes(v)) return v;
  return "draft";
}

// PATCH_18/20: Full Admin CMS - Create service with all fields
exports.createService = async (req, res) => {
  try {
    // PATCH_20: Enhanced debug logging
    console.log("[ADMIN_SERVICES] createService called", {
      hasUser: !!req.user,
      userId: req.user?.id || req.user?._id,
      bodyKeys: Object.keys(req.body || {}),
    });

    const {
      title,
      price,
      description,
      shortDescription,
      category,
      subcategory, // PATCH_20: Added subcategory field
      listingType,
      countries,
      platform,
      subject,
      projectName,
      payRate,
      instantDelivery,
      status,
      tags,
      features,
      active,
      isActive,
      currency,
      deliveryType,
      countryPricing, // PATCH_20: Country-based pricing
    } = req.body || {};

    // Validation
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ ok: false, message: "title is required" });
    }

    const numericPrice = parseNumber(price);
    if (numericPrice === null) {
      return res
        .status(400)
        .json({ ok: false, message: "price is required and must be a number" });
    }

    const safeTitle = String(title).trim();
    const baseSlug = slugify(safeTitle);
    const slug = await ensureUniqueSlug(baseSlug || `service-${Date.now()}`);

    // Determine active/status
    const resolvedActive =
      typeof active === "boolean"
        ? active
        : typeof isActive === "boolean"
          ? isActive
          : true;
    const resolvedStatus = status
      ? normalizeStatus(status)
      : resolvedActive
        ? "active"
        : "draft";

    // Normalize countries to array
    let resolvedCountries = ["Global"];
    if (countries) {
      if (Array.isArray(countries)) {
        resolvedCountries = countries.filter(Boolean);
      } else {
        resolvedCountries = String(countries).split(/,\s*/).filter(Boolean);
      }
      if (resolvedCountries.length === 0) resolvedCountries = ["Global"];
    }

    // PATCH_20: Normalize category and subcategory
    const resolvedCategory = normalizeCategory(category);
    const resolvedSubcategory = normalizeSubcategory(
      subcategory || listingType,
      resolvedCategory,
    );
    // Sync listingType with subcategory for backwards compatibility
    const resolvedListingType =
      resolvedSubcategory === "fresh_account" ||
      resolvedSubcategory === "already_onboarded"
        ? resolvedSubcategory
        : normalizeListingType(listingType);

    // PATCH_20: Parse countryPricing if provided
    let resolvedCountryPricing = {};
    if (countryPricing) {
      if (
        typeof countryPricing === "object" &&
        !Array.isArray(countryPricing)
      ) {
        resolvedCountryPricing = countryPricing;
      } else if (typeof countryPricing === "string") {
        try {
          resolvedCountryPricing = JSON.parse(countryPricing);
        } catch {
          // Ignore parse error, use empty object
        }
      }
    }

    const service = await Service.create({
      title: safeTitle,
      slug,
      category: resolvedCategory,
      subcategory: resolvedSubcategory, // PATCH_20: Set subcategory
      listingType: resolvedListingType,
      countries: resolvedCountries,
      countryPricing: resolvedCountryPricing, // PATCH_20: Country pricing
      platform: String(platform || "").trim(),
      subject: String(subject || "").trim(),
      projectName: String(projectName || "").trim(),
      payRate: parseNumber(payRate) || 0,
      instantDelivery: instantDelivery === true,
      status: resolvedStatus,
      active: resolvedActive,
      description: String(description || "").trim() || "",
      shortDescription: String(shortDescription || "").trim() || "",
      price: numericPrice,
      currency: String(currency || "USD").trim(),
      deliveryType: String(deliveryType || "manual").trim(),
      tags: Array.isArray(tags) ? tags.filter(Boolean) : [],
      features: Array.isArray(features) ? features.filter(Boolean) : [],
      createdBy: req.user?._id || req.user?.id || null,
    });

    console.log("[ADMIN_SERVICES] Service created:", service._id);

    return res.status(201).json({
      ok: true,
      message: "Service created",
      service,
      serviceId: service._id,
    });
  } catch (err) {
    // PATCH_20: Enhanced error logging
    console.error("[ADMIN_SERVICES_CREATE_ERROR]", {
      message: err?.message,
      name: err?.name,
      code: err?.code,
      stack: err?.stack?.split("\n").slice(0, 5).join("\n"),
    });

    // Handle Mongoose validation errors specifically
    if (err?.name === "ValidationError") {
      const details = Object.entries(err.errors || {}).map(([field, e]) => ({
        field,
        message: e.message,
      }));
      return res.status(400).json({
        ok: false,
        message: "Validation failed",
        details,
        error: err?.message,
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Failed to create service",
      error: err?.message,
    });
  }
};

// PATCH_18/20: Full Admin CMS - Update service with all fields
exports.updateService = async (req, res) => {
  try {
    const serviceId = req.params?.id || req.body?.serviceId;
    if (!serviceId) {
      return res.status(400).json({ ok: false, message: "serviceId required" });
    }

    // PATCH_20: Debug logging
    console.log("[ADMIN_SERVICES] updateService called", {
      serviceId,
      hasUser: !!req.user,
      bodyKeys: Object.keys(req.body || {}),
    });

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ ok: false, message: "Service not found" });
    }

    const {
      title,
      description,
      shortDescription,
      price,
      category,
      subcategory, // PATCH_20: Added subcategory
      listingType,
      countries,
      countryPricing, // PATCH_20: Country-based pricing
      platform,
      subject,
      projectName,
      payRate,
      instantDelivery,
      status,
      tags,
      features,
      active,
      currency,
      deliveryType,
    } = req.body || {};

    // Update fields if provided
    if (title !== undefined) {
      service.title = String(title).trim();
      service.slug = await ensureUniqueSlug(slugify(service.title));
    }
    if (description !== undefined)
      service.description = String(description).trim();
    if (shortDescription !== undefined)
      service.shortDescription = String(shortDescription).trim();
    if (price !== undefined) {
      const numeric = parseNumber(price);
      if (numeric !== null) service.price = numeric;
    }
    if (currency !== undefined) service.currency = String(currency).trim();
    if (deliveryType !== undefined)
      service.deliveryType = String(deliveryType).trim();

    // PATCH_18/20: Category/Subcategory/ListingType normalized
    if (category !== undefined) {
      service.category = normalizeCategory(category);
    }
    // PATCH_20: Handle subcategory
    if (subcategory !== undefined) {
      service.subcategory = normalizeSubcategory(subcategory, service.category);
      // Sync listingType with subcategory for backwards compatibility
      if (
        service.subcategory === "fresh_account" ||
        service.subcategory === "already_onboarded"
      ) {
        service.listingType = service.subcategory;
      }
    }
    if (listingType !== undefined && subcategory === undefined) {
      service.listingType = normalizeListingType(listingType);
    }

    // PATCH_20: Country-based pricing
    if (countryPricing !== undefined) {
      if (
        typeof countryPricing === "object" &&
        !Array.isArray(countryPricing)
      ) {
        service.countryPricing = countryPricing;
      } else if (typeof countryPricing === "string") {
        try {
          service.countryPricing = JSON.parse(countryPricing);
        } catch {
          // Ignore parse error
        }
      }
    }

    // PATCH_18: Countries - replace entire array
    if (countries !== undefined) {
      if (Array.isArray(countries)) {
        service.countries = countries.filter(Boolean);
      } else {
        service.countries = String(countries).split(/,\s*/).filter(Boolean);
      }
      if (service.countries.length === 0) service.countries = ["Global"];
    }

    // PATCH_18: New fields
    if (platform !== undefined) service.platform = String(platform).trim();
    if (subject !== undefined) service.subject = String(subject).trim();
    if (projectName !== undefined)
      service.projectName = String(projectName).trim();
    if (payRate !== undefined) {
      const numeric = parseNumber(payRate);
      if (numeric !== null) service.payRate = numeric;
    }
    if (typeof instantDelivery === "boolean")
      service.instantDelivery = instantDelivery;

    // Status and active sync
    if (status !== undefined) {
      service.status = normalizeStatus(status);
      service.active = service.status === "active";
    } else if (typeof active === "boolean") {
      service.active = active;
      if (active && service.status !== "active") service.status = "active";
      if (!active && service.status === "active") service.status = "draft";
    }

    // Arrays
    if (tags !== undefined)
      service.tags = Array.isArray(tags) ? tags.filter(Boolean) : [];
    if (features !== undefined)
      service.features = Array.isArray(features)
        ? features.filter(Boolean)
        : [];

    await service.save();

    console.log("[ADMIN_SERVICES] Service updated:", service._id);

    return res.json({ ok: true, message: "Service updated", service });
  } catch (err) {
    // PATCH_20: Enhanced error logging
    console.error("[ADMIN_SERVICES_UPDATE_ERROR]", {
      message: err?.message,
      name: err?.name,
      code: err?.code,
      stack: err?.stack?.split("\n").slice(0, 5).join("\n"),
    });

    // Handle Mongoose validation errors specifically
    if (err?.name === "ValidationError") {
      const details = Object.entries(err.errors || {}).map(([field, e]) => ({
        field,
        message: e.message,
      }));
      return res.status(400).json({
        ok: false,
        message: "Validation failed",
        details,
        error: err?.message,
      });
    }

    return res.status(500).json({
      ok: false,
      message: "Failed to update service",
      error: err?.message,
    });
  }
};

// PATCH_18: List all services for admin with optional filtering
// PATCH_20: Added no-cache headers
exports.listServices = async (req, res) => {
  try {
    setNoCache(res);
    const {
      status,
      category,
      listingType,
      limit = 200,
      page = 1,
    } = req.query || {};

    const filter = {};
    if (status && status !== "all") filter.status = normalizeStatus(status);
    if (category && category !== "all")
      filter.category = normalizeCategory(category);
    if (listingType && listingType !== "all")
      filter.listingType = normalizeListingType(listingType);

    const take = Math.min(parseInt(limit) || 200, 500);
    const skip = (parseInt(page) - 1) * take;

    const services = await Service.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(take)
      .lean();

    const total = await Service.countDocuments(filter);

    return res.json({
      ok: true,
      services,
      meta: {
        total,
        page: parseInt(page),
        limit: take,
        pages: Math.ceil(total / take),
      },
      enums: {
        categories: VALID_CATEGORIES,
        listingTypes: VALID_LISTING_TYPES,
        statuses: VALID_STATUSES,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Admin] listServices error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to list services",
      error: err?.message,
    });
  }
};

// PATCH_18: Get single service by ID for admin
// PATCH_20: Added no-cache headers
exports.getService = async (req, res) => {
  try {
    setNoCache(res);
    const serviceId = req.params?.id;
    if (!serviceId) {
      return res.status(400).json({ ok: false, message: "serviceId required" });
    }

    const service = await Service.findById(serviceId).lean();
    if (!service) {
      return res.status(404).json({ ok: false, message: "Service not found" });
    }

    return res.json({
      ok: true,
      service,
      enums: {
        categories: VALID_CATEGORIES,
        listingTypes: VALID_LISTING_TYPES,
        statuses: VALID_STATUSES,
      },
    });
  } catch (err) {
    console.error("[Admin] getService error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to get service",
      error: err?.message,
    });
  }
};

// PATCH_18: Activate service (status -> active)
exports.activateService = async (req, res) => {
  try {
    const serviceId = req.params?.id || req.body?.serviceId;
    if (!serviceId) {
      return res.status(400).json({ ok: false, message: "serviceId required" });
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ ok: false, message: "Service not found" });
    }

    service.status = "active";
    service.active = true;
    await service.save();

    return res.json({ ok: true, message: "Service activated", service });
  } catch (err) {
    console.error("[Admin] activateService error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to activate service",
      error: err?.message,
    });
  }
};

// PATCH_18: Deactivate service (status -> draft)
exports.deactivateService = async (req, res) => {
  try {
    const serviceId = req.params?.id || req.body?.serviceId;
    if (!serviceId) {
      return res.status(400).json({ ok: false, message: "serviceId required" });
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ ok: false, message: "Service not found" });
    }

    service.status = "draft";
    service.active = false;
    await service.save();

    return res.json({ ok: true, message: "Service deactivated", service });
  } catch (err) {
    console.error("[Admin] deactivateService error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to deactivate service",
      error: err?.message,
    });
  }
};

// PATCH_18: Archive service (status -> archived)
exports.archiveService = async (req, res) => {
  try {
    const serviceId = req.params?.id || req.body?.serviceId;
    if (!serviceId) {
      return res.status(400).json({ ok: false, message: "serviceId required" });
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ ok: false, message: "Service not found" });
    }

    service.status = "archived";
    service.active = false;
    await service.save();

    return res.json({ ok: true, message: "Service archived", service });
  } catch (err) {
    console.error("[Admin] archiveService error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to archive service",
      error: err?.message,
    });
  }
};

// PATCH_18: Delete service permanently
exports.deleteService = async (req, res) => {
  try {
    const serviceId = req.params?.id || req.body?.serviceId;
    if (!serviceId) {
      return res.status(400).json({ ok: false, message: "serviceId required" });
    }

    const service = await Service.findByIdAndDelete(serviceId);
    if (!service) {
      return res.status(404).json({ ok: false, message: "Service not found" });
    }

    return res.json({
      ok: true,
      message: "Service deleted permanently",
      serviceId: service._id,
    });
  } catch (err) {
    console.error("[Admin] deleteService error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to delete service",
      error: err?.message,
    });
  }
};

// Legacy endpoints for backward compatibility
exports.createDraftService = exports.createService;
exports.activateServiceByBody = exports.activateService;
