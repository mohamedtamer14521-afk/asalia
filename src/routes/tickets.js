const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/tickets
 */
router.get('/', async (req, res) => {
  try {
    const isStaff = ['ADMIN', 'MANAGER', 'SUPPORT'].includes(req.user.role);
    let sql = `
      SELECT t.*, u.username AS customer_username
      FROM tickets t
      JOIN users u ON t.user_id = u.id
    `;
    const params = [];

    if (!isStaff) {
      params.push(req.user.id);
      sql += ' WHERE t.user_id = $1';
    }

    sql += ' ORDER BY t.updated_at DESC';

    const result = await db.query(sql, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

/**
 * POST /api/tickets
 */
router.post('/', async (req, res) => {
  try {
    const { subject, category = 'General', order_id, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Subject and message are required' } });
    }

    const ticketRes = await db.transaction(async (tx) => {
      const tRes = await tx.query(
        `INSERT INTO tickets (user_id, subject, category, order_id, status)
         VALUES ($1, $2, $3, $4, 'OPEN') RETURNING *`,
        [req.user.id, subject.trim(), category, order_id ? parseInt(order_id, 10) : null]
      );
      const ticket = tRes.rows[0];

      await tx.query(
        `INSERT INTO ticket_messages (ticket_id, user_id, message, is_admin_reply)
         VALUES ($1, $2, $3, false)`,
        [ticket.id, req.user.id, message.trim()]
      );

      return ticket;
    });

    return res.status(201).json({ success: true, data: ticketRes });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

module.exports = router;
