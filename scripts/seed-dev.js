/**
 * ASALIA — Development-Only Seed Script
 * EXPLICIT INVOCATION ONLY (npm run seed-dev)
 * NEVER RUN AUTOMATICALLY IN PRODUCTION
 */

const db = require('../src/database/db');

async function seedDevelopmentData() {
  console.log('====================================================');
  console.log('   ASALIA — Explicit Development Seed Initializer   ');
  console.log('====================================================\n');

  if (process.env.NODE_ENV === 'production') {
    console.error('[ABORT] Seed script cannot be run in production environment!');
    process.exit(1);
  }

  try {
    // 1. Initial Service Categories
    console.log('[SEED] Seeding service categories...');
    const catInstagram = await db.query(
      `INSERT INTO service_categories (name_en, name_ar, platform, icon, sort_order)
       VALUES 
        ('Instagram Followers & Likes', 'متابعين ولايكات انستقرام', 'instagram', 'instagram', 1),
        ('TikTok Views & Followers', 'مشاهدات ومتابعين تيك توك', 'tiktok', 'tiktok', 2),
        ('YouTube Subscribers & Views', 'مشتركين ومشاهدات يوتيوب', 'youtube', 'youtube', 3),
        ('Telegram Members', 'أعضاء قنوات وجروبات تيليجرام', 'telegram', 'telegram', 4),
        ('Facebook Page Likes & Followers', 'متابعين ولايكات صفحات فيسبوك', 'facebook', 'facebook', 5)
       RETURNING id, platform, name_en`
    );
    console.log(`✓ Seeded ${catInstagram.rows.length} categories.`);

    const cats = {};
    catInstagram.rows.forEach(c => { cats[c.platform] = c.id; });

    // 2. Initial Real SMM Services
    console.log('[SEED] Seeding initial service offerings...');
    await db.query(
      `INSERT INTO services (
        category_id, platform, name_en, name_ar, description_en, description_ar,
        price_per_1000, min_quantity, max_quantity, link_type, processing_time_info,
        is_recommended, is_fast, is_active
       ) VALUES
       (
        $1, 'instagram', 'Instagram Followers — High Quality (Manual)',
        'متابعين انستقرام — جودة عالية (تنفيذ يدوي فوري)',
        'Guaranteed high-quality followers, gradual manual delivery, public profile required.',
        'متابعين بحسابات حقيقية عالية الجودة، تنفيذ يدوي آمن وتدريجي. يجب أن يكون الحساب عام.',
        45.0000, 100, 20000, 'instagram_profile', '0-12 Hours', true, true, true
       ),
       (
        $1, 'instagram', 'Instagram Real Post Likes',
        'لايكات منشورات انستقرام حقيقية',
        'Real post likes with high engagement, fast manual start.',
        'لايكات حقيقية تدعم خوارزميات المنشورات، بدء يدوي سريع ومباشر.',
        25.0000, 50, 10000, 'instagram_post', '0-6 Hours', false, true, true
       ),
       (
        $2, 'tiktok', 'TikTok Video Views — Ultra Fast',
        'مشاهدات فيديو تيك توك — فائقة السرعة',
        'Instant delivery of organic-looking video views. Supports all video formats.',
        'مشاهدات فيديو حقيقية لرفع التفاعل في الإكسبلور، تنفيذ يدوي فوري.',
        15.0000, 1000, 100000, 'tiktok_video', '0-2 Hours', true, true, true
       ),
       (
        $2, 'tiktok', 'TikTok Real Followers',
        'متابعين حسابات تيك توك حقيقيين',
        'Genuine TikTok profile followers, safe and permanent.',
        'متابعين حقيقيين لزيادة ثقة الحساب وفتح مزايا البث المباشر.',
        60.0000, 100, 15000, 'tiktok_profile', '0-24 Hours', false, false, true
       ),
       (
        $3, 'youtube', 'YouTube High-Retention Views',
        'مشاهدات يوتيوب — مدة مشاهدة عالية',
        'High retention manual views, completely safe for monetization.',
        'مشاهدات آمنة لزيادة ساعات المشاهدة ودعم مقترحات اليوتيوب.',
        75.0000, 500, 50000, 'youtube_video', '12-24 Hours', true, false, true
       ),
       (
        $4, 'telegram', 'Telegram Channel Members',
        'أعضاء قنوات تيليجرام حقيقيين',
        'Channel members with zero drop, instant manual addition.',
        'أعضاء حقيقيين للقنوات والمجموعات بدون نقص، تنفيذ يدوي دقيق.',
        35.0000, 100, 25000, 'telegram_channel', '0-12 Hours', false, true, true
       )`,
      [cats['instagram'], cats['tiktok'], cats['youtube'], cats['telegram']]
    );
    console.log('✓ Seeded 6 initial production-ready services.');

    // 3. Initial Payment Methods
    console.log('[SEED] Seeding payment methods (Vodafone Cash & InstaPay)...');
    await db.query(
      `INSERT INTO payment_methods (
        name_en, name_ar, account_number, account_holder, instructions_en, instructions_ar,
        min_deposit, max_deposit, is_active, sort_order
       ) VALUES
       (
        'Vodafone Cash', 'فودافون كاش', '01030646757', 'ASALIA Business',
        'Transfer the desired deposit amount to 01030646757 via Vodafone Cash. Take a screenshot of the confirmation SMS or application receipt and upload it.',
        'حول المبلغ المراد شحنه إلى رقم فودافون كاش 01030646757. التقط لقطة شاشة لرسالة التأكيد أو إيصال تطبيق أنا فودافون وارفعها هنا.',
        20.00, 30000.00, true, 1
       ),
       (
        'InstaPay', 'إنستاباي (InstaPay)', 'asalia@instapay', 'ASALIA SMM',
        'Send funds via InstaPay to username asalia@instapay. Upload the transaction receipt screenshot with the reference number.',
        'أرسل المبلغ عبر تطبيق إنستاباي إلى العنوان asalia@instapay وارفع صورة إيصال التحويل مع إدخال رقم العملية.',
        50.00, 50000.00, true, 2
       )`
    );
    console.log('✓ Seeded payment methods.');

    console.log('\n[SUCCESS] Development database seeded successfully!\n');
  } catch (err) {
    console.error('[SEED ERROR]:', err.message);
  } finally {
    await db.closeDb();
  }
}

if (require.main === module) {
  seedDevelopmentData();
}

module.exports = { seedDevelopmentData };
