const Order = require("../models/Order");
const Service = require("../models/Service");

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

    // User can only view their own orders
    if (order.userId.toString() !== req.user.id) {
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
    order.timeline.push({
      message: "Payment submitted for verification",
      by: "system",
    });

    await order.save();

    res.json({
      message: "Payment submitted for verification",
      order,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
