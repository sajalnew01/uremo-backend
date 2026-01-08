const Order = require("../models/Order");

exports.createOrder = async (req, res) => {
  try {
    const order = await Order.create({
      userId: req.user.id,
      serviceId: req.body.serviceId,
      status: "payment_pending",
    });

    res.json(order);
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

    // Prevent resubmission
    if (order.status === "payment_submitted") {
      return res
        .status(400)
        .json({ message: "Payment already submitted for this order" });
    }

    // Update order with payment info
    order.payment = {
      methodId,
      reference: reference || "",
      proofUrl,
      submittedAt: new Date(),
    };
    order.status = "payment_submitted";

    await order.save();

    res.json({
      message: "Payment submitted for verification",
      order,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
