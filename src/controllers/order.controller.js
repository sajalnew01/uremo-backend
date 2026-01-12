const Order = require("../models/Order");
const Service = require("../models/Service");
const User = require("../models/User");

const { sendEmail, getAdminEmails } = require("../services/email.service");
const {
  paymentSubmitted,
  adminPaymentProofAlert,
  adminNewOrderAlert,
} = require("../emails/templates");

function fireAndForget(task, meta) {
  setImmediate(() => {
    Promise.resolve()
      .then(task)
      .catch((err) => {
        console.error("[email] async hook failed", {
          ...(meta || {}),
          message: err?.message || String(err),
        });
      });
  });
}

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
      reminderSent: false,
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

    // Email notifications (best-effort, non-blocking)
    const orderId = String(order._id);
    const userId = String(req.user.id);
    const serviceTitle = service?.title || "Service";
    fireAndForget(
      async () => {
        const admins = getAdminEmails();
        if (!admins.length) return;

        const user = await User.findById(userId).select("email").lean();
        await sendEmail({
          to: admins,
          subject: "Admin alert: new order created",
          html: adminNewOrderAlert({
            _id: orderId,
            status: "payment_pending",
            userEmail: user?.email || "",
            serviceTitle,
          }),
        });
      },
      { hook: "adminNewOrderAlert", orderId }
    );

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

    // Email notifications (best-effort, non-blocking)
    const orderId = String(order._id);
    fireAndForget(
      async () => {
        const hydratedOrder = await Order.findById(orderId).populate([
          { path: "userId", select: "email name" },
          { path: "serviceId", select: "title" },
        ]);
        if (!hydratedOrder) return;

        const userEmail = hydratedOrder.userId?.email;
        const serviceTitle = hydratedOrder.serviceId?.title || "Service";

        if (userEmail) {
          await sendEmail({
            to: userEmail,
            subject: "Payment proof received — UREMO",
            html: paymentSubmitted(hydratedOrder),
          });
        }

        const admins = getAdminEmails();
        if (admins.length) {
          await sendEmail({
            to: admins,
            subject: "Admin alert: payment proof submitted",
            html: adminPaymentProofAlert({
              _id: orderId,
              status: hydratedOrder.status,
              userEmail: userEmail || "",
              serviceTitle,
            }),
          });
        }
      },
      { hook: "paymentSubmitted", orderId }
    );

    res.json({
      message: "Payment submitted for verification",
      order,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
