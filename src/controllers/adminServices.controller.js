const Service = require("../models/Service");

// PATCH_18: Canonical enums (single source of truth)
const VALID_CATEGORIES = [
  "microjobs",
  "forex_crypto",
  "banks_gateways_wallets",
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

// PATCH_18: Normalize status to valid enum
function normalizeStatus(val) {
  const v = String(val || "")
    .toLowerCase()
    .trim();
  if (VALID_STATUSES.includes(v)) return v;
  return "draft";
}

// PATCH_18: Full Admin CMS - Create service with all fields
exports.createService = async (req, res) => {
  try {
    const {
      title,
      price,
      description,
      shortDescription,
      category,
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

    const service = await Service.create({
      title: safeTitle,
      slug,
      category: normalizeCategory(category),
      listingType: normalizeListingType(listingType),
      countries: resolvedCountries,
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

    return res.status(201).json({
      ok: true,
      message: "Service created",
      service,
      serviceId: service._id,
    });
  } catch (err) {
    console.error("[Admin] createService error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to create service",
      error: err?.message,
    });
  }
};

// PATCH_18: Full Admin CMS - Update service with all fields
exports.updateService = async (req, res) => {
  try {
    const serviceId = req.params?.id || req.body?.serviceId;
    if (!serviceId) {
      return res.status(400).json({ ok: false, message: "serviceId required" });
    }

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

    // PATCH_18: Category/ListingType normalized
    if (category !== undefined) service.category = normalizeCategory(category);
    if (listingType !== undefined)
      service.listingType = normalizeListingType(listingType);

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

    return res.json({ ok: true, message: "Service updated", service });
  } catch (err) {
    console.error("[Admin] updateService error:", err);
    return res.status(500).json({
      ok: false,
      message: "Failed to update service",
      error: err?.message,
    });
  }
};

// PATCH_18: List all services for admin with optional filtering
exports.listServices = async (req, res) => {
  try {
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
exports.getService = async (req, res) => {
  try {
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
