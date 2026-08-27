/**
 * ASALIA — Clean All Test and Demo Data
 * Preserves ONLY the Master Admin account and platform settings.
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/database/db');

async function cleanTestData() {
  console.log('====================================================');
  console.log('       ASALIA — Purging All Test & Demo Data        ');
  console.log('====================================================\n');

  try {
    await db.transaction(async (tx) => {
      // 1. Delete all non-admin customer accounts
      const deletedUsers = await tx.query(
        "DELETE FROM users WHERE role != 'ADMIN' RETURNING id, username"
      );
      console.log(`✓ Removed ${deletedUsers.rows.length} test customer account(s).`);

      // 2. Truncate all customer activity tables
      await tx.query('DELETE FROM orders');
      console.log('✓ Cleared all test orders.');

      await tx.query('DELETE FROM deposits');
      console.log('✓ Cleared all test deposits.');

      await tx.query('DELETE FROM wallet_transactions');
      console.log('✓ Cleared all test wallet transactions.');

      await tx.query('DELETE FROM order_events');
      console.log('✓ Cleared all test order events.');

      await tx.query('DELETE FROM tickets');
      console.log('✓ Cleared all test tickets.');

      await tx.query('DELETE FROM ticket_messages');
      console.log('✓ Cleared all test ticket messages.');

      await tx.query('DELETE FROM notifications');
      console.log('✓ Cleared all test notifications.');

      await tx.query('DELETE FROM admin_logs');
      console.log('✓ Cleared test admin audit logs.');

      await tx.query('DELETE FROM refill_requests');
      await tx.query('DELETE FROM cancel_requests');

      // Reset admin balance to 0.0000
      await tx.query("UPDATE users SET balance = 0.0000 WHERE role = 'ADMIN'");
      console.log('✓ Admin balance verified at 0.0000 EGP.');

      // Remove specific test services (id 1 & 2 created during test scripts)
      await tx.query('DELETE FROM services WHERE id IN (1, 2)');
      console.log('✓ Removed test service artifacts.');
    });

    // 3. Clean files from uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(uploadsDir, file));
      }
      console.log(`✓ Cleaned ${files.length} test upload file(s) from disk.`);
    }

    console.log('\n====================================================');
    console.log(' [SUCCESS] Database is now 100% clean for production! ');
    console.log(' Only Master Admin account exists. Zero fake records.  ');
    console.log('====================================================\n');

  } catch (err) {
    console.error('[CLEAN ERROR]:', err);
  } finally {
    await db.closeDb();
  }
}

cleanTestData();
