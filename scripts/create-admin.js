const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../src/database/db');
require('dotenv').config();

function prompt(question, isPassword = false) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function createAdmin() {
  console.log('====================================================');
  console.log('       ASALIA — Secure Admin Creation Procedure      ');
  console.log('====================================================\n');

  // Check command line arguments first for non-interactive automation
  const args = process.argv.slice(2);
  let email = '';
  let username = '';
  let password = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) email = args[i + 1];
    if (args[i] === '--username' && args[i + 1]) username = args[i + 1];
    if (args[i] === '--password' && args[i + 1]) password = args[i + 1];
  }

  // If not provided via CLI, prompt interactively
  if (!email) {
    email = await prompt('Enter Admin Email: ');
  }
  if (!username) {
    username = await prompt('Enter Admin Username (default: admin): ') || 'admin';
  }
  if (!password) {
    password = await prompt('Enter Admin Password (min 8 chars): ');
  }

  // Validate inputs
  if (!email || !email.includes('@')) {
    console.error('[ERROR] A valid email address is required.');
    process.exit(1);
  }
  if (!username || username.length < 3) {
    console.error('[ERROR] Username must be at least 3 characters.');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('[ERROR] Password must be at least 8 characters.');
    process.exit(1);
  }

  try {
    // Check if an admin already exists
    const existingAdminRes = await db.query(
      "SELECT id, username, email FROM users WHERE role = 'ADMIN' LIMIT 1"
    );

    const passwordHash = await bcrypt.hash(password, 10);

    if (existingAdminRes.rows.length > 0) {
      const existing = existingAdminRes.rows[0];
      console.log(`[INFO] Existing Admin found: ${existing.username} (${existing.email}). Updating credentials...`);
      await db.query(
        `UPDATE users
         SET username = $1, email = $2, password_hash = $3, updated_at = NOW()
         WHERE id = $4`,
        [username, email, passwordHash, existing.id]
      );
      console.log(`\n[SUCCESS] Admin account #${existing.id} (${username}) has been updated successfully.`);
    } else {
      const insertRes = await db.query(
        `INSERT INTO users (username, email, password_hash, role, balance, is_active)
         VALUES ($1, $2, $3, 'ADMIN', 0.0000, true)
         RETURNING id, username, email, role, created_at`,
        [username, email, passwordHash]
      );
      const newAdmin = insertRes.rows[0];
      console.log(`\n[SUCCESS] Master Admin created successfully!`);
      console.log(`ID: ${newAdmin.id}`);
      console.log(`Username: ${newAdmin.username}`);
      console.log(`Email: ${newAdmin.email}`);
      console.log(`Role: ${newAdmin.role}`);
    }

    console.log('\nAdmin setup complete. You can now log into the Admin Panel.\n');
  } catch (err) {
    console.error('[ERROR] Failed to configure admin account:', err.message);
    process.exit(1);
  } finally {
    await db.closeDb();
  }
}

createAdmin();
