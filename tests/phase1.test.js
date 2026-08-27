const assert = require('assert');
const http = require('http');
const app = require('../src/app');
const db = require('../src/database/db');
const { runMigrations } = require('../src/database/migrate');

let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  return { status: res.status, headers: res.headers, data };
}

async function runTests() {
  console.log('--- Starting ASALIA Phase 1 Automated Tests ---');

  // Ensure DB migrated
  await runMigrations();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`[TEST] Server running on ${baseUrl}`);

  try {
    // 1. Health check
    console.log('[TEST 1] Testing /api/health...');
    const health = await request('/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.success, true);
    console.log('✓ Health check passed');

    // 2. Settings check
    console.log('[TEST 2] Testing /api/settings...');
    const settings = await request('/api/settings');
    assert.strictEqual(settings.status, 200);
    assert.strictEqual(settings.data.success, true);
    assert.strictEqual(settings.data.data.siteName, 'ASALIA');
    assert.strictEqual(settings.data.data.supportWhatsApp, '+201030646757');
    console.log('✓ Settings check passed');

    // 3. User Registration
    const testUser = `cust_${Date.now()}`;
    const testEmail = `${testUser}@example.com`;
    console.log(`[TEST 3] Testing /api/auth/register with user: ${testUser}...`);
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        username: testUser,
        email: testEmail,
        password: 'Password123!',
        confirmPassword: 'Password123!'
      }
    });

    assert.strictEqual(regRes.status, 201);
    assert.strictEqual(regRes.data.success, true);
    assert.strictEqual(regRes.data.data.user.username, testUser);
    assert.strictEqual(regRes.data.data.user.role, 'CUSTOMER');
    assert.strictEqual(Number(regRes.data.data.user.balance), 0);
    console.log('✓ Registration passed');

    // 4. Duplicate Registration Guard
    console.log('[TEST 4] Testing duplicate username registration rejection...');
    const dupRes = await request('/api/auth/register', {
      method: 'POST',
      body: {
        username: testUser,
        email: 'other_email@test.com',
        password: 'Password123!'
      }
    });
    assert.strictEqual(dupRes.status, 409);
    assert.strictEqual(dupRes.data.success, false);
    assert.strictEqual(dupRes.data.error.code, 'USERNAME_TAKEN');
    console.log('✓ Duplicate registration prevention passed');

    // 5. User Login
    console.log('[TEST 5] Testing /api/auth/login...');
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        login: testUser,
        password: 'Password123!'
      }
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.data.success, true);
    const token = loginRes.data.data.token;
    assert.ok(token);
    console.log('✓ Login passed and token received');

    // 6. Get Profile /api/me
    console.log('[TEST 6] Testing /api/me with token...');
    const meRes = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.data.success, true);
    assert.strictEqual(meRes.data.data.user.username, testUser);
    console.log('✓ Profile verification passed');

    // 7. Admin Login
    console.log('[TEST 7] Testing Admin login (created via script)...');
    const adminLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: {
        login: 'asalia_admin',
        password: 'AsaliaSecret2026!'
      }
    });
    assert.strictEqual(adminLoginRes.status, 200);
    assert.strictEqual(adminLoginRes.data.data.user.role, 'ADMIN');
    console.log('✓ Admin login verified');

    console.log('\n=========================================');
    console.log('   ALL PHASE 1 AUTOMATED TESTS PASSED!   ');
    console.log('=========================================\n');
  } finally {
    server.close();
    await db.closeDb();
  }
}

runTests().catch(err => {
  console.error('[TEST ERROR]:', err);
  process.exit(1);
});
