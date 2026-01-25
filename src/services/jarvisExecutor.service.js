const mongoose = require("mongoose");

const Service = require("../models/Service");
const PaymentMethod = require("../models/PaymentMethod");
const WorkPosition = require("../models/WorkPosition");
const Order = require("../models/Order");
const OrderMessage = require("../models/OrderMessage");
const SiteSettingsController = require("../controllers/siteSettings.controller");
const ServiceRequest = require("../models/ServiceRequest");
const cloudinary = require("../config/cloudinary");

// PATCH_23: Affiliate commission processing
const { processAffiliateCommission } = require("./affiliateCommission.service");

const MAX_ACTIONS_PER_PROPOSAL = 10;

function isPlainObject(v) {
  return (
    !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)
  );
}

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  return v.length <= maxLen ? v : v.slice(0, maxLen);
}

function stringifyDetails(value, maxLen = 800) {
  if (typeof value === "string") return clampString(value, maxLen);
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return clampString(String(value), maxLen);
  }
  if (isPlainObject(value) || Array.isArray(value)) {
    try {
      return clampString(JSON.stringify(value), maxLen);
    } catch {
      return "";
    }
  }
  return "";
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function slugify(str) {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function assertObjectId(id, name = "id") {
  const v = String(id || "").trim();
  if (!mongoose.Types.ObjectId.isValid(v)) {
    const err = new Error(`Invalid ${name}`);
    err.status = 400;
    throw err;
  }
  return v;
}

function normalizeActive(value, fallback) {
  if (typeof value === "boolean") return value;
  return fallback;
}

/**
 * P0 FIX: Service model required fields
 * These are the fields required to create a valid service
 */
const SERVICE_REQUIRED_FIELDS = ["title", "description", "price", "category"];

/**
 * P0 FIX: Default placeholder image when heroImage is missing
 */
const DEFAULT_SERVICE_HERO_IMAGE =
  "https://placehold.co/1280x720/0f172a/ffffff/png?text=UREMO+Service";

/**
 * P0 FIX: Validate proposal action payload before execution
 * Returns { valid: boolean, missingFields: string[], errors: string[] }
 */
function validateActionPayload(action) {
  const type = String(action?.type || "").trim();
  const payload = action?.payload;

  const result = { valid: true, missingFields: [], errors: [] };

  if (!type) {
    result.valid = false;
    result.errors.push("Missing action type");
    return result;
  }

  if (!isPlainObject(payload)) {
    result.valid = false;
    result.errors.push("Invalid action payload - must be an object");
    return result;
  }

  switch (type) {
    case "service.create": {
      // Check required fields for service creation
      if (!payload.title || String(payload.title).trim().length < 3) {
        result.missingFields.push("title (min 3 chars)");
      }
      if (
        !payload.description ||
        String(payload.description).trim().length < 10
      ) {
        result.missingFields.push("description (min 10 chars)");
      }
      if (payload.price == null || isNaN(Number(payload.price))) {
        result.missingFields.push("price (number)");
      }
      if (!payload.category || String(payload.category).trim().length < 2) {
        result.missingFields.push("category");
      }
      break;
    }

    case "service.update": {
      if (!payload.id) {
        result.missingFields.push("id (service ID to update)");
      }
      if (!payload.patch || !isPlainObject(payload.patch)) {
        result.missingFields.push("patch (object with fields to update)");
      }
      break;
    }

    case "service.delete": {
      if (!payload.id) {
        result.missingFields.push("id (service ID to delete)");
      }
      break;
    }

    case "paymentMethod.create": {
      if (!payload.name) result.missingFields.push("name");
      // details can be string or object; executor will stringify.
      if (!stringifyDetails(payload.details))
        result.missingFields.push("details");
      break;
    }

    case "workPosition.create": {
      if (!payload.title) result.missingFields.push("title");
      if (!payload.category) result.missingFields.push("category");
      break;
    }

    // =================
    // ORDERS (admin-only)
    // =================
    case "order.updateStatus": {
      if (!payload.id) result.missingFields.push("id (order ID)");
      if (!payload.status) result.missingFields.push("status");
      const status = String(payload.status || "").trim();
      const allowed = [
        "payment_pending",
        "payment_submitted",
        "processing",
        "completed",
        "rejected",
      ];
      if (status && !allowed.includes(status)) {
        result.errors.push(`Invalid status: ${status}`);
      }
      break;
    }

    case "order.verifyPayment": {
      if (!payload.id) result.missingFields.push("id (order ID)");
      break;
    }

    case "order.archiveRejected": {
      if (!payload.id) result.missingFields.push("id (order ID)");
      break;
    }

    case "order.unarchiveRejected": {
      if (!payload.id) result.missingFields.push("id (order ID)");
      break;
    }

    case "order.addNote": {
      if (!payload.id) result.missingFields.push("id (order ID)");
      if (!clampString(payload.message, 2000))
        result.missingFields.push("message");
      break;
    }

    case "order.delete": {
      if (!payload.id) result.missingFields.push("id (order ID)");
      if (payload.confirmDelete !== true) {
        result.missingFields.push("confirmDelete (must be true)");
      }
      break;
    }
  }

  if (result.missingFields.length > 0) {
    result.valid = false;
    result.errors.push(
      `Missing required fields: ${result.missingFields.join(", ")}`,
    );
  }

  return result;
}

/**
 * P0 FIX: Validate all actions in a proposal
 * Returns { valid: boolean, actionErrors: Array<{ index, type, errors, missingFields }> }
 */
function validateProposal(actions) {
  if (!Array.isArray(actions)) {
    return {
      valid: false,
      actionErrors: [
        { index: 0, type: "unknown", errors: ["actions must be an array"] },
      ],
    };
  }

  if (actions.length === 0) {
    return {
      valid: false,
      actionErrors: [
        { index: 0, type: "unknown", errors: ["No actions provided"] },
      ],
    };
  }

  const actionErrors = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const validation = validateActionPayload(action);

    if (!validation.valid) {
      actionErrors.push({
        index: i,
        type: String(action?.type || "unknown"),
        errors: validation.errors,
        missingFields: validation.missingFields,
      });
    }
  }

  return {
    valid: actionErrors.length === 0,
    actionErrors,
  };
}

async function executeAction(action, opts) {
  const type = String(action?.type || "").trim();
  const payload = action?.payload;
  const actorAdminId = opts?.actorAdminId || null;

  if (!type) {
    const err = new Error("Missing action type");
    err.status = 400;
    throw err;
  }

  if (!isPlainObject(payload)) {
    const err = new Error("Invalid action payload");
    err.status = 400;
    throw err;
  }

  switch (type) {
    // =================
    // SERVICES
    // =================
    case "service.create": {
      const title = clampString(payload.title, 120);
      const description = clampString(payload.description, 5000);
      const category = clampString(payload.category, 60) || "General";
      const price = toNumber(payload.price);
      const deliveryType = clampString(payload.deliveryType, 24) || "manual";
      // P0 FIX: Use placeholder image if not provided
      const imageUrl =
        clampString(payload.imageUrl, 500) || DEFAULT_SERVICE_HERO_IMAGE;
      const active = normalizeActive(payload.isActive, true);

      // PATCH_17: New vision-aligned fields
      const listingType = clampString(payload.listingType, 30) || "general";
      const platform = clampString(payload.platform, 60) || "";
      const subject = clampString(payload.subject, 60) || "";
      const projectName = clampString(payload.projectName, 60) || "";
      const payRate = toNumber(payload.payRate) || 0;
      const instantDelivery = payload.instantDelivery === true;

      // PATCH_17: Countries array
      const countriesRaw = payload.countries;
      const countries = Array.isArray(countriesRaw)
        ? countriesRaw.map((c) => clampString(c, 40)).filter(Boolean)
        : typeof countriesRaw === "string" && countriesRaw.trim()
          ? [clampString(countriesRaw, 40)]
          : ["Global"];

      if (!title || !description || price == null) {
        const err = new Error(
          `service.create missing required fields: ${[
            !title ? "title" : null,
            !description ? "description" : null,
            price == null ? "price" : null,
          ]
            .filter(Boolean)
            .join(", ")}`,
        );
        err.status = 400;
        throw err;
      }

      const created = await Service.create({
        title,
        slug: slugify(title),
        category,
        listingType,
        countries,
        platform,
        subject,
        projectName,
        payRate,
        instantDelivery,
        description,
        price,
        deliveryType,
        imageUrl,
        active,
        status: active ? "active" : "draft",
        createdBy: actorAdminId || undefined,
      });

      return {
        ok: true,
        entity: "service",
        id: created._id,
        undo: {
          type: "service.delete",
          payload: { id: String(created._id) },
          note: "Rollback: delete created service",
        },
      };
    }

    // =================
    // ORDERS (admin-only)
    // =================
    case "order.updateStatus": {
      const id = assertObjectId(payload.id, "order id");
      const status = clampString(payload.status, 40);
      const allowed = [
        "payment_pending",
        "payment_submitted",
        "processing",
        "completed",
        "rejected",
      ];
      if (!allowed.includes(status)) {
        const err = new Error("Invalid status");
        err.status = 400;
        throw err;
      }

      const order = await Order.findById(id);
      if (!order) {
        const err = new Error("Order not found");
        err.status = 404;
        throw err;
      }

      const prevStatus = String(order.status || "");
      order.status = status;

      order.statusLog = order.statusLog || [];
      if (
        prevStatus === "payment_submitted" &&
        ["processing", "completed"].includes(status)
      ) {
        order.statusLog.push({
          text: "Payment verified by admin",
          at: new Date(),
        });
      }

      if (status === "rejected") {
        order.statusLog.push({
          text: "Payment rejected — user must resubmit proof",
          at: new Date(),
        });
      } else {
        order.statusLog.push({
          text: `Status changed to: ${status}`,
          at: new Date(),
        });
      }

      order.timeline = order.timeline || [];
      order.timeline.push({
        message: `Status updated to ${status}`,
        by: "admin",
      });

      await order.save();
      return { id: String(order._id), status: order.status };
    }

    case "order.verifyPayment": {
      const id = assertObjectId(payload.id, "order id");
      const order = await Order.findById(id);
      if (!order) {
        const err = new Error("Order not found");
        err.status = 404;
        throw err;
      }

      if (order.status !== "payment_submitted") {
        const err = new Error(
          "Payment can only be verified when status is payment_submitted",
        );
        err.status = 400;
        throw err;
      }

      const now = new Date();
      order.status = "processing";
      order.payment = order.payment || {};
      order.payment.verifiedAt = now;

      order.statusLog = order.statusLog || [];
      order.statusLog.push({ text: "Payment verified by admin", at: now });

      order.timeline = order.timeline || [];
      order.timeline.push({
        message: "Payment verified by admin",
        by: "admin",
        createdAt: now,
      });

      await order.save();

      // PATCH_23: Process affiliate commission
      try {
        await processAffiliateCommission(order._id, "manual");
      } catch (affErr) {
        console.error("[jarvis] affiliate commission error:", affErr.message);
      }

      return {
        id: String(order._id),
        status: order.status,
        verifiedAt: now.toISOString(),
      };
    }

    case "order.archiveRejected": {
      const id = assertObjectId(payload.id, "order id");
      const order = await Order.findById(id);
      if (!order) {
        const err = new Error("Order not found");
        err.status = 404;
        throw err;
      }

      if (order.status !== "rejected") {
        const err = new Error("Only rejected orders can be archived");
        err.status = 400;
        throw err;
      }

      if (!order.isRejectedArchive) {
        order.isRejectedArchive = true;
        order.rejectedAt = new Date();

        order.statusLog = order.statusLog || [];
        order.statusLog.push({
          text: "Order archived to rejected list",
          at: new Date(),
        });

        order.timeline = order.timeline || [];
        order.timeline.push({
          message: "Order moved to rejected list",
          by: "admin",
        });

        await order.save();
      }

      return {
        id: String(order._id),
        isRejectedArchive: !!order.isRejectedArchive,
      };
    }

    case "order.unarchiveRejected": {
      const id = assertObjectId(payload.id, "order id");
      const order = await Order.findById(id);
      if (!order) {
        const err = new Error("Order not found");
        err.status = 404;
        throw err;
      }

      if (!order.isRejectedArchive) {
        const err = new Error("Order is not archived");
        err.status = 400;
        throw err;
      }

      order.isRejectedArchive = false;
      order.rejectedAt = null;

      order.statusLog = order.statusLog || [];
      order.statusLog.push({
        text: "Order unarchived from rejected list",
        at: new Date(),
      });

      order.timeline = order.timeline || [];
      order.timeline.push({
        message: "Order removed from rejected list",
        by: "admin",
      });

      await order.save();
      return {
        id: String(order._id),
        isRejectedArchive: !!order.isRejectedArchive,
      };
    }

    case "order.addNote": {
      const id = assertObjectId(payload.id, "order id");
      const message = clampString(payload.message, 2000);
      if (!message) {
        const err = new Error("Note message is required");
        err.status = 400;
        throw err;
      }

      const order = await Order.findById(id);
      if (!order) {
        const err = new Error("Order not found");
        err.status = 404;
        throw err;
      }

      order.timeline = order.timeline || [];
      order.timeline.push({ message, by: "admin" });
      await order.save();
      return { id: String(order._id) };
    }

    case "order.delete": {
      const id = assertObjectId(payload.id, "order id");
      const confirmDelete = payload.confirmDelete === true;
      const deleteMessages = payload.deleteMessages === true;

      if (!confirmDelete) {
        const err = new Error("order.delete requires confirmDelete: true");
        err.status = 400;
        throw err;
      }

      const order = await Order.findById(id).lean();
      if (!order) {
        const err = new Error("Order not found");
        err.status = 404;
        throw err;
      }

      await Order.deleteOne({ _id: id });
      if (deleteMessages) {
        await OrderMessage.deleteMany({ orderId: id });
      }

      return { id, deleted: true, deletedMessages: deleteMessages };
    }

    case "service.update": {
      const id = assertObjectId(payload.id, "service id");
      const patch = payload.patch;
      if (!isPlainObject(patch)) {
        const err = new Error("service.update patch must be an object");
        err.status = 400;
        throw err;
      }

      const update = {};
      if (patch.title != null) {
        const title = clampString(patch.title, 120);
        if (title) {
          update.title = title;
          update.slug = slugify(title);
        }
      }
      if (patch.description != null) {
        const d = clampString(patch.description, 5000);
        if (d) update.description = d;
      }
      if (patch.category != null)
        update.category = clampString(patch.category, 60);
      if (patch.imageUrl != null)
        update.imageUrl = clampString(patch.imageUrl, 500);
      if (patch.deliveryType != null)
        update.deliveryType = clampString(patch.deliveryType, 24);

      if (patch.price != null) {
        const p = toNumber(patch.price);
        if (p != null) update.price = p;
      }

      if (patch.isActive != null) update.active = Boolean(patch.isActive);

      const before = await Service.findById(id).lean();
      const updated = await Service.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      });

      if (!updated) {
        const err = new Error("Service not found");
        err.status = 404;
        throw err;
      }

      return {
        ok: true,
        entity: "service",
        id: updated._id,
        undo: before
          ? {
              type: "service.update",
              payload: {
                id: String(updated._id),
                patch: {
                  title: before.title,
                  description: before.description,
                  category: before.category,
                  price: before.price,
                  deliveryType: before.deliveryType,
                  imageUrl: before.imageUrl,
                  isActive: before.active,
                },
              },
              note: "Rollback: restore previous service fields",
            }
          : undefined,
      };
    }

    case "service.delete": {
      const id = assertObjectId(payload.id, "service id");
      const before = await Service.findById(id).lean();
      const deleted = await Service.findByIdAndDelete(id);
      if (!deleted) {
        const err = new Error("Service not found");
        err.status = 404;
        throw err;
      }
      return {
        ok: true,
        entity: "service",
        id: deleted._id,
        // Best-effort rollback: recreate.
        undo: before
          ? {
              type: "service.create",
              payload: {
                title: before.title,
                description: before.description,
                category: before.category,
                price: before.price,
                deliveryType: before.deliveryType,
                imageUrl: before.imageUrl,
                isActive: before.active,
              },
              note: "Rollback: recreate deleted service (new id)",
            }
          : undefined,
      };
    }

    case "service.uploadHero": {
      const id = assertObjectId(payload.id, "service id");
      const remoteUrl = clampString(payload.remoteUrl, 800);
      const imageUrl = clampString(payload.imageUrl, 800);

      const before = await Service.findById(id).lean();
      if (!before) {
        const err = new Error("Service not found");
        err.status = 404;
        throw err;
      }

      let finalUrl = imageUrl;
      if (!finalUrl && remoteUrl) {
        // Upload remote URL to Cloudinary (best-effort; requires configured env vars)
        const uploaded = await cloudinary.uploader.upload(remoteUrl, {
          folder: "uremo/services",
          overwrite: false,
        });
        finalUrl = clampString(uploaded?.secure_url, 800);
      }

      if (!finalUrl) {
        const err = new Error(
          "service.uploadHero requires imageUrl or remoteUrl",
        );
        err.status = 400;
        throw err;
      }

      const updated = await Service.findByIdAndUpdate(
        id,
        { imageUrl: finalUrl },
        { new: true, runValidators: true },
      );

      return {
        ok: true,
        entity: "service",
        id: updated?._id || id,
        undo: {
          type: "service.update",
          payload: {
            id,
            patch: { imageUrl: before.imageUrl || "" },
          },
          note: "Rollback: restore previous hero imageUrl",
        },
      };
    }

    // =================
    // PAYMENT METHODS
    // =================
    case "paymentMethod.create": {
      const name = clampString(payload.name, 80);
      const details = stringifyDetails(payload.details, 800);
      const instructions = clampString(payload.instructions, 1200);
      const active = normalizeActive(payload.isActive, true);

      if (!name || !details) {
        const err = new Error("paymentMethod.create missing required fields");
        err.status = 400;
        throw err;
      }

      const created = await PaymentMethod.create({
        name,
        // Preserve existing schema contract.
        type: clampString(payload.type, 24) || "bank",
        details,
        instructions,
        active,
      });

      return {
        ok: true,
        entity: "paymentMethod",
        id: created._id,
        undo: {
          type: "paymentMethod.delete",
          payload: { id: String(created._id) },
          note: "Rollback: delete created payment method",
        },
      };
    }

    case "paymentMethod.update": {
      const id = assertObjectId(payload.id, "payment method id");
      const patch = payload.patch;
      if (!isPlainObject(patch)) {
        const err = new Error("paymentMethod.update patch must be an object");
        err.status = 400;
        throw err;
      }

      const update = {};
      if (patch.name != null) update.name = clampString(patch.name, 80);
      if (patch.details != null)
        update.details = clampString(patch.details, 800);
      if (patch.instructions != null)
        update.instructions = clampString(patch.instructions, 1200);
      if (patch.type != null) update.type = clampString(patch.type, 24);
      if (patch.isActive != null) update.active = Boolean(patch.isActive);

      const before = await PaymentMethod.findById(id).lean();
      const updated = await PaymentMethod.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      });

      if (!updated) {
        const err = new Error("Payment method not found");
        err.status = 404;
        throw err;
      }

      return {
        ok: true,
        entity: "paymentMethod",
        id: updated._id,
        undo: before
          ? {
              type: "paymentMethod.update",
              payload: {
                id: String(updated._id),
                patch: {
                  name: before.name,
                  type: before.type,
                  details: before.details,
                  instructions: before.instructions,
                  isActive: before.active,
                },
              },
              note: "Rollback: restore previous payment method fields",
            }
          : undefined,
      };
    }

    case "paymentMethod.delete": {
      const id = assertObjectId(payload.id, "payment method id");
      const before = await PaymentMethod.findById(id).lean();
      const deleted = await PaymentMethod.findByIdAndDelete(id);
      if (!deleted) {
        const err = new Error("Payment method not found");
        err.status = 404;
        throw err;
      }
      return {
        ok: true,
        entity: "paymentMethod",
        id: deleted._id,
        undo: before
          ? {
              type: "paymentMethod.create",
              payload: {
                name: before.name,
                type: before.type,
                details: before.details,
                instructions: before.instructions,
                isActive: before.active,
              },
              note: "Rollback: recreate deleted payment method (new id)",
            }
          : undefined,
      };
    }

    // =================
    // WORK POSITIONS
    // =================
    case "workPosition.create": {
      const title = clampString(payload.title, 80);
      const category = clampString(payload.category, 48);
      const description = clampString(payload.description, 800);
      const requirements = clampString(payload.requirements, 1600);
      const active = normalizeActive(payload.isActive, true);

      if (!title || !category) {
        const err = new Error("workPosition.create missing required fields");
        err.status = 400;
        throw err;
      }

      const created = await WorkPosition.create({
        title,
        category,
        description,
        requirements,
        active,
      });

      return {
        ok: true,
        entity: "workPosition",
        id: created._id,
        undo: {
          type: "workPosition.delete",
          payload: { id: String(created._id) },
          note: "Rollback: delete created work position",
        },
      };
    }

    case "workPosition.update": {
      const id = assertObjectId(payload.id, "work position id");
      const patch = payload.patch;
      if (!isPlainObject(patch)) {
        const err = new Error("workPosition.update patch must be an object");
        err.status = 400;
        throw err;
      }

      const update = {};
      if (patch.title != null) update.title = clampString(patch.title, 80);
      if (patch.category != null)
        update.category = clampString(patch.category, 48);
      if (patch.description != null)
        update.description = clampString(patch.description, 800);
      if (patch.requirements != null)
        update.requirements = clampString(patch.requirements, 1600);
      if (patch.isActive != null) update.active = Boolean(patch.isActive);
      if (patch.sortOrder != null)
        update.sortOrder = Math.trunc(Number(patch.sortOrder) || 0);

      const before = await WorkPosition.findById(id).lean();
      const updated = await WorkPosition.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
      });

      if (!updated) {
        const err = new Error("Work position not found");
        err.status = 404;
        throw err;
      }

      return {
        ok: true,
        entity: "workPosition",
        id: updated._id,
        undo: before
          ? {
              type: "workPosition.update",
              payload: {
                id: String(updated._id),
                patch: {
                  title: before.title,
                  category: before.category,
                  description: before.description,
                  requirements: before.requirements,
                  isActive: before.active,
                  sortOrder: before.sortOrder,
                },
              },
              note: "Rollback: restore previous work position fields",
            }
          : undefined,
      };
    }

    case "workPosition.delete": {
      const id = assertObjectId(payload.id, "work position id");
      const before = await WorkPosition.findById(id).lean();
      const deleted = await WorkPosition.findByIdAndDelete(id);
      if (!deleted) {
        const err = new Error("Work position not found");
        err.status = 404;
        throw err;
      }
      return {
        ok: true,
        entity: "workPosition",
        id: deleted._id,
        undo: before
          ? {
              type: "workPosition.create",
              payload: {
                title: before.title,
                category: before.category,
                description: before.description,
                requirements: before.requirements,
                isActive: before.active,
              },
              note: "Rollback: recreate deleted work position (new id)",
            }
          : undefined,
      };
    }

    // =================
    // SETTINGS
    // =================
    case "settings.update": {
      const patch = payload.patch;
      if (!isPlainObject(patch)) {
        const err = new Error("settings.update patch must be an object");
        err.status = 400;
        throw err;
      }

      // Best-effort rollback: snapshot current settings before patch.
      const before = await SiteSettingsController.getAdminSettingsObject();

      await SiteSettingsController.applyAdminSettingsPatch({
        patch,
        updatedBy: actorAdminId,
      });

      return {
        ok: true,
        entity: "settings",
        id: "main",
        undo: before
          ? {
              type: "settings.update",
              payload: {
                patch: {
                  site: before.site,
                  support: before.support,
                  footer: before.footer,
                  landing: before.landing,
                  payment: before.payment,
                  orders: before.orders,
                  services: before.services,
                  orderSupport: before.orderSupport,
                  applyWork: before.applyWork,
                },
              },
              note: "Rollback: restore full settings snapshot",
            }
          : undefined,
      };
    }

    // =================
    // SERVICE REQUESTS
    // =================
    case "serviceRequest.create": {
      const requestedService = clampString(payload.requestedService, 200);
      const platform = clampString(payload.platform, 120);
      const country = clampString(payload.country, 120);
      const urgency = clampString(payload.urgency, 40);
      const notes = clampString(payload.notes, 1200);
      const rawMessage = clampString(payload.rawMessage, 1200);

      const created = await ServiceRequest.create({
        userId:
          payload.userId &&
          mongoose.Types.ObjectId.isValid(String(payload.userId))
            ? payload.userId
            : undefined,
        email: clampString(payload.email, 200).toLowerCase(),
        name: clampString(payload.name, 120),
        source: clampString(payload.source, 20) || "public",
        rawMessage,
        requestedService,
        platform,
        country,
        urgency,
        budget:
          payload.budget === null || payload.budget === undefined
            ? undefined
            : Number(payload.budget),
        budgetCurrency: clampString(payload.budgetCurrency, 8) || "USD",
        notes,
        status: "new",
        events: [
          {
            type: "created",
            message: "Created by JarvisX tool",
            meta: { actorAdminId },
          },
        ],
      });

      return {
        ok: true,
        entity: "serviceRequest",
        id: created._id,
        undo: {
          type: "serviceRequest.create",
          payload: {
            requestedService: "ROLLBACK_PLACEHOLDER",
          },
          note: "Rollback not supported for serviceRequest.create (manual delete)",
        },
      };
    }

    default: {
      const err = new Error(`Unsupported action type: ${type}`);
      err.status = 400;
      throw err;
    }
  }
}

module.exports = {
  MAX_ACTIONS_PER_PROPOSAL,
  executeAction,
  // P0 FIX: Export validation functions
  validateActionPayload,
  validateProposal,
  SERVICE_REQUIRED_FIELDS,
  DEFAULT_SERVICE_HERO_IMAGE,
};
