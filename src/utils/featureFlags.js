/**
 * PATCH_48: Feature Flag Helpers
 * Controls visibility of proof-of-work system
 */

/**
 * Check if public proof display is enabled
 * When false, no public proof galleries or widgets are shown
 */
const isPublicProofEnabled = () => {
  const flag = process.env.SHOW_PUBLIC_PROOF;
  return flag === "true" || flag === "1";
};

module.exports = {
  isPublicProofEnabled,
};
