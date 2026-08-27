const express = require('express');
const db = require('../database/db');
const orderService = require('../services/orderService');
const { authenticate } = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Require authentication for all customer order endpoints
router.use(authenticate);

/**
 * POST /api/orders
 * Create a new SMM order
 */
router.post('/', orderLimiter, async (req, res) => {
  try {
    const { service_id, target_link, quantity, username, idempotency_key } = req.body;

    if (!service_id || !target_link || !quantity) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Service, target link, and quantity are required.' }
      });
    }

    const result = await orderService.createOrder({
      userId: req.user.id,
      serviceId: parseInt(service_id, 10),
      targetLink: target_link,
      quantity: parseInt(quantity, 10),
      username: username || req.user.username,
      idempotencyKey: idempotency_key || req.headers['x-idempotency-key'] || null
    });

    const order = result.order;

    // Build auxiliary WhatsApp prefill message URL
    // Format required:
    // New ASALIA Order
    // Order ID: #{id}
    // Customer: {username}
    // Service: {service_name}
    // Username: {username}
    // Link: {link}
    // Quantity: {quantity}
    // Amount: {amount} EGP
    // Status: Pending
    const waText = [
      'New ASALIA Order',
      `Order ID: #${order.id}`,
      `Customer: ${order.customer_username_snap}`,
      `Service: ${order.service_name_snap}`,
      `Username: @${order.username}`,
      `Link: ${order.target_link}`,
      `Quantity: ${order.quantity}`,
      `Amount: ${Number(order.charge).toFixed(2)} EGP`,
      'Status: Pending'
    ].join('\n');

    const whatsappUrl = `https://wa.me/201030646757?text=${encodeURIComponent(waText)}`;

    return res.status(201).json({
      success: true,
      data: {
        order,
        newBalance: result.newBalance,
        whatsappUrl,
        cooldownSeconds: 10
      }
    });
  } catch (err) {
    if (err.code) {
      return res.status(400).json({
        success: false,
        error: { code: err.code, message: err.message }
      });
    }
    console.error('[ORDER CREATION ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An error occurred while processing your order.' }
    });
  }
});

/**
 * GET /api/orders
 * List orders for the authenticated customer
 */
router.get('/', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    let sql = `
      SELECT * FROM orders
      WHERE user_id = $1
    `;
    const params = [req.user.id];

    if (status && status !== 'ALL') {
      params.push(status.toUpperCase());
      sql += ` AND status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (LOWER(target_link) LIKE $${params.length} OR LOWER(service_name_snap) LIKE $${params.length} OR CAST(id AS TEXT) LIKE $${params.length})`;
    }

    // Get total count
    const countRes = await db.query(
      sql.replace('SELECT * FROM orders', 'SELECT COUNT(*) AS total FROM orders'),
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const ordersRes = await db.query(sql, params);

    return res.json({
      success: true,
      data: {
        orders: ordersRes.rows,
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    console.error('[ORDERS GET ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve orders.' }
    });
  }
});

/**
 * GET /api/orders/:id
 * Retrieve a specific order for the authenticated customer
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const orderRes = await db.query(
      'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (orderRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' }
      });
    }

    const order = orderRes.rows[0];

    // Fetch timeline events
    const eventsRes = await db.query(
      'SELECT previous_status, new_status, notes, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at ASC',
      [id]
    );

    return res.json({
      success: true,
      data: {
        order,
        events: eventsRes.rows
      }
    });
  } catch (err) {
    console.error('[ORDER DETAILS ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch order details.' }
    });
  }
});

module.exports = router;
