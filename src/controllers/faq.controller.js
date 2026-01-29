/**
 * PATCH_41: FAQ Controller
 * Handles FAQ CRUD operations
 */

const Faq = require("../models/Faq");

// Get all active FAQs (public)
exports.getAllFaqs = async (req, res) => {
  try {
    const { category } = req.query;

    const query = { active: true };
    if (category) {
      query.category = category;
    }

    const faqs = await Faq.find(query).sort({ order: 1, createdAt: 1 }).lean();

    res.json({ ok: true, faqs });
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

// Admin: Get all FAQs (including inactive)
exports.getAdminFaqs = async (req, res) => {
  try {
    const faqs = await Faq.find().sort({ order: 1, createdAt: 1 }).lean();

    res.json({ ok: true, faqs });
  } catch (error) {
    console.error("Error fetching admin FAQs:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

// Admin: Create FAQ
exports.createFaq = async (req, res) => {
  try {
    const { question, answer, category, order } = req.body;

    if (!question || !answer) {
      return res.status(400).json({
        ok: false,
        message: "Question and answer are required",
      });
    }

    const faq = await Faq.create({
      question,
      answer,
      category: category || "general",
      order: order || 0,
    });

    res.status(201).json({ ok: true, faq });
  } catch (error) {
    console.error("Error creating FAQ:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

// Admin: Update FAQ
exports.updateFaq = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, order, active } = req.body;

    const faq = await Faq.findByIdAndUpdate(
      id,
      { question, answer, category, order, active },
      { new: true, runValidators: true },
    );

    if (!faq) {
      return res.status(404).json({ ok: false, message: "FAQ not found" });
    }

    res.json({ ok: true, faq });
  } catch (error) {
    console.error("Error updating FAQ:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

// Admin: Delete FAQ
exports.deleteFaq = async (req, res) => {
  try {
    const { id } = req.params;

    const faq = await Faq.findByIdAndDelete(id);

    if (!faq) {
      return res.status(404).json({ ok: false, message: "FAQ not found" });
    }

    res.json({ ok: true, message: "FAQ deleted successfully" });
  } catch (error) {
    console.error("Error deleting FAQ:", error);
    res.status(500).json({ ok: false, message: error.message });
  }
};
