const ServiceRequest = require("../models/ServiceRequest");

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

function normalizeUrgency(input) {
  const v = String(input || "")
    .trim()
    .toLowerCase();
  if (!v) return "";
  if (/(asap|urgent|now|today)/.test(v)) return "asap";
  if (/(week|7)/.test(v)) return "this_week";
  if (/(month|30)/.test(v)) return "this_month";
  if (/(flex|any|whenever|no rush)/.test(v)) return "flexible";
  if (["asap", "this_week", "this_month", "flexible"].includes(v)) return v;
  return "";
}

exports.createServiceRequest = async (req, res) => {
  try {
    const requestedService = clampString(req.body?.requestedService, 200);
    const platform = clampString(req.body?.platform, 120);
    const country = clampString(req.body?.country, 120);
    const urgency = normalizeUrgency(req.body?.urgency);
    const notes = clampString(req.body?.notes, 1200);

    const budgetRaw = req.body?.budget;
    const budget =
      budgetRaw === null || budgetRaw === undefined || budgetRaw === ""
        ? undefined
        : Number(budgetRaw);

    const budgetCurrency = clampString(req.body?.budgetCurrency, 8) || "USD";

    const name = clampString(req.body?.name, 120);
    const email = clampString(req.body?.email, 200).toLowerCase();

    const rawMessage = clampString(req.body?.rawMessage, 1200);

    if (!requestedService) {
      return res.status(400).json({ message: "requestedService is required" });
    }

    if (!platform) {
      return res.status(400).json({ message: "platform is required" });
    }

    if (!country) {
      return res.status(400).json({ message: "country is required" });
    }

    if (!urgency) {
      return res.status(400).json({ message: "urgency is required" });
    }

    const doc = await ServiceRequest.create({
      userId: req.user?.id || undefined,
      name,
      email,
      source: "public",
      rawMessage,
      requestedService,
      platform,
      country,
      urgency,
      budget: Number.isFinite(budget) ? budget : undefined,
      budgetCurrency,
      notes,
      status: "new",
      createdFrom: {
        page: clampString(req.body?.page, 120),
        userAgent: clampString(req.headers["user-agent"], 240),
      },
      events: [
        {
          type: "created",
          message: "Service request created via public endpoint",
          meta: { hasAuth: !!req.user?.id },
        },
      ],
    });

    return res.status(201).json({
      message: "Request created",
      requestId: String(doc._id),
    });
  } catch (err) {
    console.error("[SERVICE_REQUEST_CREATE_FAIL]", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getMyServiceRequests = async (req, res) => {
  try {
    const userId = req.user?.id;
    const items = await ServiceRequest.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(items);
  } catch (err) {
    console.error("[SERVICE_REQUEST_MY_LIST_FAIL]", err);
    return res.status(500).json({ message: "Server error" });
  }
};
