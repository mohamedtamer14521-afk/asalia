const express = require('express');
const db = require('../database/db');
const depositService = require('../services/depositService');
const orderService = require('../services/orderService');
const storage = require('../storage');
const { uploadImage } = require('../middleware/upload');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Strict security: require authentication and role == ADMIN on every admin route
router.use(authenticate);
router.use(requireAdmin);

/**
 * POST /api/admin/upload-image
 * Direct image upload from admin's device (Logo, Service icons, Banners)
 */
router.post('/upload-image', uploadImage('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'يرجى اختيار صورة من جهازك.' } });
    }

    const saved = await storage.saveFile(req.file);
    const imageUrl = saved.url || `/uploads/${saved.key}`;

    return res.json({
      success: true,
      data: {
        url: imageUrl,
        key: saved.key,
        size: saved.size
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'UPLOAD_ERROR', message: err.message } });
  }
});

/**
 * GET /api/admin/dashboard
 * Real PostgreSQL platform metrics (no fake analytics)
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Customers count
    const usersRes = await db.query(
      "SELECT COUNT(*) AS total_customers FROM users WHERE role = 'CUSTOMER'"
    );

    // Deposit metrics
    const depRes = await db.query(`
      SELECT 
        COUNT(*) AS total_deposits_count,
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_deposits,
        COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved_deposits,
        COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED'), 0) AS total_approved_deposits,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today_deposits
      FROM deposits
    `);

    // Order metrics
    const orderRes = await db.query(`
      SELECT 
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_orders,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing_orders,
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress_orders,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_orders,
        COUNT(*) FILTER (WHERE status = 'REFUNDED') AS refunded_orders,
        COALESCE(SUM(charge) FILTER (WHERE status != 'CANCELED' AND status != 'REFUNDED'), 0) AS total_order_value,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS today_orders
      FROM orders
    `);

    const users = usersRes.rows[0];
    const deposits = depRes.rows[0];
    const orders = orderRes.rows[0];

    return res.json({
      success: true,
      data: {
        totalCustomers: parseInt(users.total_customers, 10),
        pendingDeposits: parseInt(deposits.pending_deposits, 10),
        approvedDeposits: parseInt(deposits.approved_deposits, 10),
        totalDepositAmount: parseFloat(deposits.total_approved_deposits),
        todayDeposits: parseInt(deposits.today_deposits, 10),
        totalOrders: parseInt(orders.total_orders, 10),
        pendingOrders: parseInt(orders.pending_orders, 10),
        processingOrders: parseInt(orders.processing_orders, 10),
        inProgressOrders: parseInt(orders.in_progress_orders, 10),
        completedOrders: parseInt(orders.completed_orders, 10),
        refundedOrders: parseInt(orders.refunded_orders, 10),
        totalOrderValue: parseFloat(orders.total_order_value),
        todayOrders: parseInt(orders.today_orders, 10)
      }
    });
  } catch (err) {
    console.error('[ADMIN DASHBOARD ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve admin dashboard metrics.' }
    });
  }
});

// -------------------------------------------------------------
// DEPOSITS REVIEW
// -------------------------------------------------------------
router.get('/deposits', async (req, res) => {
  try {
    const { status, page = 1, limit = 25 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    let sql = `
      SELECT 
        d.*,
        u.username AS customer_username,
        u.email AS customer_email,
        u.balance AS customer_current_balance
      FROM deposits d
      JOIN users u ON d.user_id = u.id
    `;
    const params = [];

    if (status && status !== 'ALL') {
      params.push(status.toUpperCase());
      sql += ` WHERE d.status = $${params.length}`;
    }

    const countRes = await db.query(
      sql.replace(/SELECT[\s\S]*?FROM deposits d/i, 'SELECT COUNT(*) AS total FROM deposits d'),
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    sql += ` ORDER BY d.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const result = await db.query(sql, params);

    return res.json({
      success: true,
      data: {
        deposits: result.rows,
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (err) {
    console.error('[ADMIN DEPOSITS GET ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve deposits.' }
    });
  }
});

router.post('/deposits/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;

    const result = await depositService.approveDeposit(
      parseInt(id, 10),
      req.user.id,
      admin_notes || 'Approved by admin'
    );

    return res.json({
      success: true,
      data: {
        message: 'Deposit approved and wallet credited successfully.',
        ...result
      }
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: { code: err.code || 'APPROVE_ERROR', message: err.message }
    });
  }
});

router.post('/deposits/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;

    const result = await depositService.rejectDeposit(
      parseInt(id, 10),
      req.user.id,
      admin_notes || 'Rejected by admin'
    );

    return res.json({
      success: true,
      data: {
        message: 'Deposit has been marked as rejected.',
        ...result
      }
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: { code: err.code || 'REJECT_ERROR', message: err.message }
    });
  }
});

router.delete('/deposits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await depositService.deleteDeposit(parseInt(id, 10), req.user.id);
    return res.json({
      success: true,
      data: {
        message: 'تم حذف طلب الإيداع بنجاح.',
        ...result
      }
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: { code: err.code || 'DELETE_ERROR', message: err.message }
    });
  }
});

// Protected Screenshot Proof Stream
router.get('/deposits/:id/proof', async (req, res) => {
  try {
    const { id } = req.params;
    const depRes = await db.query(
      'SELECT screenshot_storage_key, screenshot_file_type FROM deposits WHERE id = $1',
      [id]
    );

    if (depRes.rows.length === 0) {
      return res.status(404).send('Deposit not found');
    }

    const { screenshot_storage_key, screenshot_file_type } = depRes.rows[0];
    const fileData = await storage.getFile(screenshot_storage_key);

    if (!fileData.exists) {
      return res.status(404).send('Proof image file not found on storage');
    }

    res.setHeader('Content-Type', screenshot_file_type || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fileData.stream.pipe(res);
  } catch (err) {
    console.error('[PROOF VIEW ERROR]:', err);
    res.status(500).send('Error retrieving proof image');
  }
});

// -------------------------------------------------------------
// ORDERS FULFILLMENT & MANAGEMENT
// -------------------------------------------------------------
router.get('/orders', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 25 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];

    if (status && status !== 'ALL') {
      params.push(status.toUpperCase());
      sql += ` AND status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (
        LOWER(customer_username_snap) LIKE $${params.length} OR 
        LOWER(target_link) LIKE $${params.length} OR 
        LOWER(username) LIKE $${params.length} OR 
        CAST(id AS TEXT) LIKE $${params.length}
      )`;
    }

    const countRes = await db.query(
      sql.replace('SELECT * FROM orders', 'SELECT COUNT(*) AS total FROM orders'),
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const result = await db.query(sql, params);

    return res.json({
      success: true,
      data: {
        orders: result.rows,
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (err) {
    console.error('[ADMIN ORDERS GET ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve orders.' }
    });
  }
});

router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body;

    const allowedStatuses = ['PENDING', 'PROCESSING', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'CANCELED', 'REFUNDED'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: `Status must be one of: ${allowedStatuses.join(', ')}` }
      });
    }

    // If changing to REFUNDED, trigger atomic refund
    if (status === 'REFUNDED') {
      const refundRes = await orderService.refundOrder(parseInt(id, 10), req.user.id, admin_notes || 'Refunded by admin');
      return res.json({
        success: true,
        data: { message: 'Order status updated to REFUNDED and funds returned to customer wallet.', ...refundRes }
      });
    }

    // Otherwise update status and record event
    const oldRes = await db.query('SELECT status, user_id FROM orders WHERE id = $1', [id]);
    if (oldRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
    }
    const previousStatus = oldRes.rows[0].status;

    await db.query(
      'UPDATE orders SET status = $1, admin_notes = COALESCE($2, admin_notes), updated_at = NOW() WHERE id = $3',
      [status, admin_notes || null, id]
    );

    await db.query(
      'INSERT INTO order_events (order_id, previous_status, new_status, notes, changed_by) VALUES ($1, $2, $3, $4, $5)',
      [id, previousStatus, status, admin_notes || `Status changed to ${status}`, req.user.id]
    );

    // Audit log
    await db.query(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, before_state, after_state)
       VALUES ($1, 'ORDER_STATUS_UPDATE', 'ORDER', $2, $3, $4)`,
      [req.user.id, String(id), JSON.stringify({ status: previousStatus }), JSON.stringify({ status })]
    );

    // Notify customer
    await db.query(
      `INSERT INTO notifications (user_id, title_en, title_ar, message_en, message_ar, type, link)
       VALUES ($1, $2, $3, $4, $5, 'order_status', $6)`,
      [
        oldRes.rows[0].user_id,
        `Order #${id} Status: ${status}`,
        `حالة الطلب #${id}: ${status}`,
        `Your order #${id} status is now ${status}.`,
        `تم تحديث حالة طلبك #${id} إلى: ${status}.`,
        '/dashboard?tab=orders'
      ]
    );

    return res.json({
      success: true,
      data: { message: `Order #${id} status updated to ${status}.` }
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: { code: err.code || 'STATUS_UPDATE_ERROR', message: err.message }
    });
  }
});

// -------------------------------------------------------------
// USER MANAGEMENT
// -------------------------------------------------------------
router.get('/users', async (req, res) => {
  try {
    const { search, page = 1, limit = 25 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    let sql = `
      SELECT 
        u.id, u.username, u.email, u.role, u.balance, u.is_active, u.created_at,
        COUNT(DISTINCT o.id) AS total_orders,
        COALESCE(SUM(o.charge) FILTER (WHERE o.status != 'CANCELED' AND o.status != 'REFUNDED'), 0) AS total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE u.role = 'CUSTOMER'
    `;
    const params = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (LOWER(u.username) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length} OR CAST(u.id AS TEXT) LIKE $${params.length})`;
    }

    sql += ` GROUP BY u.id`;

    const countRes = await db.query(
      `SELECT COUNT(*) AS total FROM users WHERE role = 'CUSTOMER'` + (search ? ` AND (LOWER(username) LIKE $1 OR LOWER(email) LIKE $1)` : ''),
      search ? params : []
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    sql += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const result = await db.query(sql, params);

    return res.json({
      success: true,
      data: {
        users: result.rows,
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (err) {
    console.error('[ADMIN USERS GET ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve users.' }
    });
  }
});

// Toggle suspend/activate
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    await db.query('UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2', [Boolean(is_active), id]);

    await db.query(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, after_state)
       VALUES ($1, $2, 'USER', $3, $4)`,
      [req.user.id, is_active ? 'USER_ACTIVATE' : 'USER_SUSPEND', String(id), JSON.stringify({ is_active })]
    );

    return res.json({
      success: true,
      data: { message: `Customer account ${is_active ? 'activated' : 'suspended'}.` }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// Manual Credit / Manual Debit with strict audit log
router.post('/users/:id/balance', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, reason } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be positive' } });
    }

    if (!['MANUAL_CREDIT', 'MANUAL_DEBIT'].includes(type)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_TYPE', message: 'Type must be MANUAL_CREDIT or MANUAL_DEBIT' } });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: { code: 'REASON_REQUIRED', message: 'A reason for manual adjustment is required for audit logs.' } });
    }

    const result = await db.transaction(async (tx) => {
      const userRes = await tx.query('SELECT id, balance FROM users WHERE id = $1 FOR UPDATE', [id]);
      if (userRes.rows.length === 0) throw { code: 'USER_NOT_FOUND', message: 'Customer not found' };

      const currentBalance = parseFloat(userRes.rows[0].balance);
      let newBalance = 0;

      if (type === 'MANUAL_CREDIT') {
        newBalance = parseFloat((currentBalance + parsedAmount).toFixed(4));
      } else {
        if (currentBalance < parsedAmount) {
          throw { code: 'INSUFFICIENT_BALANCE', message: `Customer balance (${currentBalance.toFixed(2)} EGP) is less than debit amount (${parsedAmount.toFixed(2)} EGP)` };
        }
        newBalance = parseFloat((currentBalance - parsedAmount).toFixed(4));
      }

      await tx.query('UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2', [newBalance, id]);

      await tx.query(
        `INSERT INTO wallet_transactions (
          user_id, type, amount, balance_before, balance_after, description, reference_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          type,
          type === 'MANUAL_CREDIT' ? parsedAmount : -parsedAmount,
          currentBalance,
          newBalance,
          `Admin Adjustment: ${reason.trim()}`,
          `ADMIN_${req.user.id}`
        ]
      );

      await tx.query(
        `INSERT INTO admin_logs (admin_id, action, target_type, target_id, before_state, after_state)
         VALUES ($1, $2, 'USER_BALANCE', $3, $4, $5)`,
        [
          req.user.id,
          type,
          String(id),
          JSON.stringify({ balance: currentBalance }),
          JSON.stringify({ balance: newBalance, reason })
        ]
      );

      return { currentBalance, newBalance };
    });

    return res.json({
      success: true,
      data: { message: `Customer balance successfully updated to ${result.newBalance.toFixed(2)} EGP`, ...result }
    });
  } catch (err) {
    return res.status(400).json({ success: false, error: { code: err.code || 'ERROR', message: err.message } });
  }
});

// -------------------------------------------------------------
// SERVICES & CATEGORIES CRUD
// -------------------------------------------------------------
router.post('/categories', async (req, res) => {
  try {
    const { name_en, name_ar, platform, icon = 'globe', sort_order = 0 } = req.body;
    const insertRes = await db.query(
      `INSERT INTO service_categories (name_en, name_ar, platform, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name_en, name_ar, platform.toLowerCase(), icon, parseInt(sort_order, 10)]
    );
    return res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

router.post('/services', async (req, res) => {
  try {
    let {
      category_id, platform, name_en, name_ar, description_en, description_ar,
      price_per_1000, min_quantity, max_quantity, link_type = 'custom',
      processing_time_info = '0-24 Hours', image_url = ''
    } = req.body;

    // Auto-link to matching category if category_id not explicitly provided
    if (!category_id && platform) {
      const catRes = await db.query(
        'SELECT id FROM service_categories WHERE LOWER(platform) = LOWER($1) LIMIT 1',
        [platform.toLowerCase()]
      );
      if (catRes.rows.length > 0) {
        category_id = catRes.rows[0].id;
      }
    }

    const insertRes = await db.query(
      `INSERT INTO services (
        category_id, platform, name_en, name_ar, description_en, description_ar,
        price_per_1000, min_quantity, max_quantity, link_type, processing_time_info, image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        category_id ? parseInt(category_id, 10) : null,
        platform.toLowerCase(),
        name_en,
        name_ar,
        description_en,
        description_ar,
        parseFloat(price_per_1000),
        parseInt(min_quantity, 10),
        parseInt(max_quantity, 10),
        link_type,
        processing_time_info,
        image_url || null
      ]
    );

    return res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

router.put('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      category_id, platform, name_en, name_ar, description_en, description_ar,
      price_per_1000, min_quantity, max_quantity, link_type, is_active, processing_time_info, image_url
    } = req.body;

    const updateRes = await db.query(
      `UPDATE services SET
        category_id = COALESCE($1, category_id),
        platform = COALESCE($2, platform),
        name_en = COALESCE($3, name_en),
        name_ar = COALESCE($4, name_ar),
        description_en = COALESCE($5, description_en),
        description_ar = COALESCE($6, description_ar),
        price_per_1000 = COALESCE($7, price_per_1000),
        min_quantity = COALESCE($8, min_quantity),
        max_quantity = COALESCE($9, max_quantity),
        link_type = COALESCE($10, link_type),
        is_active = COALESCE($11, is_active),
        processing_time_info = COALESCE($12, processing_time_info),
        image_url = COALESCE($13, image_url),
        updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        category_id !== undefined ? category_id : null,
        platform,
        name_en,
        name_ar,
        description_en,
        description_ar,
        price_per_1000 !== undefined ? parseFloat(price_per_1000) : null,
        min_quantity !== undefined ? parseInt(min_quantity, 10) : null,
        max_quantity !== undefined ? parseInt(max_quantity, 10) : null,
        link_type,
        is_active !== undefined ? Boolean(is_active) : null,
        processing_time_info,
        image_url !== undefined ? image_url : null,
        id
      ]
    );

    return res.json({ success: true, data: updateRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

router.delete('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const delRes = await db.query('DELETE FROM services WHERE id = $1 RETURNING id, name_ar', [id]);
    if (delRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }

    await db.query(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, after_state)
       VALUES ($1, 'SERVICE_DELETE', 'SERVICE', $2, $3)`,
      [req.user.id, String(id), JSON.stringify({ deleted: true, name: delRes.rows[0].name_ar })]
    );

    return res.json({ success: true, data: { message: 'Service deleted successfully' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

// -------------------------------------------------------------
// PAYMENT METHODS CRUD
// -------------------------------------------------------------
router.get('/payment-methods', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM payment_methods ORDER BY sort_order ASC, id ASC');
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

router.post('/payment-methods', async (req, res) => {
  try {
    const { name_en, name_ar, account_number, account_holder, instructions_en, instructions_ar, min_deposit, max_deposit, sort_order = 0, image_url = '' } = req.body;
    const insertRes = await db.query(
      `INSERT INTO payment_methods (
        name_en, name_ar, account_number, account_holder, instructions_en, instructions_ar,
        min_deposit, max_deposit, sort_order, is_active, image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10) RETURNING *`,
      [
        name_en, name_ar, account_number, account_holder, instructions_en, instructions_ar,
        parseFloat(min_deposit || 10), parseFloat(max_deposit || 50000), parseInt(sort_order, 10),
        image_url || null
      ]
    );
    return res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

router.put('/payment-methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name_en, name_ar, account_number, account_holder, instructions_en, instructions_ar, min_deposit, max_deposit, is_active, sort_order, image_url } = req.body;

    const updateRes = await db.query(
      `UPDATE payment_methods SET
        name_en = COALESCE($1, name_en),
        name_ar = COALESCE($2, name_ar),
        account_number = COALESCE($3, account_number),
        account_holder = COALESCE($4, account_holder),
        instructions_en = COALESCE($5, instructions_en),
        instructions_ar = COALESCE($6, instructions_ar),
        min_deposit = COALESCE($7, min_deposit),
        max_deposit = COALESCE($8, max_deposit),
        is_active = COALESCE($9, is_active),
        sort_order = COALESCE($10, sort_order),
        image_url = COALESCE($11, image_url)
       WHERE id = $12
       RETURNING *`,
      [
        name_en, name_ar, account_number, account_holder, instructions_en, instructions_ar,
        min_deposit !== undefined ? parseFloat(min_deposit) : null,
        max_deposit !== undefined ? parseFloat(max_deposit) : null,
        is_active !== undefined ? Boolean(is_active) : null,
        sort_order !== undefined ? parseInt(sort_order, 10) : null,
        image_url !== undefined ? image_url : null,
        id
      ]
    );

    return res.json({ success: true, data: updateRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

router.delete('/payment-methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const delRes = await db.query('DELETE FROM payment_methods WHERE id = $1 RETURNING id, name_ar', [id]);
    if (delRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment method not found' } });
    }

    await db.query(
      `INSERT INTO admin_logs (admin_id, action, target_type, target_id, after_state)
       VALUES ($1, 'PAYMENT_METHOD_DELETE', 'PAYMENT_METHOD', $2, $3)`,
      [req.user.id, String(id), JSON.stringify({ deleted: true, name: delRes.rows[0].name_ar })]
    );

    return res.json({ success: true, data: { message: 'Payment method deleted successfully' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

// -------------------------------------------------------------
// SETTINGS
// -------------------------------------------------------------
router.get('/settings', async (req, res) => {
  try {
    const result = await db.query('SELECT key, value, description FROM settings');
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { settings } = req.body; // array of { key, value }
    if (!Array.isArray(settings)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_DATA', message: 'Settings array required' } });
    }

    for (const item of settings) {
      await db.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [item.key, String(item.value)]
      );
    }

    return res.json({ success: true, data: { message: 'Settings updated successfully.' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

// -------------------------------------------------------------
// AUDIT LOGS
// -------------------------------------------------------------
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const logsRes = await db.query(
      `SELECT l.*, u.username AS admin_username
       FROM admin_logs l
       JOIN users u ON l.admin_id = u.id
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit, 10), offset]
    );

    return res.json({ success: true, data: logsRes.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

module.exports = router;
