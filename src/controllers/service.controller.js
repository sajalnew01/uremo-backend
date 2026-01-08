const Service = require("../models/Service");

exports.getActiveServices = async (req, res) => {
  try {
    const services = await Service.find({ active: true });
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllServices = async (req, res) => {
  try {
    const services = await Service.find();
    res.json(services);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createService = async (req, res) => {
  try {
    const {
      name,
      platform,
      description,
      shortDescription,
      price,
      serviceType,
      images,
    } = req.body;

    if (!name || !platform || !price || !serviceType || !shortDescription) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const service = await Service.create({
      name,
      platform,
      description,
      shortDescription,
      price,
      serviceType,
      images: images || [],
      active: true,
    });

    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body;

    const service = await Service.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    res.json(service);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
