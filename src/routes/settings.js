const express = require('express');
const db = require('../database/db');

const router = express.Router();

/**
 * GET /api/settings
 * Public endpoint to get platform configurations
 */
router.get('/', async (req, res) => {
  try {
    const resSettings = await db.query('SELECT key, value FROM settings');
    const settingsMap = {};
    for (const row of resSettings.rows) {
      settingsMap[row.key] = row.value;
    }

    return res.json({
      success: true,
      data: {
        siteName: settingsMap.site_name || 'ASALIA',
        logoUrl: settingsMap.site_logo_url || '',
        faviconUrl: settingsMap.site_favicon_url || '',
        supportWhatsApp: settingsMap.support_whatsapp || '+201030646757',
        announcement: {
          en: settingsMap.announcement_en || '',
          ar: settingsMap.announcement_ar || ''
        },
        exchangeRates: {
          USD: parseFloat(settingsMap.exchange_rate_usd || '0.020'),
          EUR: parseFloat(settingsMap.exchange_rate_eur || '0.019'),
          GBP: parseFloat(settingsMap.exchange_rate_gbp || '0.016')
        },
        registrationEnabled: settingsMap.registration_enabled !== 'false',
        maintenanceMode: settingsMap.maintenance_mode === 'true'
      }
    });
  } catch (err) {
    console.error('[SETTINGS GET ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch settings.' }
    });
  }
});

module.exports = router;
