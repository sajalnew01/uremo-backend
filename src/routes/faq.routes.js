/**
 * PATCH_41: FAQ Routes
 */

const express = require("express");
const router = express.Router();
const faqController = require("../controllers/faq.controller");
const { protect } = require("../middlewares/auth.middleware");
const { adminProtect } = require("../middlewares/admin.middleware");

// Public routes
router.get("/", faqController.getAllFaqs);

// Admin routes
router.get("/admin", protect, adminProtect, faqController.getAdminFaqs);
router.post("/", protect, adminProtect, faqController.createFaq);
router.put("/:id", protect, adminProtect, faqController.updateFaq);
router.delete("/:id", protect, adminProtect, faqController.deleteFaq);

module.exports = router;
