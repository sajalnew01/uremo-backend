const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getAllOrders,
  getRejectedArchivedOrders,
  updateOrderStatus,
  verifyPayment,
  addOrderNote,
  adminReplyToOrder,
  getAdminInbox,
  getAdminUnreadSnapshot,
  markOrderSupportRead,
  archiveRejectedOrder,
  unarchiveRejectedOrder,
  testEmail,
  getAllUsers,
  resetAllWallets,
  resetAllAffiliateData,
  resetAllTestData,
} = require("../controllers/admin.controller");
const {
  createEmailCampaign,
  listEmailCampaigns,
} = require("../controllers/admin.emailCampaign.controller");
const { userExists } = require("../controllers/admin.debug.controller");
// PATCH_18: Use adminServices controller for full CMS support
const {
  listServices,
  getService,
  createService,
  updateService,
  activateService,
  deactivateService,
  archiveService,
  deleteService,
} = require("../controllers/adminServices.controller");
const upload = require("../middlewares/upload.middleware");
const { uploadImages } = require("../controllers/upload.controller");
const {
  getAdminSettings,
  updateAdminSettings,
  getAdminSettingsRaw,
  putAdminSettingsRaw,
} = require("../controllers/siteSettings.controller");

const router = express.Router();

router.get("/orders", auth, admin, getAllOrders);
router.get("/orders/rejected", auth, admin, getRejectedArchivedOrders);
router.get("/orders/cancelled", auth, admin, getRejectedArchivedOrders); // PATCH_37: alias
router.get("/messages", auth, admin, getAdminInbox);
router.get("/messages/unread", auth, admin, getAdminUnreadSnapshot);
router.put("/orders/:id", auth, admin, updateOrderStatus);
router.put("/orders/:id/verify-payment", auth, admin, verifyPayment);
router.put("/orders/:id/archive-rejected", auth, admin, archiveRejectedOrder);
router.put("/orders/:id/archive-cancelled", auth, admin, archiveRejectedOrder); // PATCH_37: alias
router.put(
  "/orders/:id/unarchive-rejected",
  auth,
  admin,
  unarchiveRejectedOrder,
);
router.put(
  "/orders/:id/unarchive-cancelled",
  auth,
  admin,
  unarchiveRejectedOrder,
); // PATCH_37: alias
router.post("/orders/:id/note", auth, admin, addOrderNote);
router.post("/orders/:id/reply", auth, admin, adminReplyToOrder);
router.post("/orders/:id/support/mark-read", auth, admin, markOrderSupportRead);

// Debug/test email route (admin-only)
router.post("/test-email", auth, admin, testEmail);

// Debug helpers (admin-only)
router.get("/debug/user-exists", auth, admin, userExists);

// Promo email campaigns (admin-only)
router.post("/email-campaigns", auth, admin, createEmailCampaign);
router.get("/email-campaigns", auth, admin, listEmailCampaigns);

// PATCH_18: Full Admin CMS for services
router.get("/services", auth, admin, listServices);
router.get("/services/:id", auth, admin, getService);
router.post("/services", auth, admin, createService);
router.put("/services/:id", auth, admin, updateService);
router.put("/services/:id/activate", auth, admin, activateService);
router.put("/services/:id/deactivate", auth, admin, deactivateService);
router.put("/services/:id/archive", auth, admin, archiveService);
router.delete("/services/:id", auth, admin, deleteService);

router.post(
  "/upload-images",
  auth,
  admin,
  upload.array("images", 5),
  uploadImages,
);

// CMS / Settings (admin-only)
router.get("/settings", auth, admin, getAdminSettings);
router.put("/settings", auth, admin, updateAdminSettings);

// CMS / Settings raw JSON (admin-only)
router.get("/settings/raw", auth, admin, getAdminSettingsRaw);
router.put("/settings/raw", auth, admin, putAdminSettingsRaw);

// User management (admin-only)
router.get("/users", auth, admin, getAllUsers);

// ============================================
// ADMIN RESET ENDPOINTS - For production launch
// ============================================
// POST /api/admin/reset/wallets - Reset all wallet balances to 0
router.post("/reset/wallets", auth, admin, resetAllWallets);
// POST /api/admin/reset/affiliate - Reset all affiliate data
router.post("/reset/affiliate", auth, admin, resetAllAffiliateData);
// POST /api/admin/reset/all-test-data - Reset all test data (wallets + affiliate)
router.post("/reset/all-test-data", auth, admin, resetAllTestData);

module.exports = router;
