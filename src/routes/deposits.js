const express = require('express');
const db = require('../database/db');
const depositService = require('../services/depositService');
const { authenticate } = require('../middleware/auth');
const { uploadProof } = require('../middleware/upload');
const { depositLimiter } = require('../middleware/rateLimit');

const router = express.Router();

/**
 * GET /api/deposits/methods
 * Public or customer endpoint to get active payment methods
 */
router.get('/methods', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name_en, name_ar, account_number, account_holder, instructions_en, instructions_ar, min_deposit, max_deposit, sort_order
       FROM payment_methods
       WHERE is_active = true
       ORDER BY sort_order ASC, id ASC`
    );

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('[PAYMENT METHODS GET ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve payment methods.' }
    });
  }
});

// All remaining deposit routes require customer authentication
router.use(authenticate);

/**
 * POST /api/deposits
 * Submit payment proof and create pending deposit
 */
router.post('/', depositLimiter, uploadProof, async (req, res) => {
  try {
    const { payment_method_id, amount, sender_number, transaction_reference } = req.body;

    if (!payment_method_id || !amount || !sender_number) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Payment method, amount, and sender phone/account number are required.'
        }
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SCREENSHOT_REQUIRED',
          message: 'Please upload a screenshot of your payment transfer.'
        }
      });
    }

    const deposit = await depositService.submitDeposit({
      userId: req.user.id,
      paymentMethodId: parseInt(payment_method_id, 10),
      amount,
      senderNumber: sender_number,
      transactionReference: transaction_reference,
      file: req.file
    });

    // Generate auxiliary WhatsApp notification URL targeted to +201030646757
    // Format required:
    // New ASALIA Deposit
    // Deposit ID: #{id}
    // Customer: {username}
    // Amount: {amount} EGP
    // Payment Method: {method}
    // Sender Number: {sender}
    // Transaction ID: {ref}
    // Status: Pending
    const waText = [
      'New ASALIA Deposit',
      `Deposit ID: #${deposit.id}`,
      `Customer: ${req.user.username}`,
      `Amount: ${Number(deposit.amount).toFixed(2)} EGP`,
      `Payment Method: ${deposit.payment_method_name_snap}`,
      `Sender Number: ${deposit.sender_number}`,
      `Transaction ID: ${deposit.transaction_reference || 'N/A'}`,
      'Status: Pending'
    ].join('\n');

    const whatsappUrl = `https://wa.me/201030646757?text=${encodeURIComponent(waText)}`;

    return res.status(201).json({
      success: true,
      data: {
        deposit,
        whatsappUrl
      }
    });
  } catch (err) {
    if (err.code) {
      return res.status(400).json({
        success: false,
        error: { code: err.code, message: err.message }
      });
    }
    console.error('[DEPOSIT CREATION ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to submit deposit request.' }
    });
  }
});

/**
 * GET /api/deposits
 * Retrieve customer's deposits
 */
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    let sql = 'SELECT * FROM deposits WHERE user_id = $1';
    const params = [req.user.id];

    if (status && status !== 'ALL') {
      params.push(status.toUpperCase());
      sql += ` AND status = $${params.length}`;
    }

    const countRes = await db.query(
      sql.replace('SELECT * FROM deposits', 'SELECT COUNT(*) AS total FROM deposits'),
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const depositsRes = await db.query(sql, params);

    return res.json({
      success: true,
      data: {
        deposits: depositsRes.rows,
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (err) {
    console.error('[DEPOSITS GET ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve deposits.' }
    });
  }
});

module.exports = router;
