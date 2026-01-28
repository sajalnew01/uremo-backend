/**
 * PATCH_36: getServices Tool
 * Lists available services from the platform
 */

const Service = require("../../models/Service");

/**
 * Get available services
 * @param {Object} params - { category, limit, search }
 * @param {Object} context - { userId, userRole, isAdmin }
 * @returns {Promise<Object>}
 */
async function getServices(params, context) {
  const { category, limit = 10, search } = params;

  const query = { active: true };

  // Filter by category
  if (category && typeof category === "string") {
    const validCategories = [
      "microjobs",
      "forex_crypto",
      "banks_gateways_wallets",
      "general",
    ];
    if (validCategories.includes(category.toLowerCase())) {
      query.category = category.toLowerCase();
    }
  }

  // Search by title/description
  if (search && typeof search === "string" && search.trim()) {
    query.$or = [
      { title: { $regex: search.trim(), $options: "i" } },
      { description: { $regex: search.trim(), $options: "i" } },
    ];
  }

  const services = await Service.find(query)
    .select("_id title price description category serviceType imageUrl slug")
    .sort({ createdAt: -1 })
    .limit(Math.min(parseInt(limit) || 10, 30))
    .lean();

  if (!services || services.length === 0) {
    return {
      data: [],
      message: category
        ? `No services found in the "${category}" category.`
        : "No services available at the moment.",
    };
  }

  const formatted = services.map((s) => ({
    serviceId: s._id,
    title: s.title,
    price: s.price,
    description: s.description?.slice(0, 150) || "",
    category: s.category || "general",
    type: s.serviceType || "general",
    slug: s.slug,
    imageUrl: s.imageUrl || "",
  }));

  // Group by category for summary
  const byCategory = {};
  formatted.forEach((s) => {
    byCategory[s.category] = (byCategory[s.category] || 0) + 1;
  });

  return {
    data: formatted,
    summary: {
      total: services.length,
      byCategory,
    },
    message: `Found ${services.length} services. ${
      category ? `Filtered by: ${category}` : "Showing all categories."
    }`,
  };
}

module.exports = getServices;
