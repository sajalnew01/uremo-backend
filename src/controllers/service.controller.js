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

// PATCH_15: Normalize category for vision-aligned filtering
function normalizeCategory(input) {
  if (!input) return null;
  const v = String(input).toLowerCase();
  if (v.includes("micro")) return "microjobs";
  if (v.includes("forex") || v.includes("crypto")) return "forex_crypto";
  if (v.includes("bank") || v.includes("gateway") || v.includes("wallet"))
    return "banks_gateways_wallets";
  return input;
}

// PATCH_15: Normalize serviceType for vision-aligned filtering
function normalizeServiceType(input) {
  if (!input) return null;
  const v = String(input).toLowerCase();
  if (v.includes("fresh")) return "fresh_profile";
  if (v.includes("already")) return "already_onboarded";
  if (v.includes("process")) return "interview_process";
  if (v.includes("passed")) return "interview_passed";
  return input;
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

    // PATCH_15: Enhanced filtering with vision-aligned parameters
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

    // PATCH_15: Support both status-based and active-based filtering
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

    // PATCH_15: Category filter (vision-aligned)
    const categoryRaw = String(category || req.query?.category || "").trim();
    if (categoryRaw && categoryRaw !== "all") {
      const normalizedCat = normalizeCategory(categoryRaw);
      filter.category = normalizedCat || categoryRaw;
    }

    // PATCH_15: ServiceType filter
    const serviceTypeRaw = String(serviceType || "").trim();
    if (serviceTypeRaw && serviceTypeRaw !== "all") {
      const normalizedType = normalizeServiceType(serviceTypeRaw);
      filter.serviceType = normalizedType || serviceTypeRaw;
    }

    // PATCH_15: Country filter (match includes OR Global fallback)
    const countryRaw = String(country || "").trim();
    if (countryRaw && countryRaw !== "all") {
      filter.countries = { $in: [countryRaw, "Global"] };
    }

    const take = Math.min(parseInt(limit) || 100, 200);
    const skip = (parseInt(page) - 1) * take;

    // PATCH_15: Sort mapping
    let sortOption = { createdAt: -1 };
    if (sort === "topViewed") sortOption = { viewCount: -1, createdAt: -1 };
    if (sort === "priceLow") sortOption = { price: 1 };
    if (sort === "priceHigh") sortOption = { price: -1 };

    const services = await Service.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(take)
      .lean();

    const total = await Service.countDocuments(filter);

    // PATCH_15: Provide available filters dynamically (active only)
    const activeFilter = { $or: [{ status: "active" }, { active: true }] };
    const [cats, types, cntries] = await Promise.all([
      Service.distinct("category", activeFilter),
      Service.distinct("serviceType", activeFilter),
      Service.distinct("countries", activeFilter),
    ]);

    if (process.env.DEBUG_REQUESTS === "1") {
      console.log("[SERVICES_LIST]", {
        path: req.originalUrl,
        filter: JSON.stringify(filter),
        count: Array.isArray(services) ? services.length : 0,
      });
    }

    // PATCH_15: Return enhanced response with filters and pagination
    return res.json({
      ok: true,
      services: Array.isArray(services) ? services : [],
      filters: {
        availableCategories: cats.filter(Boolean),
        availableServiceTypes: types.filter(Boolean),
        availableCountries: cntries.flat().filter(Boolean),
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
