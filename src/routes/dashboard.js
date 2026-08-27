const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/dashboard
 * Return live statistics and recent activity for the customer
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user's current live balance from PostgreSQL
    const userRes = await db.query(
      'SELECT balance FROM users WHERE id = $1',
      [userId]
    );
    const balance = parseFloat(userRes.rows[0]?.balance || '0');

    // Calculate order counts directly from PostgreSQL
    const statsRes = await db.query(
      `SELECT 
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_orders,
        COUNT(*) FILTER (WHERE status IN ('PROCESSING', 'IN_PROGRESS')) AS processing_orders,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_orders,
        COALESCE(SUM(charge) FILTER (WHERE status != 'CANCELED' AND status != 'REFUNDED'), 0) AS total_spent
       FROM orders
       WHERE user_id = $1`,
      [userId]
    );

    const stats = statsRes.rows[0];

    // Recent 5 orders
    const recentOrdersRes = await db.query(
      `SELECT id, service_name_snap, quantity, charge, status, created_at
       FROM orders
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    // Recent 5 wallet transactions
    const recentTxRes = await db.query(
      `SELECT id, type, amount, balance_after, description, created_at
       FROM wallet_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    // Unread notifications count
    const notifRes = await db.query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    return res.json({
      success: true,
      data: {
        balance,
        totalOrders: parseInt(stats.total_orders, 10),
        pendingOrders: parseInt(stats.pending_orders, 10),
        processingOrders: parseInt(stats.processing_orders, 10),
        completedOrders: parseInt(stats.completed_orders, 10),
        totalSpent: parseFloat(stats.total_spent),
        recentOrders: recentOrdersRes.rows,
        recentTransactions: recentTxRes.rows,
        unreadNotifications: parseInt(notifRes.rows[0]?.unread || '0', 10)
      }
    });
  } catch (err) {
    console.error('[DASHBOARD STATS ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to load dashboard statistics.' }
    });
  }
});

module.exports = router;
