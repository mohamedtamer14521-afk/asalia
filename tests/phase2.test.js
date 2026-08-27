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

async function runPhase2Tests() {
  console.log('--- Starting ASALIA Phase 2 Automated Tests ---');

  await runMigrations();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  try {
    // 1. Create a Category and Service in DB
    console.log('[TEST 1] Setting up test Category and Service in PostgreSQL...');
    const catRes = await db.query(
      `INSERT INTO service_categories (name_en, name_ar, platform, icon)
       VALUES ('Instagram Followers', 'متابعين انستقرام', 'instagram', 'instagram')
       RETURNING id`
    );
    const catId = catRes.rows[0].id;

    const servRes = await db.query(
      `INSERT INTO services (
        category_id, platform, name_en, name_ar, description_en, price_per_1000,
        min_quantity, max_quantity, link_type, is_active
       ) VALUES (
        $1, 'instagram', 'Instagram Real Followers', 'متابعين حقيقيين انستقرام',
        'Real manual high-quality followers', 50.0000, 100, 10000, 'instagram_profile', true
       ) RETURNING id, price_per_1000`,
      [catId]
    );
    const serviceId = servRes.rows[0].id;
    console.log(`✓ Created Category #${catId} and Service #${serviceId}`);

    // 2. Fetch Services and Categories via API
    console.log('[TEST 2] Fetching services via GET /api/services...');
    const servicesRes = await request('/api/services');
    assert.strictEqual(servicesRes.status, 200);
    assert.ok(servicesRes.data.data.length > 0);
    const foundServ = servicesRes.data.data.find(s => s.id === serviceId);
    assert.ok(foundServ);
    assert.strictEqual(Number(foundServ.price_per_1000), 50);
    console.log('✓ Services fetched correctly');

    // 3. Register a test customer
    const username = `buyer_${Date.now()}`;
    const email = `${username}@example.com`;
    const regRes = await request('/api/auth/register', {
      method: 'POST',
      body: { username, email, password: 'SecurePassword123!', confirmPassword: 'SecurePassword123!' }
    });
    const token = regRes.data.data.token;
    const userId = regRes.data.data.user.id;
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 4. Test Insufficient Balance Rejection
    console.log('[TEST 3] Testing order placement with insufficient balance (0 EGP)...');
    const failOrder = await request('/api/orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        service_id: serviceId,
        target_link: 'https://instagram.com/real_customer_profile',
        quantity: 1000
      }
    });
    assert.strictEqual(failOrder.status, 400);
    assert.strictEqual(failOrder.data.error.code, 'INSUFFICIENT_BALANCE');
    console.log('✓ Insufficient balance correctly rejected');

    // 5. Test Link Validation
    console.log('[TEST 4] Testing invalid link rejection (e.g. invalid URL for instagram_profile)...');
    const invalidLinkOrder = await request('/api/orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        service_id: serviceId,
        target_link: 'not-a-valid-link',
        quantity: 1000
      }
    });
    assert.strictEqual(invalidLinkOrder.status, 400);
    assert.strictEqual(invalidLinkOrder.data.error.code, 'INVALID_LINK_FORMAT');
    console.log('✓ Invalid link correctly rejected');

    // 6. Credit customer balance directly in DB to simulate approved deposit
    console.log('[TEST 5] Crediting test customer with 500.00 EGP balance...');
    await db.query('UPDATE users SET balance = 500.0000 WHERE id = $1', [userId]);

    // 7. Place a valid order
    // Quantity 2000 @ 50 EGP / 1000 => Expected Charge: 100.00 EGP
    console.log('[TEST 6] Placing valid order (Qty: 2000 => Expected Charge: 100 EGP)...');
    const orderRes = await request('/api/orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        service_id: serviceId,
        target_link: 'https://instagram.com/real_customer_profile',
        quantity: 2000
      }
    });

    assert.strictEqual(orderRes.status, 201);
    assert.strictEqual(orderRes.data.success, true);
    assert.strictEqual(Number(orderRes.data.data.order.charge), 100);
    assert.strictEqual(Number(orderRes.data.data.newBalance), 400);
    assert.strictEqual(orderRes.data.data.order.status, 'PENDING');
    assert.strictEqual(orderRes.data.data.order.service_name_snap, 'Instagram Real Followers');
    assert.ok(orderRes.data.data.whatsappUrl.includes('201030646757'));
    const orderId = orderRes.data.data.order.id;
    console.log(`✓ Order #${orderId} created successfully, 100 EGP atomically deducted, balance is 400 EGP`);

    // 8. Test 10-Second Duplicate Order Protection
    console.log('[TEST 7] Testing 10-second duplicate order protection...');
    const dupOrderRes = await request('/api/orders', {
      method: 'POST',
      headers: authHeaders,
      body: {
        service_id: serviceId,
        target_link: 'https://instagram.com/real_customer_profile',
        quantity: 2000
      }
    });
    assert.strictEqual(dupOrderRes.status, 400);
    assert.strictEqual(dupOrderRes.data.error.code, 'DUPLICATE_ORDER_PREVENTED');
    console.log('✓ 10-second duplicate order prevention passed');

    // 9. Verify Ledger Transaction
    console.log('[TEST 8] Verifying wallet transactions ledger entry...');
    const txRes = await request('/api/wallet/transactions', { headers: authHeaders });
    assert.strictEqual(txRes.status, 200);
    assert.strictEqual(txRes.data.data.transactions.length, 1);
    const tx = txRes.data.data.transactions[0];
    assert.strictEqual(tx.type, 'ORDER_CHARGE');
    assert.strictEqual(Number(tx.amount), -100);
    assert.strictEqual(Number(tx.balance_after), 400);
    assert.strictEqual(tx.reference_id, String(orderId));
    console.log('✓ Ledger transaction accurately recorded');

    // 10. Verify Dashboard Statistics
    console.log('[TEST 9] Verifying customer dashboard stats...');
    const dashRes = await request('/api/dashboard', { headers: authHeaders });
    assert.strictEqual(dashRes.status, 200);
    assert.strictEqual(dashRes.data.data.totalOrders, 1);
    assert.strictEqual(dashRes.data.data.pendingOrders, 1);
    assert.strictEqual(dashRes.data.data.totalSpent, 100);
    assert.strictEqual(dashRes.data.data.balance, 400);
    console.log('✓ Dashboard stats correctly computed from PostgreSQL');

    console.log('\n=========================================');
    console.log('   ALL PHASE 2 AUTOMATED TESTS PASSED!   ');
    console.log('=========================================\n');
  } finally {
    server.close();
    await db.closeDb();
  }
}

runPhase2Tests().catch(err => {
  console.error('[PHASE 2 TEST ERROR]:', err);
  process.exit(1);
});
