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
      { new: true }
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
