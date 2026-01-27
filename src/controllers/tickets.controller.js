const Ticket = require("../models/Ticket");
const TicketMessage = require("../models/TicketMessage");
const Order = require("../models/Order");
const { sendNotification } = require("../services/notification.service");

// PATCH_31: FlowEngine for orchestrated state transitions
const FlowEngine = require("../core/flowEngine");

// Create a new ticket
exports.createTicket = async (req, res) => {
  try {
    const { subject, category, priority, orderId, message, attachments } =
      req.body;

    if (!subject || !message) {
      return res
        .status(400)
        .json({ message: "Subject and message are required" });
    }

    // PATCH_31: GUARDRAIL - Order-related tickets require a valid paid order
    if (category === "order" && orderId) {
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(400).json({
          message: "Invalid order ID provided",
        });
      }

      // Check if order belongs to this user
      if (order.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          message: "You can only create tickets for your own orders",
        });
      }

      // For order-related tickets, order must be in a paid/processing state
      const paidStatuses = [
        "processing",
        "completed",
        "approved",
        "pending_review",
        "assistance_required",
      ];
      if (!paidStatuses.includes(order.status)) {
        return res.status(400).json({
          message:
            "You can only create support tickets for orders that are being processed or completed. Please complete payment first.",
          orderStatus: order.status,
        });
      }
    }

    const ticket = await Ticket.create({
      user: req.user._id,
      subject,
      category: category || "other",
      priority: priority || "medium",
      order: orderId || null,
      lastMessageAt: new Date(),
      hasUnreadAdmin: true,
      hasUnreadUser: false,
    });

    // Validate attachments array if provided
    const validAttachments = Array.isArray(attachments)
      ? attachments.filter(
          (att) =>
            att &&
            typeof att.url === "string" &&
            typeof att.filename === "string" &&
            typeof att.fileType === "string",
        )
      : [];

    await TicketMessage.create({
      ticket: ticket._id,
      senderType: "user",
      sender: req.user._id,
      message,
      attachments: validAttachments,
    });

    // PATCH_29: Send notification to user confirming ticket creation
    try {
      await sendNotification({
        userId: req.user._id,
        title: "Support Ticket Created",
        message: `Your support ticket "${subject}" has been submitted. Our team will respond shortly.`,
        type: "ticket",
        resourceType: "ticket",
        resourceId: ticket._id,
      });
    } catch (notifErr) {
      console.error("[notification] ticket created failed:", notifErr.message);
    }

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

    const filter = { user: req.user._id };
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
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      user: req.user._id,
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
    // Verify user owns this ticket
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      user: req.user._id,
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
    const { message, attachment, attachments } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    // Verify user owns this ticket
    const ticket = await Ticket.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status === "closed") {
      return res
        .status(400)
        .json({ message: "Cannot reply to a closed ticket" });
    }

    // Validate attachments array if provided
    const validAttachments = Array.isArray(attachments)
      ? attachments.filter(
          (att) =>
            att &&
            typeof att.url === "string" &&
            typeof att.filename === "string" &&
            typeof att.fileType === "string",
        )
      : [];

    const msg = await TicketMessage.create({
      ticket: req.params.id,
      senderType: "user",
      sender: req.user._id,
      message,
      attachments: validAttachments,
      // Legacy field support
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
    const count = await Ticket.countDocuments({
      user: req.user._id,
      hasUnreadUser: true,
    });

    res.json({ ok: true, unreadCount: count });
  } catch (err) {
    console.error("getUnreadCount error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Get user's orders for ticket linking dropdown
exports.getUserOrdersForTicket = async (req, res) => {
  try {
    const Order = require("../models/Order");
    const orders = await Order.find({ user: req.user._id })
      .select("orderNumber status")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ ok: true, orders });
  } catch (err) {
    console.error("getUserOrdersForTicket error:", err);
    res.status(500).json({ message: err.message });
  }
};
