/**
 * PATCH_30: Admin Analytics Controller
 * Provides dashboard statistics and chart data for admin analytics
 */

const User = require("../models/User");
const Order = require("../models/Order");
const WalletTransaction = require("../models/WalletTransaction");
const Ticket = require("../models/Ticket");
const Rental = require("../models/Rental");
const AffiliateCommission = require("../models/AffiliateCommission");
const Service = require("../models/Service");

/**
 * Get admin dashboard analytics
 * GET /api/admin/analytics/dashboard
 */
exports.getAdminAnalytics = async (req, res) => {
  try {
    // Run all queries in parallel for performance
    const [
      totalUsers,
      totalOrders,
      completedOrders,
      processingOrders,
      pendingOrders,
      revenueAgg,
      walletAgg,
      pendingTickets,
      openTickets,
      activeRentals,
      totalRentals,
      affiliateAgg,
      totalServices,
      newUsersToday,
      ordersToday,
    ] = await Promise.all([
      User.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: "completed" }),
      Order.countDocuments({ status: "processing" }),
      Order.countDocuments({ status: "payment_pending" }),
      Order.aggregate([
        { $match: { status: { $in: ["completed", "processing"] } } },
        {
          $lookup: {
            from: "services",
            localField: "serviceId",
            foreignField: "_id",
            as: "service",
          },
        },
        { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$service.price", 0] } },
          },
        },
      ]),
      WalletTransaction.aggregate([
        { $match: { type: "credit" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Ticket.countDocuments({ status: "open" }),
      Ticket.countDocuments({ status: { $in: ["open", "in_progress"] } }),
      Rental.countDocuments({ status: "active" }),
      Rental.countDocuments(),
      AffiliateCommission.aggregate([
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Service.countDocuments(),
      User.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      Order.countDocuments({
        createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;
    const totalWalletVolume = walletAgg[0]?.total || 0;
    const affiliateEarnings = affiliateAgg[0]?.total || 0;

    res.json({
      ok: true,
      stats: {
        // Users
        totalUsers,
        newUsersToday,

        // Orders
        totalOrders,
        completedOrders,
        processingOrders,
        pendingOrders,
        ordersToday,

        // Revenue
        totalRevenue,
        totalWalletVolume,

        // Support
        pendingTickets,
        openTickets,

        // Rentals
        activeRentals,
        totalRentals,

        // Affiliate
        affiliateEarnings,

        // Services
        totalServices,
      },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ ok: false, message: "Analytics failed" });
  }
};

/**
 * Get chart data for analytics
 * GET /api/admin/analytics/charts
 */
exports.getCharts = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const [ordersPerDay, revenuePerDay, usersPerDay, ticketsPerDay] =
      await Promise.all([
        // Orders per day
        Order.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // Revenue per day (from completed/processing orders)
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate },
              status: { $in: ["completed", "processing"] },
            },
          },
          {
            $lookup: {
              from: "services",
              localField: "serviceId",
              foreignField: "_id",
              as: "service",
            },
          },
          { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              total: { $sum: { $ifNull: ["$service.price", 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // New users per day
        User.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // Tickets per day
        Ticket.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

    res.json({
      ok: true,
      period: { days, startDate },
      ordersPerDay,
      revenuePerDay,
      usersPerDay,
      ticketsPerDay,
    });
  } catch (err) {
    console.error("Charts error:", err);
    res.status(500).json({ ok: false, message: "Charts failed" });
  }
};

/**
 * Get system health status
 * GET /api/admin/analytics/health
 */
exports.getSystemHealth = async (req, res) => {
  try {
    const mongoose = require("mongoose");

    // Check database connection
    const dbStatus =
      mongoose.connection.readyState === 1 ? "connected" : "disconnected";

    // Get memory usage
    const memUsage = process.memoryUsage();

    // Get uptime
    const uptime = process.uptime();

    // Check recent errors (last hour of failed orders)
    const recentFailedOrders = await Order.countDocuments({
      status: "rejected",
      updatedAt: { $gte: new Date(Date.now() - 3600000) },
    });

    res.json({
      ok: true,
      health: {
        database: dbStatus,
        uptime: Math.floor(uptime),
        uptimeFormatted: formatUptime(uptime),
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
        },
        recentFailedOrders,
        serverTime: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({ ok: false, message: "Health check failed" });
  }
};

// Helper function to format uptime
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(" ") || "0m";
}
