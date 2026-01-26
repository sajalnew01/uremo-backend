const Ticket = require("../models/Ticket");
const TicketMessage = require("../models/TicketMessage");

// Helper: Get user ID from normalized req.user (auth middleware uses .id)
const getUserId = (req) => req.user?.id || req.user?._id || req.user?.userId;

// Create a new ticket
exports.createTicket = async (req, res) => {
  try {
    const { subject, category, priority, orderId, message } = req.body;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!subject || !message) {
      return res
        .status(400)
        .json({ message: "Subject and message are required" });
    }

    const ticket = await Ticket.create({
      user: userId,
      subject,
      category: category || "other",
      priority: priority || "medium",
      order: orderId || null,
      lastMessageAt: new Date(),
      hasUnreadAdmin: true,
      hasUnreadUser: false,
    });

    await TicketMessage.create({
      ticket: ticket._id,
      senderType: "user",
      sender: userId,
      message,
    });

    res.status(201).json({ ok: true, ticket });
  } catch (err) {
    console.error("createTicket error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get user's tickets
exports.getUserTickets = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const userId = getUserId(req);

    const filter = { user: userId };
    if (status && status !== "all") {
      filter.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .populate("order", "orderNumber status")
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Ticket.countDocuments(filter),
    ]);

    res.json({
      ok: true,
      tickets,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error("getUserTickets error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get single ticket details
exports.getTicketById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      user: userId,
    })
      .populate("order", "orderNumber status totalAmount")
      .lean();

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Mark as read by user
    await Ticket.findByIdAndUpdate(req.params.id, { hasUnreadUser: false });

    res.json({ ok: true, ticket });
  } catch (err) {
    console.error("getTicketById error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get ticket messages
exports.getTicketMessages = async (req, res) => {
  try {
    const userId = getUserId(req);
    // Verify user owns this ticket
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const messages = await TicketMessage.find({ ticket: req.params.id })
      .sort({ createdAt: 1 })
      .lean();

    // Mark as read by user
    await Ticket.findByIdAndUpdate(req.params.id, { hasUnreadUser: false });

    res.json({ ok: true, messages });
  } catch (err) {
    console.error("getTicketMessages error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Reply to ticket (user)
exports.replyTicket = async (req, res) => {
  try {
    const { message, attachment } = req.body;
    const userId = getUserId(req);

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    // Verify user owns this ticket
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      user: userId,
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status === "closed") {
      return res
        .status(400)
        .json({ message: "Cannot reply to a closed ticket" });
    }

    const msg = await TicketMessage.create({
      ticket: req.params.id,
      senderType: "user",
      sender: userId,
      message,
      attachment: attachment || null,
    });

    // Update ticket
    await Ticket.findByIdAndUpdate(req.params.id, {
      lastMessageAt: new Date(),
      hasUnreadAdmin: true,
      hasUnreadUser: false,
      status: ticket.status === "closed" ? "open" : ticket.status,
    });

    res.json({ ok: true, message: msg });
  } catch (err) {
    console.error("replyTicket error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get unread count for user
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = getUserId(req);
    const count = await Ticket.countDocuments({
      user: userId,
      hasUnreadUser: true,
    });

    res.json({ ok: true, unreadCount: count });
  } catch (err) {
    console.error("getUnreadCount error:", err);
    res.status(500).json({ message: err.message });
  }
};
