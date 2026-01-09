const Order = require("../models/Order");
const cloudinary = require("../config/cloudinary");

exports.uploadImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No images uploaded" });
    }

    const uploads = await Promise.all(
      req.files.map((file) =>
        cloudinary.uploader.upload(file.path, {
          folder: "uremo/services",
        })
      )
    );

    const urls = uploads.map((u) => u.secure_url);
    res.json({ urls });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.uploadPaymentProof = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "File required" });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "uremo/payments" },
      (error, uploadResult) => {
        if (error) {
          console.error(error);
          return res.status(500).json({ message: "Upload failed" });
        }

        res.json({ url: uploadResult.secure_url });
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.uploadPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Ownership check
    if (order.userId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File required" });
    }

    // Upload to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "payments" },
      async (error, uploadResult) => {
        if (error) {
          console.error(error);
          return res.status(500).json({ message: "Upload failed" });
        }

        order.paymentProof = uploadResult.secure_url;
        if (req.body?.paymentMethod) {
          order.paymentMethod = req.body.paymentMethod;
        }
        if (req.body?.transactionRef) {
          order.transactionRef = req.body.transactionRef;
        }
        order.status = "payment_submitted";
        await order.save();

        res.json({ message: "Payment proof uploaded" });
      }
    );

    uploadStream.end(req.file.buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

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
