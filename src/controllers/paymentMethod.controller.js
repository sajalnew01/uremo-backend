const PaymentMethod = require("../models/PaymentMethod");

exports.getAll = async (req, res) => {
  try {
    const methods = await PaymentMethod.find();
    res.json(methods);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getActive = async (req, res) => {
  try {
    const methods = await PaymentMethod.find({ active: true });
    res.json(methods);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { type, label, value, instructions } = req.body;

    if (!type || !label || !value) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const method = await PaymentMethod.create({
      type,
      label,
      value,
      instructions,
    });

    res.status(201).json(method);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const method = await PaymentMethod.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!method) {
      return res.status(404).json({ message: "Payment method not found" });
    }

    res.json(method);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
