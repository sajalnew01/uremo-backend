const Order = require("../models/Order");
const cloudinary = require("../config/cloudinary");
const {
  inferResourceType,
  normalizeCloudinaryUrl,
} = require("../utils/cloudinaryUrl");

function serializeUpload(uploadResult) {
  if (!uploadResult) return null;
  return {
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    resourceType: uploadResult.resource_type,
    format: uploadResult.format,
  };
}

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

    const files = uploads.map(serializeUpload).filter(Boolean);
    const urls = files.map((f) => f.url);
    res.json({ urls, files });
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

    const resourceType = inferResourceType({ mimeType: req.file.mimetype });
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "uremo/payments",
        resource_type: resourceType,
      },
      (error, uploadResult) => {
        if (error) {
          console.error(error);
          return res.status(500).json({ message: "Upload failed" });
        }

        const payload = serializeUpload(uploadResult);
        res.json(payload);
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
    // Legacy endpoint: only uploads the file and returns a URL.
    // Order status transitions must go through PUT /api/orders/:id/payment.

    if (!req.file) {
      return res.status(400).json({ message: "File required" });
    }

    // Upload to Cloudinary
    const resourceType = inferResourceType({ mimeType: req.file.mimetype });
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "uremo/payments",
        resource_type: resourceType,
      },
      async (error, uploadResult) => {
        if (error) {
          console.error(error);
          return res.status(500).json({ message: "Upload failed" });
        }

        const payload = serializeUpload(uploadResult);
        res.json(payload);
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

    // NOTE: this legacy endpoint previously stored non-schema fields.
    // Keep behavior for status/contact, but always store viewable URLs.
    const paymentProofUrl = normalizeCloudinaryUrl(
      req.files.paymentProof[0].path
    );
    const senderKycUrl = normalizeCloudinaryUrl(req.files.senderKyc[0].path);

    order.documents = {
      paymentProof: paymentProofUrl,
      senderKyc: senderKycUrl,
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
