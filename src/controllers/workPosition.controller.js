const mongoose = require("mongoose");
const WorkPosition = require("../models/WorkPosition");

const clampString = (value, maxLen) => {
  if (typeof value !== "string") return "";
  const out = value.trim();
  if (!out) return "";
  if (out.length <= maxLen) return out;
  return out.slice(0, maxLen);
};

const clampInt = (value, fallback = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
};

exports.listPublic = async (req, res, next) => {
  try {
    const positions = await WorkPosition.find({ active: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    res.json(positions);
  } catch (err) {
    next(err);
  }
};

exports.listAdmin = async (req, res, next) => {
  try {
    const positions = await WorkPosition.find()
      .sort({ active: -1, sortOrder: 1, createdAt: -1 })
      .lean();
    res.json(positions);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};

    const title = clampString(body.title, 80);
    const category = clampString(body.category, 48);
    const description = clampString(body.description, 800);
    const requirements = clampString(body.requirements, 1600);
    const active = body.active !== false;
    const sortOrder = clampInt(body.sortOrder, 0);

    if (!title) return res.status(400).json({ message: "Title is required" });
    if (!category)
      return res.status(400).json({ message: "Category is required" });

    const created = await WorkPosition.create({
      title,
      category,
      description,
      requirements,
      active,
      sortOrder,
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const body = req.body || {};

    const patch = {
      ...(body.title != null ? { title: clampString(body.title, 80) } : {}),
      ...(body.category != null
        ? { category: clampString(body.category, 48) }
        : {}),
      ...(body.description != null
        ? { description: clampString(body.description, 800) }
        : {}),
      ...(body.requirements != null
        ? { requirements: clampString(body.requirements, 1600) }
        : {}),
      ...(body.active != null ? { active: Boolean(body.active) } : {}),
      ...(body.sortOrder != null
        ? { sortOrder: clampInt(body.sortOrder, 0) }
        : {}),
    };

    const updated = await WorkPosition.findByIdAndUpdate(id, patch, {
      new: true,
      runValidators: true,
    });

    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id || ""))) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const deleted = await WorkPosition.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: "Not found" });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
