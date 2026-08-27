const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/wallet/transactions
 * Returns authoritative ledger history for the customer
 */
router.get('/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    let sql = 'SELECT * FROM wallet_transactions WHERE user_id = $1';
    const params = [req.user.id];

    if (type && type !== 'ALL') {
      params.push(type.toUpperCase());
      sql += ` AND type = $${params.length}`;
    }

    // Count
    const countRes = await db.query(
      sql.replace('SELECT * FROM wallet_transactions', 'SELECT COUNT(*) AS total FROM wallet_transactions'),
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const txRes = await db.query(sql, params);

    return res.json({
      success: true,
      data: {
        transactions: txRes.rows,
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    console.error('[WALLET TRANSACTIONS ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve transactions.' }
    });
  }
});

/**
 * GET /api/wallet/balance
 */
router.get('/balance', async (req, res) => {
  try {
    const userRes = await db.query(
      'SELECT balance FROM users WHERE id = $1',
      [req.user.id]
    );

    return res.json({
      success: true,
      data: {
        balance: parseFloat(userRes.rows[0]?.balance || '0'),
        currency: 'EGP'
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve balance.' }
    });
  }
});

module.exports = router;
