/**
 * PATCH_51: JarvisX Response Blueprints
 * Pre-defined response templates for each intent
 * LLM only polishes these, never generates from scratch
 */

const { INTENTS } = require("./intents");

/**
 * Generate response blueprint based on intent and context
 * @param {string} intent - Detected intent
 * @param {Object} contextData - Data from context builder
 * @returns {Object} Response blueprint
 */
function getBlueprint(intent, contextData) {
  const data = contextData.data || {};

  switch (intent) {
    // =========== GREETINGS ===========
    case INTENTS.GREETING: {
      const greeting = contextData.isAuthenticated
        ? "Hey! Welcome back to UREMO."
        : "Hey! Welcome to UREMO.";
      return {
        text: `${greeting} How can I help you today?`,
        actions: [
          {
            label: "Explore Services",
            action: "NAVIGATE",
            url: "/explore-services",
          },
          { label: "Apply to Work", action: "NAVIGATE", url: "/apply-to-work" },
          { label: "Check Orders", action: "INTENT", value: "MY_ORDERS" },
        ],
      };
    }

    // =========== EXPLORE SERVICES ===========
    case INTENTS.EXPLORE_SERVICES: {
      const count = data.serviceCount || 0;
      if (count === 0) {
        return {
          text: "We're setting up new services. Check back soon!",
          actions: [
            {
              label: "Apply to Work",
              action: "NAVIGATE",
              url: "/apply-to-work",
            },
          ],
        };
      }
      return {
        text: `We have ${count} active services available. What are you looking for?`,
        list: data.services?.slice(0, 5),
        listType: "services",
        actions: [
          {
            label: "Browse All Services",
            action: "NAVIGATE",
            url: "/explore-services",
          },
          {
            label: "Custom Request",
            action: "INTENT",
            value: "CUSTOM_SERVICE_REQUEST",
          },
        ],
      };
    }

    // =========== BUY SERVICE ===========
    case INTENTS.BUY_SERVICE: {
      return {
        text: "I can help you purchase a service. Browse our catalog to find what you need.",
        actions: [
          {
            label: "Browse Services",
            action: "NAVIGATE",
            url: "/explore-services",
          },
          { label: "My Wallet", action: "NAVIGATE", url: "/wallet" },
        ],
      };
    }

    // =========== APPLY TO WORK ===========
    case INTENTS.APPLY_TO_WORK: {
      const count = data.positionCount || 0;
      if (count === 0) {
        return {
          text: "No open positions right now, but we're always looking for talent. Check back soon!",
          actions: [],
        };
      }
      return {
        text: `We have ${count} job roles open! Apply to start earning.`,
        list: data.positions?.slice(0, 5),
        listType: "positions",
        actions: [
          {
            label: "View All Positions",
            action: "NAVIGATE",
            url: "/apply-to-work",
          },
        ],
      };
    }

    // =========== ORDERS ===========
    case INTENTS.MY_ORDERS: {
      if (!contextData.isAuthenticated) {
        return {
          text: "Please log in to view your orders.",
          actions: [{ label: "Log In", action: "NAVIGATE", url: "/login" }],
        };
      }
      const orders = data.orders || [];
      if (orders.length === 0) {
        return {
          text: "You don't have any orders yet.",
          actions: [
            {
              label: "Browse Services",
              action: "NAVIGATE",
              url: "/explore-services",
            },
          ],
        };
      }
      return {
        text: `You have ${orders.length} order(s). Here are the recent ones:`,
        list: orders.slice(0, 5),
        listType: "orders",
        actions: [
          { label: "View All Orders", action: "NAVIGATE", url: "/orders" },
        ],
      };
    }

    case INTENTS.ORDER_STATUS: {
      if (!contextData.isAuthenticated) {
        return {
          text: "Please log in to check your order status.",
          actions: [{ label: "Log In", action: "NAVIGATE", url: "/login" }],
        };
      }
      // Show actual orders if available
      const orders = data.orders || data.data || [];
      if (Array.isArray(orders) && orders.length > 0) {
        const latest = orders[0];
        return {
          text: `Your latest order is "${latest.service || "Service"}" — Status: ${latest.status || "pending"}`,
          list: orders.slice(0, 3),
          listType: "orders",
          actions: [
            { label: "View All Orders", action: "NAVIGATE", url: "/orders" },
            {
              label: "Create Ticket",
              action: "INTENT",
              value: "SUPPORT_TICKET",
            },
          ],
        };
      }
      return {
        text: "You can track all your orders from the Orders page.",
        actions: [
          { label: "View Orders", action: "NAVIGATE", url: "/orders" },
          { label: "Create Ticket", action: "INTENT", value: "SUPPORT_TICKET" },
        ],
      };
    }

    // =========== RENTALS ===========
    case INTENTS.MY_RENTALS: {
      if (!contextData.isAuthenticated) {
        return {
          text: "Please log in to view your rentals.",
          actions: [{ label: "Log In", action: "NAVIGATE", url: "/login" }],
        };
      }
      const rentals = data.rentals || [];
      if (rentals.length === 0) {
        return {
          text: "You don't have any active rentals.",
          actions: [
            {
              label: "Browse Rentals",
              action: "NAVIGATE",
              url: "/explore-services",
            },
          ],
        };
      }
      return {
        text: `You have ${rentals.length} active rental(s).`,
        list: rentals.slice(0, 5),
        listType: "rentals",
        actions: [
          { label: "View Rentals", action: "NAVIGATE", url: "/rentals" },
        ],
      };
    }

    // =========== WALLET ===========
    case INTENTS.WALLET_BALANCE: {
      if (!contextData.isAuthenticated) {
        return {
          text: "Please log in to check your wallet balance.",
          actions: [{ label: "Log In", action: "NAVIGATE", url: "/login" }],
        };
      }
      const balance = data.walletBalance || 0;
      return {
        text: `Your wallet balance is $${balance.toFixed(2)}.`,
        actions: [
          { label: "View Wallet", action: "NAVIGATE", url: "/wallet" },
          { label: "Add Funds", action: "INTENT", value: "WALLET_TOPUP" },
        ],
      };
    }

    case INTENTS.WALLET_TOPUP: {
      if (!contextData.isAuthenticated) {
        return {
          text: "Please log in to add funds to your wallet.",
          actions: [{ label: "Log In", action: "NAVIGATE", url: "/login" }],
        };
      }
      return {
        text: "You can add funds to your wallet from the Wallet page.",
        actions: [{ label: "Add Funds", action: "NAVIGATE", url: "/wallet" }],
      };
    }

    // =========== WORKSPACE ===========
    case INTENTS.WORKSPACE_STATUS: {
      if (!contextData.isAuthenticated) {
        return {
          text: "Please log in to view your workspace.",
          actions: [{ label: "Log In", action: "NAVIGATE", url: "/login" }],
        };
      }
      const summary = data.summary || {};
      return {
        text: `Workspace Status:\n• Applications: ${summary.totalApplications || 0}\n• Approved: ${summary.approved || 0}\n• Active Projects: ${summary.activeProjects || 0}`,
        actions: [
          { label: "Go to Workspace", action: "NAVIGATE", url: "/workspace" },
        ],
      };
    }

    case INTENTS.SCREENING_HELP: {
      return {
        text: "Screening tests are required for some job roles. Complete training first, then take the test. You can retry if needed.",
        actions: [
          { label: "Go to Workspace", action: "NAVIGATE", url: "/workspace" },
        ],
      };
    }

    case INTENTS.PROJECT_HELP: {
      return {
        text: "Projects are assigned after passing screening. Submit proof of work to earn credits.",
        actions: [
          { label: "View Projects", action: "NAVIGATE", url: "/workspace" },
        ],
      };
    }

    case INTENTS.EARNINGS_STATUS: {
      if (!contextData.isAuthenticated) {
        return {
          text: "Please log in to view your earnings.",
          actions: [{ label: "Log In", action: "NAVIGATE", url: "/login" }],
        };
      }
      const earnings = data.earnings || {};
      return {
        text: `Earnings Status:\n• Total Earned: $${earnings.total?.toFixed(2) || "0.00"}\n• Pending Proofs: ${earnings.pendingProofs || 0}`,
        actions: [
          { label: "View Workspace", action: "NAVIGATE", url: "/workspace" },
        ],
      };
    }

    // =========== AFFILIATE ===========
    case INTENTS.AFFILIATE_STATUS: {
      if (!contextData.isAuthenticated) {
        return {
          text: "Please log in to view your affiliate earnings.",
          actions: [{ label: "Log In", action: "NAVIGATE", url: "/login" }],
        };
      }
      return {
        text: `Affiliate Status:\n• Balance: $${data.balance?.toFixed(2) || "0.00"}\n• Total Earned: $${data.totalEarned?.toFixed(2) || "0.00"}\n• Referrals: ${data.referralCount || 0}`,
        actions: [
          { label: "View Affiliate", action: "NAVIGATE", url: "/affiliate" },
        ],
      };
    }

    case INTENTS.AFFILIATE_LINK: {
      if (!contextData.isAuthenticated) {
        return {
          text: "Please log in to get your referral link.",
          actions: [{ label: "Log In", action: "NAVIGATE", url: "/login" }],
        };
      }
      return {
        text: `Your referral link:\n${data.referralLink || "Not available"}\n\nShare this to earn 10% commission on referrals!`,
        actions: [
          { label: "View Affiliate", action: "NAVIGATE", url: "/affiliate" },
        ],
      };
    }

    // =========== SUPPORT ===========
    case INTENTS.SUPPORT_TICKET: {
      if (!contextData.isAuthenticated) {
        return {
          text: "Please log in to create a support ticket.",
          actions: [{ label: "Log In", action: "NAVIGATE", url: "/login" }],
        };
      }
      return {
        text: "I can help you create a support ticket. What issue are you facing?",
        requiresConfirmation: true,
        confirmAction: "CREATE_TICKET",
        actions: [
          { label: "Create Ticket", action: "NAVIGATE", url: "/support" },
        ],
      };
    }

    // =========== ADMIN ===========
    case INTENTS.ADMIN_DASHBOARD: {
      const stats = data.data || data;
      const pendingOrders = stats.pendingOrders ?? 0;
      const openTickets = stats.openTickets ?? 0;
      const pendingProofs = stats.pendingProofs ?? 0;
      const totalUsers = stats.totalUsers ?? 0;
      return {
        text: `Admin Dashboard:\n• Pending Orders: ${pendingOrders}\n• Open Tickets: ${openTickets}\n• Pending Proofs: ${pendingProofs}\n• Total Users: ${totalUsers}`,
        actions: [
          { label: "Open Admin", action: "NAVIGATE", url: "/admin" },
          { label: "View Orders", action: "NAVIGATE", url: "/admin/orders" },
          { label: "View Tickets", action: "NAVIGATE", url: "/admin/tickets" },
        ],
      };
    }

    case INTENTS.ADMIN_PENDING_ORDERS: {
      const orderData = data.data || data;
      const count = orderData.count ?? 0;
      const orders = orderData.orders || [];
      return {
        text: `You have ${count} pending order(s) to verify.`,
        list: orders.slice(0, 5),
        listType: "admin_orders",
        actions: [
          { label: "Open Orders", action: "NAVIGATE", url: "/admin/orders" },
        ],
      };
    }

    case INTENTS.ADMIN_PENDING_PROOFS: {
      const proofData = data.data || data;
      const count = proofData.count ?? 0;
      const proofs = proofData.proofs || [];
      return {
        text: `You have ${count} proof(s) awaiting review.`,
        list: proofs.slice(0, 5),
        listType: "admin_proofs",
        actions: [
          { label: "Review Proofs", action: "NAVIGATE", url: "/admin/proofs" },
        ],
      };
    }

    case INTENTS.ADMIN_PENDING_TICKETS: {
      const ticketData = data.data || data;
      const count = ticketData.count ?? 0;
      const tickets = ticketData.tickets || [];
      return {
        text: `You have ${count} open ticket(s) to respond to.`,
        list: tickets.slice(0, 5),
        listType: "admin_tickets",
        actions: [
          { label: "Open Tickets", action: "NAVIGATE", url: "/admin/tickets" },
        ],
      };
    }

    // =========== ADMIN CREATE SERVICE ===========
    case INTENTS.ADMIN_CREATE_SERVICE: {
      return {
        text: "I can help you create a new service. Please provide the service name, price, and category.",
        requiresInput: true,
        inputType: "create_service",
        actions: [
          {
            label: "Go to Services",
            action: "NAVIGATE",
            url: "/admin/services",
          },
          { label: "Cancel", action: "INTENT", value: "CANCEL" },
        ],
      };
    }

    // =========== ADMIN CREATE PROJECT ===========
    case INTENTS.ADMIN_CREATE_PROJECT: {
      const count = data.positionCount || 0;
      return {
        text: `I can help you create a new project. You have ${count} job role(s) available.\nPlease provide:\n• Project title\n• Job role to assign\n• Pay rate`,
        requiresInput: true,
        inputType: "create_project",
        list: data.positions?.slice(0, 5),
        listType: "positions",
        actions: [
          {
            label: "Go to Projects",
            action: "NAVIGATE",
            url: "/admin/projects",
          },
        ],
      };
    }

    // =========== GENERAL / FALLBACK ===========
    case INTENTS.GENERAL_SUPPORT:
    case INTENTS.UNKNOWN:
    case INTENTS.CONFUSED:
    default: {
      return {
        text: "I'm here to help! What would you like to do?",
        actions: [
          {
            label: "Explore Services",
            action: "NAVIGATE",
            url: "/explore-services",
          },
          { label: "Apply to Work", action: "NAVIGATE", url: "/apply-to-work" },
          { label: "My Wallet", action: "NAVIGATE", url: "/wallet" },
          { label: "Support", action: "INTENT", value: "SUPPORT_TICKET" },
        ],
      };
    }
  }
}

/**
 * Format list items for display
 */
function formatListItem(item, type) {
  switch (type) {
    case "services":
      return `• ${item.title} - $${item.price}`;
    case "positions":
      return `• ${item.title} (${item.category})`;
    case "orders":
      return `• Order #${String(item.id).slice(-6)} - ${item.status}`;
    case "rentals":
      return `• ${item.serviceName} - ${item.status}`;
    default:
      return `• ${item.title || item.name || item.id}`;
  }
}

module.exports = {
  getBlueprint,
  formatListItem,
};
