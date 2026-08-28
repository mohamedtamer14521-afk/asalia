const db = require('../src/database/db');

const defaultCategories = [
  { platform: 'instagram', name_ar: 'خدمات انستقرام', name_en: 'Instagram Services', icon: 'camera', sort_order: 1 },
  { platform: 'tiktok', name_ar: 'خدمات تيك توك', name_en: 'TikTok Services', icon: 'video', sort_order: 2 },
  { platform: 'youtube', name_ar: 'خدمات يوتيوب', name_en: 'YouTube Services', icon: 'play', sort_order: 3 },
  { platform: 'facebook', name_ar: 'خدمات فيسبوك', name_en: 'Facebook Services', icon: 'facebook', sort_order: 4 },
  { platform: 'telegram', name_ar: 'خدمات تليجرام', name_en: 'Telegram Services', icon: 'send', sort_order: 5 },
  { platform: 'twitter', name_ar: 'خدمات إكس / تويتر', name_en: 'X / Twitter Services', icon: 'twitter', sort_order: 6 }
];

async function main() {
  for (const c of defaultCategories) {
    const existing = await db.query(
      'SELECT id FROM service_categories WHERE platform = $1',
      [c.platform]
    );
    if (existing.rows.length === 0) {
      await db.query(
        'INSERT INTO service_categories (platform, name_ar, name_en, icon, sort_order) VALUES ($1, $2, $3, $4, $5)',
        [c.platform, c.name_ar, c.name_en, c.icon, c.sort_order]
      );
    }
  }

  const res = await db.query('SELECT id, platform, name_ar, name_en FROM service_categories ORDER BY sort_order');
  console.log('Available Categories in Database:', res.rows);
  await db.closeDb();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
