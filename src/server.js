require('dotenv').config();
const http = require('http');
const app = require('./app');
const { runMigrations } = require('./database/migrate');
const db = require('./database/db');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Run database migrations automatically on server boot
    await runMigrations();

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`
==========================================================
  ASALIA — SMM Order & Manual Fulfillment Platform
  Server listening on: http://localhost:${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
  Database: ${db.isPGliteEngine() ? 'PGlite Embedded PostgreSQL' : 'External PostgreSQL Pool'}
==========================================================
      `);
    });

    // Graceful Shutdown
    const shutdown = async () => {
      console.log('\n[ASALIA Server] Gracefully shutting down...');
      server.close(async () => {
        await db.closeDb();
        console.log('[ASALIA Server] Database closed. Exited.');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('[ASALIA FATAL ERROR during startup]:', err);
    process.exit(1);
  }
}

startServer();
