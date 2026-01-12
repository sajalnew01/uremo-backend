const express = require("express");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");
const {
  getAllOrders,
  getRejectedArchivedOrders,
  updateOrderStatus,
  addOrderNote,
  adminReplyToOrder,
  getAdminInbox,
  archiveRejectedOrder,
  unarchiveRejectedOrder,
  testEmail,
} = require("../controllers/admin.controller");
const {
  createEmailCampaign,
  listEmailCampaigns,
} = require("../controllers/admin.emailCampaign.controller");
const {
  getAllServices,
  createService,
  updateService,
  deleteService,
} = require("../controllers/service.controller");
const upload = require("../middlewares/upload.middleware");
const { uploadImages } = require("../controllers/upload.controller");

const router = express.Router();

router.get("/orders", auth, admin, getAllOrders);
router.get("/orders/rejected", auth, admin, getRejectedArchivedOrders);
router.get("/messages", auth, admin, getAdminInbox);
router.put("/orders/:id", auth, admin, updateOrderStatus);
router.put("/orders/:id/archive-rejected", auth, admin, archiveRejectedOrder);
router.put(
  "/orders/:id/unarchive-rejected",
  auth,
  admin,
  unarchiveRejectedOrder
);
router.post("/orders/:id/note", auth, admin, addOrderNote);
router.post("/orders/:id/reply", auth, admin, adminReplyToOrder);

// Debug/test email route (admin-only)
router.post("/test-email", auth, admin, testEmail);

// Promo email campaigns (admin-only)
router.post("/email-campaigns", auth, admin, createEmailCampaign);
router.get("/email-campaigns", auth, admin, listEmailCampaigns);

// Service management
router.get("/services", auth, admin, getAllServices);
router.post("/services", auth, admin, createService);
router.put("/services/:id", auth, admin, updateService);
router.delete("/services/:id", auth, admin, deleteService);

router.post(
  "/upload-images",
  auth,
  admin,
  upload.array("images", 5),
  uploadImages
);

module.exports = router;
