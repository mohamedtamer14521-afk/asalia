const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigrations() {
  console.log('[ASALIA Database Migration] Starting migration check...');

  // Ensure migrations tracking table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[ASALIA Database Migration] No migrations directory found.');
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const executedRes = await db.query('SELECT filename FROM schema_migrations');
  const executedFiles = new Set(executedRes.rows.map(r => r.filename));

  let appliedCount = 0;

  for (const file of files) {
    if (!executedFiles.has(file)) {
      console.log(`[ASALIA Database Migration] Executing migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute migration script
      await db.exec(sql);
      await db.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );

      console.log(`[ASALIA Database Migration] Successfully applied: ${file}`);
      appliedCount++;
    }
  }

  if (appliedCount === 0) {
    console.log('[ASALIA Database Migration] Database schema is already up to date.');
  } else {
    console.log(`[ASALIA Database Migration] Successfully applied ${appliedCount} migration(s).`);
  }
}

if (require.main === module) {
  runMigrations()
    .then(async () => {
      await db.closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[ASALIA Database Migration ERROR]:', err);
      await db.closeDb();
      process.exit(1);
    });
}

module.exports = { runMigrations };
