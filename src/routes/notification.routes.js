const router = require("express").Router();
const authMiddleware = require("../middlewares/auth.middleware");
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} = require("../services/notification.service");

// All routes require authentication
router.use(authMiddleware);

// Get my notifications
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await getNotifications(req.user._id, { page, limit });

    res.json({
      ok: true,
      notifications: result.notifications,
      total: result.total,
      unreadCount: result.unreadCount,
      page: result.page,
      pages: result.pages,
    });
  } catch (err) {
    console.error("getNotifications error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Get unread count only
router.get("/unread-count", async (req, res) => {
  try {
    const count = await getUnreadCount(req.user._id);
    res.json({ ok: true, unreadCount: count });
  } catch (err) {
    console.error("getUnreadCount error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Mark single notification as read
router.put("/:id/read", async (req, res) => {
  try {
    const notification = await markAsRead(req.params.id, req.user._id);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ ok: true, notification });
  } catch (err) {
    console.error("markAsRead error:", err);
    res.status(500).json({ message: err.message });
  }
});

// Mark all notifications as read
router.put("/read-all", async (req, res) => {
  try {
    await markAllAsRead(req.user._id);
    res.json({ ok: true });
  } catch (err) {
    console.error("markAllAsRead error:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
