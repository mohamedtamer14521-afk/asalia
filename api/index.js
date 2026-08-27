require('dotenv').config();
const app = require('../src/app');
const { runMigrations } = require('../src/database/migrate');

let migrationsRun = false;

// Middleware for serverless cold-start migration verification
app.use(async (req, res, next) => {
  if (!migrationsRun) {
    try {
      await runMigrations();
      migrationsRun = true;
    } catch (err) {
      console.error('[Vercel Serverless Migration Error]:', err);
    }
  }
  next();
});

module.exports = app;
