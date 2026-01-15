const mongoose = require("mongoose");

const Service = require("../models/Service");
const PaymentMethod = require("../models/PaymentMethod");
const WorkPosition = require("../models/WorkPosition");
const SiteSettingsController = require("../controllers/siteSettings.controller");
const ServiceRequest = require("../models/ServiceRequest");
const cloudinary = require("../config/cloudinary");

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
      const imageUrl = clampString(payload.imageUrl, 500);
      const active = normalizeActive(payload.isActive, true);

      if (!title || !description || price == null) {
        const err = new Error("service.create missing required fields");
        err.status = 400;
        throw err;
      }

      const created = await Service.create({
        title,
        slug: slugify(title),
        category,
        description,
        price,
        deliveryType,
        imageUrl,
        active,
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
          "service.uploadHero requires imageUrl or remoteUrl"
        );
        err.status = 400;
        throw err;
      }

      const updated = await Service.findByIdAndUpdate(
        id,
        { imageUrl: finalUrl },
        { new: true, runValidators: true }
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
      const details = clampString(payload.details, 800);
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
};
