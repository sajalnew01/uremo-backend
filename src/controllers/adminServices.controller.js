const Service = require("../models/Service");

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

exports.createDraftService = async (req, res) => {
  try {
    const {
      title,
      category,
      description,
      price,
      currency,
      deliveryType,
      active,
    } = req.body || {};

    const resolvedActive = typeof active === "boolean" ? active : true;

    if (!title || typeof title !== "string") {
      return res.status(400).json({
        success: false,
        message: "title is required",
      });
    }

    const numericPrice = parseNumber(price);
    if (numericPrice === null) {
      return res.status(400).json({
        success: false,
        message: "price is required and must be a number",
      });
    }

    const baseSlug = slugify(title);
    if (!baseSlug) {
      return res.status(400).json({
        success: false,
        message: "title must contain letters/numbers",
      });
    }

    const slug = await ensureUniqueSlug(baseSlug);

    const service = await Service.create({
      title: title.trim(),
      slug,
      category: (category || "general").trim(),
      description: (description || "Draft service").trim(),
      price: numericPrice,
      currency: (currency || "USD").trim(),
      deliveryType: (deliveryType || "manual").trim(),
      active: resolvedActive,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      data: service,
      message: "Service created",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to create service",
      error: err.message,
    });
  }
};

exports.activateService = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findByIdAndUpdate(
      id,
      { active: true, status: "active" },
      { new: true },
    );

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    return res.json({
      success: true,
      data: service,
      message: "Service activated",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to activate service",
      error: err.message,
    });
  }
};

// PATCH_12: Real admin create/activate/update helpers for JarvisX tools.
// NOTE: Service schema uses `active` boolean (no `status`).
// PATCH_15: Enhanced with vision-aligned fields (category, serviceType, countries, status)
exports.createService = async (req, res) => {
  try {
    const {
      title,
      price,
      description,
      category,
      serviceType,
      countries,
      status,
      tags,
      features,
      active,
      isActive,
    } = req.body || {};

    if (!title || price === undefined) {
      return res
        .status(400)
        .json({ ok: false, message: "Title and price are required" });
    }

    const safeTitle = String(title).trim();
    const numericPrice = parseNumber(price);
    if (!safeTitle || numericPrice === null) {
      return res
        .status(400)
        .json({ ok: false, message: "Title and price are required" });
    }

    const baseSlug = slugify(safeTitle);
    const slug = await ensureUniqueSlug(baseSlug || `service-${Date.now()}`);

    const resolvedActive =
      typeof active === "boolean"
        ? active
        : typeof isActive === "boolean"
          ? isActive
          : true;

    // PATCH_15: Normalize countries to array
    const resolvedCountries = countries
      ? Array.isArray(countries)
        ? countries
        : [countries]
      : ["Global"];

    const service = await Service.create({
      title: safeTitle,
      slug,
      category: String(category || "general").trim() || "general",
      serviceType: String(serviceType || "general").trim() || "general",
      countries: resolvedCountries,
      status: status || (resolvedActive ? "active" : "draft"),
      description: String(description || "").trim() || "Draft service",
      price: numericPrice,
      currency: "USD",
      deliveryType: "manual",
      active: resolvedActive,
      tags: Array.isArray(tags) ? tags : [],
      features: Array.isArray(features) ? features : [],
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

exports.activateServiceByBody = async (req, res) => {
  try {
    const { serviceId } = req.body || {};
    if (!serviceId) {
      return res.status(400).json({ ok: false, message: "serviceId required" });
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ ok: false, message: "Service not found" });
    }

    service.active = true;
    service.status = "active";
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

exports.updateService = async (req, res) => {
  try {
    const {
      serviceId,
      title,
      description,
      price,
      category,
      serviceType,
      countries,
      status,
      tags,
      features,
      active,
    } = req.body || {};
    if (!serviceId) {
      return res.status(400).json({ ok: false, message: "serviceId required" });
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ ok: false, message: "Service not found" });
    }

    if (title) {
      service.title = String(title).trim();
      service.slug = slugify(service.title);
    }
    if (description !== undefined) service.description = String(description);
    if (price !== undefined) {
      const numeric = parseNumber(price);
      if (numeric !== null) service.price = numeric;
    }
    if (typeof active === "boolean") {
      service.active = active;
      // Also sync status with active
      if (active && (!service.status || service.status === "draft")) {
        service.status = "active";
      }
    }

    // PATCH_15: Vision-aligned field updates
    if (category) service.category = String(category).trim();
    if (serviceType) service.serviceType = String(serviceType).trim();
    if (status) service.status = String(status).trim();
    if (Array.isArray(tags)) service.tags = tags;
    if (Array.isArray(features)) service.features = features;

    // PATCH_15: Countries array support
    if (countries) {
      const list = Array.isArray(countries)
        ? countries
        : String(countries).split(/,\s*/).filter(Boolean);

      // Merge with existing countries
      service.countries = Array.from(
        new Set([...(service.countries || []), ...list]),
      );
    }

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

// PATCH_13: Delete service endpoint
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
      message: "Service deleted",
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

// PATCH_15: List all services for admin (includes all statuses)
exports.listServices = async (req, res) => {
  try {
    const services = await Service.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({
      ok: true,
      services,
      count: services.length,
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
