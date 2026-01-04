const Order = require("../models/Order");

exports.createOrder = async (req, res) => {
  try {
    const order = await Order.create({
      userId: req.user.id,
      serviceId: req.body.serviceId,
    });

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.myOrders = async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).populate(
      "serviceId"
    );
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
