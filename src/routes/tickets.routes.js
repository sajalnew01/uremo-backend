const router = require("express").Router();
const authMiddleware = require("../middlewares/auth.middleware");

const {
  createTicket,
  getUserTickets,
  getTicketById,
  getTicketMessages,
  replyTicket,
  getUnreadCount,
} = require("../controllers/tickets.controller");

// All routes require authentication
router.use(authMiddleware);

// Create a new ticket
router.post("/", createTicket);

// Get user's tickets
router.get("/", getUserTickets);

// Get unread count
router.get("/unread", getUnreadCount);

// Get single ticket
router.get("/:id", getTicketById);

// Get ticket messages
router.get("/:id/messages", getTicketMessages);

// Reply to ticket
router.post("/:id/reply", replyTicket);

module.exports = router;
