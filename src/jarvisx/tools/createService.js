/**
 * PATCH_36: createService Tool (Admin Only)
 * Creates a new service listing in the platform
 */

const Service = require("../../models/Service");

/**
 * Slugify helper
 */
function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Create a new service
 * @param {Object} params - { title, price, description, category, serviceType, countries, imageUrl }
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function createService(params, context) {
  const {
    title,
    price,
    description = "",
    category = "general",
    serviceType = "general",
    countries = [],
    imageUrl = "",
  } = params;

  if (!title || price === undefined) {
    return {
      data: null,
      message: "Title and price are required to create a service",
    };
  }

  const numericPrice = parseFloat(price);
  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return {
      data: null,
      message: "Invalid price value",
    };
  }

  // Normalize category
  const validCategories = [
    "microjobs",
    "forex_crypto",
    "banks_gateways_wallets",
    "general",
  ];
  const normalizedCategory = validCategories.includes(
    String(category).toLowerCase(),
  )
    ? String(category).toLowerCase()
    : "general";

  // Normalize service type
  const validTypes = [
    "fresh_profile",
    "already_onboarded",
    "interview_process",
    "interview_passed",
    "general",
  ];
  const normalizedType = validTypes.includes(String(serviceType).toLowerCase())
    ? String(serviceType).toLowerCase()
    : "general";

  // Generate unique slug
  const baseSlug = slugify(title);
  let slug = baseSlug || `service-${Date.now()}`;
  let suffix = 1;
  while (await Service.exists({ slug })) {
    suffix++;
    slug = `${baseSlug}-${suffix}`;
  }

  const service = await Service.create({
    title: String(title).trim(),
    slug,
    price: numericPrice,
    description: String(description).trim().slice(0, 2000),
    category: normalizedCategory,
    serviceType: normalizedType,
    countries: Array.isArray(countries) ? countries : [],
    imageUrl: String(imageUrl || "").trim(),
    active: true,
    createdBy: context.userId,
  });

  return {
    data: {
      serviceId: service._id,
      title: service.title,
      slug: service.slug,
      price: service.price,
      category: service.category,
      active: service.active,
      createdAt: service.createdAt,
    },
    message: `Service "${service.title}" created successfully at $${service.price}`,
    action: {
      type: "service_created",
      url: `/admin/services`,
    },
  };
}

module.exports = createService;
