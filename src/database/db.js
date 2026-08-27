const path = require('path');
const fs = require('fs');
require('dotenv').config();

let pool = null;
let pgliteInstance = null;
let isPGlite = false;

async function getDb() {
  if (pool) return pool;
  if (pgliteInstance) return pgliteInstance;

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
    const { Pool } = require('pg');
    const isLocalhost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: isLocalhost ? false : { rejectUnauthorized: false }
    });
    isPGlite = false;
    return pool;
  } else {
    // Zero-config Embedded PostgreSQL engine (PGlite WASM)
    const { PGlite } = require('@electric-sql/pglite');
    const isTest = process.env.NODE_ENV === 'test';
    const dataDir = isTest
      ? path.join(process.cwd(), 'data', 'test_pg')
      : path.join(process.cwd(), 'data', 'asalia_pg');

    if (!fs.existsSync(path.dirname(dataDir))) {
      fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    }

    pgliteInstance = new PGlite(dataDir);
    isPGlite = true;
    return pgliteInstance;
  }
}

/**
 * Execute a SQL query with parameter binding
 * @param {string} text - SQL query string
 * @param {Array} [params] - Query parameters
 * @returns {Promise<{ rows: Array, rowCount: number }>}
 */
async function query(text, params = []) {
  const db = await getDb();
  if (isPGlite) {
    const res = await db.query(text, params);
    return {
      rows: res.rows || [],
      rowCount: res.rows ? res.rows.length : (res.affectedRows || 0)
    };
  } else {
    const res = await db.query(text, params);
    return {
      rows: res.rows || [],
      rowCount: res.rowCount || 0
    };
  }
}

/**
 * Execute callback within an isolated ACID database transaction
 * If callback throws, transaction rolls back automatically.
 * @param {Function} callback - async function(client)
 */
async function transaction(callback) {
  const db = await getDb();
  if (isPGlite) {
    // PGlite native transaction
    return await db.transaction(async (tx) => {
      const clientWrapper = {
        query: async (text, params = []) => {
          const res = await tx.query(text, params);
          return {
            rows: res.rows || [],
            rowCount: res.rows ? res.rows.length : (res.affectedRows || 0)
          };
        }
      };
      return await callback(clientWrapper);
    });
  } else {
    // pg.Pool client transaction
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const clientWrapper = {
        query: async (text, params = []) => {
          const res = await client.query(text, params);
          return {
            rows: res.rows || [],
            rowCount: res.rowCount || 0
          };
        }
      };
      const result = await callback(clientWrapper);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * Execute raw multi-statement SQL string (used for migrations and DDL scripts)
 * @param {string} sql - SQL script containing one or multiple statements
 */
async function exec(sql) {
  const db = await getDb();
  if (isPGlite) {
    if (typeof db.exec === 'function') {
      return await db.exec(sql);
    }
    // Fallback split statements if exec is not available
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    for (const stmt of statements) {
      await db.query(stmt);
    }
  } else {
    // In pg.Pool, client.query without parameters executes multiple statements
    const client = await db.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  }
}

async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (pgliteInstance) {
    await pgliteInstance.close();
    pgliteInstance = null;
  }
}

module.exports = {
  getDb,
  query,
  exec,
  transaction,
  closeDb,
  isPGliteEngine: () => isPGlite
};

