const Ticket = require("../models/Ticket");
const TicketMessage = require("../models/TicketMessage");

// Helper: Get user ID from normalized req.user (auth middleware uses .id)
const getUserId = (req) => req.user?.id || req.user?._id || req.user?.userId;

// Get all tickets with filters
exports.getAllTickets = async (req, res) => {
  try {
    const {
      status,
      category,
      priority,
      search,
      hasUnread,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};

    if (status && status !== "all") {
      filter.status = status;
    }
    if (category && category !== "all") {
      filter.category = category;
    }
    if (priority && priority !== "all") {
      filter.priority = priority;
    }
    if (hasUnread === "true") {
      filter.hasUnreadAdmin = true;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    let ticketsQuery = Ticket.find(filter)
      .populate("user", "name email")
      .populate("order", "orderNumber status")
      .sort({ hasUnreadAdmin: -1, lastMessageAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const [tickets, total, stats] = await Promise.all([
      ticketsQuery.lean(),
      Ticket.countDocuments(filter),
      Ticket.aggregate([
        {
          $group: {
            _id: null,
            open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
            inProgress: {
              $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] },
            },
            closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } },
            unread: { $sum: { $cond: ["$hasUnreadAdmin", 1, 0] } },
          },
        },
      ]),
    ]);

    // Apply search filter on populated fields
    let filteredTickets = tickets;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredTickets = tickets.filter(
        (t) =>
          t.subject?.toLowerCase().includes(searchLower) ||
          t.user?.email?.toLowerCase().includes(searchLower) ||
          t.user?.name?.toLowerCase().includes(searchLower),
      );
    }

    res.json({
      ok: true,
      tickets: filteredTickets,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      stats: stats[0] || { open: 0, inProgress: 0, closed: 0, unread: 0 },
    });
  } catch (err) {
    console.error("getAllTickets error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get single ticket for admin
exports.getTicketById = async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate("user", "name email")
      .populate("order", "orderNumber status totalAmount")
      .lean();

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Mark as read by admin
    await Ticket.findByIdAndUpdate(req.params.id, { hasUnreadAdmin: false });

    res.json({ ok: true, ticket });
  } catch (err) {
    console.error("getTicketById error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get ticket messages for admin
exports.getTicketMessages = async (req, res) => {
  try {
    const messages = await TicketMessage.find({ ticket: req.params.id })
      .populate("sender", "name email")
      .sort({ createdAt: 1 })
      .lean();

    // Mark as read by admin
    await Ticket.findByIdAndUpdate(req.params.id, { hasUnreadAdmin: false });

    res.json({ ok: true, messages });
  } catch (err) {
    console.error("getTicketMessages error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Reply to ticket (admin)
exports.replyTicketAdmin = async (req, res) => {
  try {
    const { message, attachment } = req.body;
    const adminId = getUserId(req);

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const msg = await TicketMessage.create({
      ticket: req.params.id,
      senderType: "admin",
      sender: adminId,
      message,
      attachment: attachment || null,
    });

    // Update ticket
    await Ticket.findByIdAndUpdate(req.params.id, {
      lastMessageAt: new Date(),
      hasUnreadAdmin: false,
      hasUnreadUser: true,
      status: ticket.status === "open" ? "in_progress" : ticket.status,
    });

    res.json({ ok: true, message: msg });
  } catch (err) {
    console.error("replyTicketAdmin error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Update ticket status
exports.updateTicketStatus = async (req, res) => {
  try {
    const { status, priority } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;

    const ticket = await Ticket.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    }).populate("user", "name email");

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    res.json({ ok: true, ticket });
  } catch (err) {
    console.error("updateTicketStatus error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get unread count for admin
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Ticket.countDocuments({ hasUnreadAdmin: true });
    res.json({ ok: true, unreadCount: count });
  } catch (err) {
    console.error("getUnreadCount error:", err);
    res.status(500).json({ message: err.message });
  }
};
