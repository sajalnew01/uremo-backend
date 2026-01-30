/**
 * PATCH_41: FAQ Routes
 */

const express = require("express");
const router = express.Router();
const faqController = require("../controllers/faq.controller");
const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

// Public routes
router.get("/", faqController.getAllFaqs);

// Admin routes
router.get("/admin", auth, admin, faqController.getAdminFaqs);
router.post("/", auth, admin, faqController.createFaq);
router.put("/:id", auth, admin, faqController.updateFaq);
router.delete("/:id", auth, admin, faqController.deleteFaq);

module.exports = router;
