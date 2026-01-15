const mongoose = require("mongoose");
const ServiceRequest = require("../models/ServiceRequest");

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

function buildQueryFromRequest(req) {
  const status = clampString(req.query?.status, 40);
  const source = clampString(req.query?.source, 40);
  const q = clampString(req.query?.q, 120);

  const query = {};

  if (status && status !== "all") {
    query.status = status;
  }

  if (source && source !== "all") {
    query.source = source;
  }

  // Date range
  const from = clampString(req.query?.from, 30);
  const to = clampString(req.query?.to, 30);

  if (from || to) {
    query.createdAt = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) query.createdAt.$gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) query.createdAt.$lte = d;
    }
    if (!Object.keys(query.createdAt).length) delete query.createdAt;
  }

  // Text search
  if (q) {
    query.$or = [
      { requestedService: { $regex: q, $options: "i" } },
      { rawMessage: { $regex: q, $options: "i" } },
      { platform: { $regex: q, $options: "i" } },
      { country: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { name: { $regex: q, $options: "i" } },
    ];
  }

  return query;
}

exports.listServiceRequests = async (req, res) => {
  try {
    const query = buildQueryFromRequest(req);

    const limitRaw = Number(req.query?.limit);
    const pageRaw = Number(req.query?.page);

    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, limitRaw))
      : 50;
    const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;

    const [items, total] = await Promise.all([
      ServiceRequest.find(query)
        .sort({ createdAt: -1, updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ServiceRequest.countDocuments(query),
    ]);

    return res.json({ items, total, page, limit });
  } catch (err) {
    console.error("[ADMIN_SERVICE_REQUEST_LIST_FAIL]", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getServiceRequestById = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const item = await ServiceRequest.findById(id).lean();
    if (!item) return res.status(404).json({ message: "Not found" });
    return res.json(item);
  } catch (err) {
    console.error("[ADMIN_SERVICE_REQUEST_GET_FAIL]", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateServiceRequest = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const allowedStatuses = new Set([
      "draft",
      "new",
      "contacted",
      "in_progress",
      "converted",
      "closed",
      "cancelled",
    ]);

    const patch = {};

    const status = clampString(req.body?.status, 40);
    if (status) {
      if (!allowedStatuses.has(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      patch.status = status;
    }

    if (typeof req.body?.adminNotes === "string") {
      patch.adminNotes = clampString(req.body.adminNotes, 4000);
    }

    if (typeof req.body?.requestedService === "string") {
      patch.requestedService = clampString(req.body.requestedService, 200);
    }
    if (typeof req.body?.platform === "string") {
      patch.platform = clampString(req.body.platform, 120);
    }
    if (typeof req.body?.country === "string") {
      patch.country = clampString(req.body.country, 120);
    }
    if (typeof req.body?.urgency === "string") {
      patch.urgency = clampString(req.body.urgency, 40);
    }

    const updated = await ServiceRequest.findByIdAndUpdate(
      id,
      {
        $set: patch,
        $push: {
          events: {
            type: "admin_update",
            message: "Updated by admin",
            meta: {
              adminId: req.user?.id,
              patchKeys: Object.keys(patch),
            },
          },
        },
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ message: "Not found" });

    return res.json(updated);
  } catch (err) {
    console.error("[ADMIN_SERVICE_REQUEST_UPDATE_FAIL]", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteServiceRequest = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const deleted = await ServiceRequest.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Not found" });

    return res.json({ message: "Deleted" });
  } catch (err) {
    console.error("[ADMIN_SERVICE_REQUEST_DELETE_FAIL]", err);
    return res.status(500).json({ message: "Server error" });
  }
};
