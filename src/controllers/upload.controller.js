const Order = require("../models/Order");

exports.uploadProofs = async (req, res) => {
  try {
    const { orderId, email, phone } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Ownership check
    if (order.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Prevent re-upload
    if (order.documents?.paymentProof) {
      return res.status(400).json({ message: "Documents already uploaded" });
    }

    if (!req.files?.paymentProof || !req.files?.senderKyc) {
      return res.status(400).json({ message: "Both files required" });
    }

    order.documents = {
      paymentProof: req.files.paymentProof[0].path,
      senderKyc: req.files.senderKyc[0].path,
    };

    order.contact = { email, phone };
    order.status = "review";

    await order.save();
    res.json({ message: "Documents uploaded. Order under review." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
