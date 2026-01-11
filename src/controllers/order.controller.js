const Order = require("../models/Order");
const Service = require("../models/Service");

const { sendEmail, getAdminEmails } = require("../services/email.service");
const {
  paymentSubmittedEmail,
  adminPaymentAlertEmail,
} = require("../emails/templates");

exports.createOrder = async (req, res) => {
  try {
    const service = await Service.findById(req.body.serviceId);

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    const order = await Order.create({
      userId: req.user.id,
      serviceId: req.body.serviceId,
      status: "payment_pending",
      payment: null,
      paidAt: null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      statusLog: [
        {
          text: "Order reserved (pending payment)",
          at: new Date(),
        },
      ],
      timeline: [
        {
          message: "Order reserved (pending payment)",
          by: "system",
        },
      ],
    });

    res.json({ orderId: order._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.myOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id })
      .populate("serviceId")
      .populate("payment.methodId");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("serviceId")
      .populate("payment.methodId");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // User can only view their own orders (admins can view any)
    const isAdmin = req.user?.role === "admin";
    if (!isAdmin && order.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.submitPayment = async (req, res) => {
  try {
    const { methodId, reference, proofUrl } = req.body;
    const { id } = req.params;

    if (!methodId || !proofUrl) {
      return res
        .status(400)
        .json({ message: "Payment method and proof are required" });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Ownership check
    if (order.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Prevent resubmission unless rejected
    if (order.status === "payment_submitted") {
      return res
        .status(400)
        .json({ message: "Payment already submitted for this order" });
    }

    if (!["payment_pending", "rejected"].includes(order.status)) {
      return res.status(400).json({
        message: `Cannot submit payment for an order in status: ${order.status}`,
      });
    }

    if (
      order.status === "payment_pending" &&
      order.expiresAt &&
      Date.now() > new Date(order.expiresAt).getTime()
    ) {
      order.statusLog = order.statusLog || [];
      order.statusLog.push({
        text: "Order expired (payment not submitted in time)",
        at: new Date(),
      });
      await order.save();
      return res.status(410).json({
        message: "Order reservation expired. Please buy the service again.",
      });
    }

    // Update order with payment info
    order.payment = {
      methodId,
      reference: reference || "",
      proofUrl,
      submittedAt: new Date(),
    };
    order.status = "payment_submitted";
    order.expiresAt = null;
    order.statusLog = order.statusLog || [];
    order.statusLog.push({
      text: "Payment proof submitted (awaiting verification)",
      at: new Date(),
    });
    order.timeline.push({
      message: "Payment submitted for verification",
      by: "system",
    });

    await order.save();

    // Email notifications (best-effort)
    try {
      await order.populate([
        { path: "userId", select: "email name" },
        { path: "serviceId", select: "title" },
      ]);

      const userEmail = order.userId?.email;
      const userName = order.userId?.name;
      const serviceTitle = order.serviceId?.title || "Service";

      if (userEmail) {
        await sendEmail({
          to: userEmail,
          subject: "Payment proof received — UREMO",
          html: paymentSubmittedEmail({
            name: userName,
            orderId: String(order._id),
            serviceTitle,
          }),
        });
      }

      const admins = getAdminEmails();
      if (admins.length) {
        await sendEmail({
          to: admins,
          subject: "Admin alert: payment proof submitted",
          html: adminPaymentAlertEmail({
            userEmail: userEmail || "",
            orderId: String(order._id),
            serviceTitle,
          }),
        });
      }
    } catch (err) {
      console.error("[email] payment submitted hooks failed", {
        orderId: String(order?._id || id),
        message: err?.message || String(err),
      });
    }

    res.json({
      message: "Payment submitted for verification",
      order,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
