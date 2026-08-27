const express = require('express');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 30`,
      [req.user.id]
    );

    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
    return res.json({ success: true, data: { message: 'All marked as read' } });
  } catch (err) {
    return res.status(500).json({ success: false, error: { code: 'ERROR', message: err.message } });
  }
});

module.exports = router;
