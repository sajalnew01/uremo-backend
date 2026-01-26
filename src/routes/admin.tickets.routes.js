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
} = require("../controllers/adminTickets.controller");

// All routes require auth + admin
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all tickets
router.get("/", getAllTickets);

// Get unread count
router.get("/unread", getUnreadCount);

// Get single ticket
router.get("/:id", getTicketById);

// Get ticket messages
router.get("/:id/messages", getTicketMessages);

// Reply to ticket
router.post("/:id/reply", replyTicketAdmin);

// Update ticket status/priority
router.put("/:id/status", updateTicketStatus);

module.exports = router;
