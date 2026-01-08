const Service = require("../models/Service");

exports.getActiveServices = async (req, res) => {
  try {
    const services = await Service.find({ active: true });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createService = async (req, res) => {
  try {
    const { name, platform, description, price, serviceType } = req.body;

    if (!serviceType) {
      return res.status(400).json({
        message: "serviceType is required",
      });
    }

    const service = await Service.create({
      name,
      platform,
      description,
      price,
      serviceType,
    });

    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
