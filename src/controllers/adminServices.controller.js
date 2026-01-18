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
      active: Boolean(active) || false,
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
      { active: true },
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
exports.createService = async (req, res) => {
  try {
    const { title, price, description, category, tags } = req.body || {};

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

    const service = await Service.create({
      title: safeTitle,
      slug,
      category: String(category || "general").trim() || "general",
      description: String(description || "").trim() || "Draft service",
      price: numericPrice,
      currency: "USD",
      deliveryType: "manual",
      active: false,
      createdBy: req.user?._id || req.user?.id || null,
      // tags ignored unless schema adds it later
      _tags: Array.isArray(tags) ? tags : undefined,
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
    const { serviceId, title, description, price, countries, active } =
      req.body || {};
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
    if (typeof active === "boolean") service.active = active;

    // countries: only if schema supports it, otherwise append to description.
    if (countries) {
      const list = Array.isArray(countries)
        ? countries
        : String(countries).split(/,\s*/).filter(Boolean);

      if (
        service &&
        Object.prototype.hasOwnProperty.call(service.toObject(), "countries")
      ) {
        // @ts-ignore
        service.countries = Array.from(
          new Set([...(service.countries || []), ...list]),
        );
      } else {
        const current = service.description || "";
        service.description =
          `${current}\nAvailable countries: ${list.join(", ")}`.trim();
      }
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
