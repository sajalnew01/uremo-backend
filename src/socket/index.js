/**
 * Socket.io server setup and event handlers for realtime chat.
 */
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Order = require("../models/Order");
const OrderMessage = require("../models/OrderMessage");
const mongoose = require("mongoose");

let io = null;

/**
 * Allowed origins for Socket.io CORS.
 */
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  return (
    origin === "https://uremo.online" ||
    origin === "https://www.uremo.online" ||
    origin === "http://localhost:3000" ||
    /^https:\/\/.*\.vercel\.app$/.test(origin)
  );
};

/**
 * Initialize Socket.io server on existing HTTP server.
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error("CORS blocked"), false);
      },
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.token;

      if (!token) {
        return next(new Error("No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
      const normalized = {
        ...(decoded && typeof decoded === "object" ? decoded : {}),
      };
      normalized.id =
        normalized.id || normalized._id || normalized.userId || normalized.uid;

      socket.user = normalized;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", handleConnection);

  console.log("[Socket.io] Initialized");
  return io;
}

/**
 * Handle new socket connection.
 */
async function handleConnection(socket) {
  const userId = socket.user?.id;
  const userRole = socket.user?.role;
  const isAdmin = userRole === "admin";

  console.log(`[Socket.io] Connected: userId=${userId} role=${userRole}`);

  // Join order room
  socket.on("join:order", async (data) => {
    const orderId = String(data?.orderId || "").trim();

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      socket.emit("error", { message: "Invalid orderId" });
      return;
    }

    // Check permission
    const order = await Order.findById(orderId).select("userId").lean();
    if (!order) {
      socket.emit("error", { message: "Order not found" });
      return;
    }

    const orderOwnerId = String(order.userId);
    const canJoin = isAdmin || orderOwnerId === String(userId);

    if (!canJoin) {
      socket.emit("error", { message: "Access denied" });
      return;
    }

    const room = `order:${orderId}`;
    socket.join(room);
    socket.currentOrderRoom = room;
    socket.currentOrderId = orderId;

    console.log(`[Socket.io] User ${userId} joined room ${room}`);

    // Send existing messages
    const messages = await OrderMessage.find({ orderId })
      .sort({ createdAt: 1 })
      .lean();

    socket.emit("messages:history", {
      orderId,
      messages: messages.map(normalizeMessage),
    });
  });

  // Leave order room
  socket.on("leave:order", () => {
    if (socket.currentOrderRoom) {
      socket.leave(socket.currentOrderRoom);
      console.log(
        `[Socket.io] User ${userId} left room ${socket.currentOrderRoom}`
      );
      socket.currentOrderRoom = null;
      socket.currentOrderId = null;
    }
  });

  // Send message
  socket.on("message:send", async (data) => {
    const orderId = socket.currentOrderId;
    const tempId = data?.tempId; // Client-side temp ID for optimistic UI
    const messageText = String(data?.message || "").trim();

    if (!orderId) {
      socket.emit("message:error", {
        tempId,
        error: "Not in an order room",
      });
      return;
    }

    if (!messageText) {
      socket.emit("message:error", {
        tempId,
        error: "Message is required",
      });
      return;
    }

    if (messageText.length > 2000) {
      socket.emit("message:error", {
        tempId,
        error: "Message too long (max 2000 characters)",
      });
      return;
    }

    try {
      const senderRole = isAdmin ? "admin" : "user";

      const created = await OrderMessage.create({
        orderId,
        senderId: userId,
        userId: userId,
        senderRole,
        message: messageText,
        status: "sent",
        createdAt: new Date(),
      });

      const payload = normalizeMessage(created.toObject());
      payload.tempId = tempId; // Include tempId for client reconciliation

      // Broadcast to all in room (including sender)
      const room = `order:${orderId}`;
      io.to(room).emit("message:new", payload);

      console.log(`[Socket.io] Message sent in ${room} by ${userId}`);
    } catch (err) {
      console.error("[Socket.io] message:send error:", err?.message);
      socket.emit("message:error", {
        tempId,
        error: "Failed to send message",
      });
    }
  });

  // Mark messages as delivered
  socket.on("message:delivered", async (data) => {
    const messageIds = Array.isArray(data?.messageIds) ? data.messageIds : [];
    const orderId = socket.currentOrderId;

    if (!orderId || messageIds.length === 0) return;

    try {
      await OrderMessage.updateMany(
        {
          _id: { $in: messageIds },
          orderId,
          status: "sent",
        },
        { $set: { status: "delivered", deliveredAt: new Date() } }
      );

      const room = `order:${orderId}`;
      io.to(room).emit("message:status", {
        messageIds,
        status: "delivered",
      });
    } catch (err) {
      console.error("[Socket.io] message:delivered error:", err?.message);
    }
  });

  // Mark messages as seen
  socket.on("message:seen", async (data) => {
    const messageIds = Array.isArray(data?.messageIds) ? data.messageIds : [];
    const orderId = socket.currentOrderId;

    if (!orderId || messageIds.length === 0) return;

    try {
      await OrderMessage.updateMany(
        {
          _id: { $in: messageIds },
          orderId,
          status: { $in: ["sent", "delivered"] },
        },
        { $set: { status: "seen", seenAt: new Date() } }
      );

      const room = `order:${orderId}`;
      io.to(room).emit("message:status", {
        messageIds,
        status: "seen",
      });
    } catch (err) {
      console.error("[Socket.io] message:seen error:", err?.message);
    }
  });

  // Typing indicator
  socket.on("typing:start", () => {
    const room = socket.currentOrderRoom;
    if (room) {
      socket.to(room).emit("typing:update", {
        userId,
        role: userRole,
        isTyping: true,
      });
    }
  });

  socket.on("typing:stop", () => {
    const room = socket.currentOrderRoom;
    if (room) {
      socket.to(room).emit("typing:update", {
        userId,
        role: userRole,
        isTyping: false,
      });
    }
  });

  // Disconnect
  socket.on("disconnect", (reason) => {
    console.log(`[Socket.io] Disconnected: userId=${userId} reason=${reason}`);
  });
}

/**
 * Normalize message for client.
 */
function normalizeMessage(msg) {
  return {
    _id: msg._id,
    id: msg._id,
    orderId: msg.orderId,
    senderId: msg.senderId,
    senderRole: msg.senderRole,
    message: msg.message,
    status: msg.status || "sent",
    createdAt: msg.createdAt,
    deliveredAt: msg.deliveredAt || null,
    seenAt: msg.seenAt || null,
  };
}

/**
 * Get the Socket.io instance (for broadcasting from other parts of the app).
 */
function getIO() {
  return io;
}

/**
 * Broadcast a message to an order room from external code (e.g., REST endpoint).
 */
function broadcastToOrder(orderId, event, payload) {
  if (!io) return;
  const room = `order:${orderId}`;
  io.to(room).emit(event, payload);
}

module.exports = {
  initSocket,
  getIO,
  broadcastToOrder,
};
