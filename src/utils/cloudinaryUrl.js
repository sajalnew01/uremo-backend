const cloudinary = require("../config/cloudinary");

function ensureHttps(url) {
  if (typeof url !== "string") return url;
  if (url.startsWith("https://")) return url;
  if (url.startsWith("http://"))
    return `https://${url.slice("http://".length)}`;
  return url;
}

function looksLikeUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function inferResourceType({ url, mimeType, publicId } = {}) {
  const candidate = String(mimeType || "").toLowerCase();
  if (candidate.startsWith("image/")) return "image";
  if (candidate.includes("pdf")) return "raw";

  const ref = String(url || publicId || "").toLowerCase();
  if (ref.includes("/raw/upload/") || ref.endsWith(".pdf")) return "raw";
  return "image";
}

function normalizeCloudinaryUrl(fileRef, options = {}) {
  if (!fileRef) return fileRef;

  if (looksLikeUrl(fileRef)) {
    return ensureHttps(fileRef);
  }

  // If the DB stores public_id instead of a full URL, reconstruct a secure URL.
  const explicitResourceType = String(options.resourceType || "").trim();
  const resourceType = explicitResourceType
    ? explicitResourceType
    : inferResourceType({
        publicId: fileRef,
        mimeType: options.mimeType,
      });

  try {
    return cloudinary.url(fileRef, {
      secure: true,
      resource_type: resourceType,
    });
  } catch (e) {
    return fileRef;
  }
}

module.exports = {
  ensureHttps,
  normalizeCloudinaryUrl,
  inferResourceType,
};
