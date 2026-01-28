const router = require("express").Router();
const authMiddleware = require("../middlewares/auth.middleware");
const adminMiddleware = require("../middlewares/admin.middleware");

const {
  getAllTickets,
  getTicketById,
  getTicketMessages,
  replyTicketAdmin,
  updateTicketStatus,
  getUnreadCount,
  assignTicket,
  closeTicket,
  getAdminUsers,
  addInternalNote,
  getInternalNotes,
} = require("../controllers/adminTickets.controller");

// All routes require auth + admin
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all tickets
router.get("/", getAllTickets);

// Get unread count
router.get("/unread", getUnreadCount);

// Get admin users for assignment dropdown
router.get("/admins", getAdminUsers);

// Get single ticket
router.get("/:id", getTicketById);

// Get ticket messages
router.get("/:id/messages", getTicketMessages);

// Get internal notes
router.get("/:id/notes", getInternalNotes);

// Reply to ticket
router.post("/:id/reply", replyTicketAdmin);

// Add internal note
router.post("/:id/notes", addInternalNote);

// Update ticket status/priority
router.put("/:id/status", updateTicketStatus);

// Assign ticket to admin
router.put("/:id/assign", assignTicket);

// Close ticket
router.put("/:id/close", closeTicket);

module.exports = router;
