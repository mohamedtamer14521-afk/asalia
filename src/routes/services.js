const express = require('express');
const db = require('../database/db');

const router = express.Router();

/**
 * GET /api/categories
 * Returns active service categories
 */
router.get('/categories', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name_en, name_ar, platform, icon, sort_order
       FROM service_categories
       WHERE is_active = true
       ORDER BY sort_order ASC, name_en ASC`
    );

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('[CATEGORIES GET ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve categories.' }
    });
  }
});

/**
 * GET /api/services
 * Returns all active services for customers
 */
router.get('/', async (req, res) => {
  try {
    const { category_id, platform, search } = req.query;
    let sql = `
      SELECT 
        s.id,
        s.category_id,
        s.platform,
        s.name_en,
        s.name_ar,
        s.description_en,
        s.description_ar,
        s.price_per_1000,
        s.min_quantity,
        s.max_quantity,
        s.link_type,
        s.refill_available,
        s.cancel_available,
        s.is_recommended,
        s.is_fast,
        s.processing_time_info,
        c.name_en AS category_name_en,
        c.name_ar AS category_name_ar
      FROM services s
      LEFT JOIN service_categories c ON s.category_id = c.id
      WHERE s.is_active = true
    `;
    const params = [];

    if (category_id) {
      params.push(Number(category_id));
      sql += ` AND s.category_id = $${params.length}`;
    }

    if (platform) {
      params.push(platform.toLowerCase());
      sql += ` AND LOWER(s.platform) = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (LOWER(s.name_en) LIKE $${params.length} OR LOWER(s.name_ar) LIKE $${params.length})`;
    }

    sql += ` ORDER BY s.is_recommended DESC, s.id ASC`;

    const result = await db.query(sql, params);

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('[SERVICES GET ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve services.' }
    });
  }
});

/**
 * GET /api/services/:id
 * Retrieve specific service details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT 
        s.*,
        c.name_en AS category_name_en,
        c.name_ar AS category_name_ar
       FROM services s
       LEFT JOIN service_categories c ON s.category_id = c.id
       WHERE s.id = $1 AND s.is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'SERVICE_NOT_FOUND', message: 'The requested service was not found or is inactive.' }
      });
    }

    return res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('[SERVICE GET ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to retrieve service.' }
    });
  }
});

module.exports = router;
