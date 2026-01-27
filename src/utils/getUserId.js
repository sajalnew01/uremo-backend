/**
 * PATCH_32: User ID Fallback Helper
 * Safely extracts user ID from request object,
 * handling both req.user.id and req.user._id formats
 */
module.exports = (req) => {
  if (!req || !req.user) return null;
  return req.user.id || req.user._id || null;
};
