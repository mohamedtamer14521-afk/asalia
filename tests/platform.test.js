const assert = require('assert');
const http = require('http');
const app = require('../src/app');
const db = require('../src/database/db');
const { runMigrations } = require('../src/database/migrate');

let server;
let baseUrl;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const isFormData = options.body instanceof FormData;
  const headers = isFormData 
    ? { ...(options.headers || {}) }
    : { 'Content-Type': 'application/json', ...(options.headers || {}) };

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: isFormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined)
  });

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, headers: res.headers, data };
}

async function runPlatformTests() {
  console.log('===============================================================');
  console.log('       ASALIA — Comprehensive Production Platform Test Suite    ');
  console.log('===============================================================\n');

  await runMigrations();

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
  console.log(`[TEST] Server running at ${baseUrl}`);

  try {
    // -------------------------------------------------------------
    // TEST 1: Admin & Customer Authentication & Authorization Guard
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Testing Authentication & Authorization Guards...');
    // Admin login
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { login: 'asalia_admin', password: 'AsaliaSecret2026!' }
    });
    assert.strictEqual(adminLogin.status, 200, 'Admin login should succeed');
    const adminToken = adminLogin.data.data.token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    // Register Customer
    const testUsername = `cust_test_${Date.now()}`;
    const custReg = await request('/api/auth/register', {
      method: 'POST',
      body: {
        username: testUsername,
        email: `${testUsername}@example.com`,
        password: 'CustomerPass123!',
        confirmPassword: 'CustomerPass123!'
      }
    });
    assert.strictEqual(custReg.status, 201, 'Customer registration should succeed');
    const custToken = custReg.data.data.token;
    const custId = custReg.data.data.user.id;
    const custHeaders = { Authorization: `Bearer ${custToken}` };

    // Customer attempts to access Admin route => MUST BE FORBIDDEN (403)
    const unauthorizedAccess = await request('/api/admin/dashboard', { headers: custHeaders });
    assert.strictEqual(unauthorizedAccess.status, 403, 'Customer MUST NOT access admin routes');
    console.log('✓ Security: Customer forbidden from Admin endpoints (403)');

    // -------------------------------------------------------------
    // TEST 2: Payment Method Creation by Admin
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Testing Payment Method creation by Admin...');
    const pmRes = await request('/api/admin/payment-methods', {
      method: 'POST',
      headers: adminHeaders,
      body: {
        name_en: 'Vodafone Cash',
        name_ar: 'فودافون كاش',
        account_number: '01030646757',
        account_holder: 'ASALIA Business',
        instructions_en: 'Transfer via Vodafone Cash and upload receipt',
        instructions_ar: 'حول المبلغ عبر فودافون كاش ثم ارفع لقطة الشاشة للتحويل',
        min_deposit: 10,
        max_deposit: 50000
      }
    });
    assert.strictEqual(pmRes.status, 201);
    const paymentMethodId = pmRes.data.data.id;
    console.log(`✓ Payment Method #${paymentMethodId} (Vodafone Cash) created`);

    // -------------------------------------------------------------
    // TEST 3: Customer Submits Deposit with Payment Proof
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Customer submits deposit request with screenshot proof...');
    // Create simulated file buffer upload via FormData
    const formData = new FormData();
    formData.append('payment_method_id', String(paymentMethodId));
    formData.append('amount', '500');
    formData.append('sender_number', '01012345678');
    formData.append('transaction_reference', 'TXN-ABC-999');
    
    // Attach dummy screenshot blob
    const dummyImageBlob = new Blob(['FakePNGImageContentBufferForTestProof'], { type: 'image/png' });
    formData.append('screenshot', dummyImageBlob, 'proof.png');

    const depositRes = await request('/api/deposits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${custToken}` },
      body: formData
    });

    assert.strictEqual(depositRes.status, 201, 'Deposit submission should succeed');
    assert.strictEqual(depositRes.data.data.deposit.status, 'PENDING');
    assert.strictEqual(Number(depositRes.data.data.deposit.amount), 500);
    assert.ok(depositRes.data.data.whatsappUrl.includes('201030646757'));
    const depositId = depositRes.data.data.deposit.id;
    console.log(`✓ Deposit #${depositId} created with status PENDING`);

    // Verify Customer Balance is STILL 0 while deposit is Pending
    const balanceCheck1 = await request('/api/wallet/balance', { headers: custHeaders });
    assert.strictEqual(Number(balanceCheck1.data.data.balance), 0, 'Customer balance must NOT increase while Pending');
    console.log('✓ Verified: Customer balance is 0.00 EGP while deposit is Pending');

    // -------------------------------------------------------------
    // TEST 4: Admin Reviews & Approves Deposit
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Admin approves deposit and credits customer wallet...');
    const approveRes = await request(`/api/admin/deposits/${depositId}/approve`, {
      method: 'POST',
      headers: adminHeaders,
      body: { admin_notes: 'Confirmed on Vodafone Cash statement' }
    });

    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(Number(approveRes.data.data.newBalance), 500);
    console.log('✓ Deposit approved: customer wallet credited with 500.00 EGP');

    // Verify customer wallet balance is now 500.00 EGP
    const balanceCheck2 = await request('/api/wallet/balance', { headers: custHeaders });
    assert.strictEqual(Number(balanceCheck2.data.data.balance), 500);

    // Verify Ledger transaction
    const custTx = await request('/api/wallet/transactions', { headers: custHeaders });
    assert.strictEqual(custTx.data.data.transactions.length, 1);
    assert.strictEqual(custTx.data.data.transactions[0].type, 'DEPOSIT');
    assert.strictEqual(Number(custTx.data.data.transactions[0].amount), 500);
    console.log('✓ Wallet ledger transaction recorded accurately (DEPOSIT: +500 EGP)');

    // -------------------------------------------------------------
    // TEST 5: Duplicate Deposit Approval Guard
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Testing duplicate approval prevention...');
    const dupApproveRes = await request(`/api/admin/deposits/${depositId}/approve`, {
      method: 'POST',
      headers: adminHeaders,
      body: {}
    });
    assert.strictEqual(dupApproveRes.status, 400);
    assert.strictEqual(dupApproveRes.data.error.code, 'INVALID_DEPOSIT_STATE');
    console.log('✓ Duplicate approval strictly prevented by transactional guard');

    // -------------------------------------------------------------
    // TEST 6: Service Creation & Price Snapshot Verification
    // -------------------------------------------------------------
    console.log('\n[TEST 6] Testing Service setup & price snapshot...');
    const servRes = await request('/api/admin/services', {
      method: 'POST',
      headers: adminHeaders,
      body: {
        platform: 'tiktok',
        name_en: 'TikTok Video Views',
        name_ar: 'مشاهدات فيديو تيك توك',
        price_per_1000: 20.0000,
        min_quantity: 1000,
        max_quantity: 50000,
        link_type: 'tiktok_video'
      }
    });
    assert.strictEqual(servRes.status, 201);
    const serviceId = servRes.data.data.id;
    console.log(`✓ Service #${serviceId} created with price 20.00 EGP / 1000`);

    // Customer places order: 5,000 views @ 20 EGP / 1000 => 100 EGP charge
    console.log('Customer orders 5,000 TikTok views (Charge: 100 EGP)...');
    const orderRes = await request('/api/orders', {
      method: 'POST',
      headers: custHeaders,
      body: {
        service_id: serviceId,
        target_link: 'https://www.tiktok.com/@creator/video/71829102910',
        quantity: 5000
      }
    });
    assert.strictEqual(orderRes.status, 201);
    const orderId = orderRes.data.data.order.id;
    assert.strictEqual(Number(orderRes.data.data.order.charge), 100);
    assert.strictEqual(Number(orderRes.data.data.newBalance), 400);
    assert.strictEqual(orderRes.data.data.order.service_name_snap, 'TikTok Video Views');
    assert.strictEqual(Number(orderRes.data.data.order.service_price_snap), 20);
    console.log(`✓ Order #${orderId} created, 100 EGP deducted, balance is 400 EGP`);

    // Admin updates service price from 20 to 80 EGP
    console.log('Admin updates service price to 80 EGP / 1000...');
    await request(`/api/admin/services/${serviceId}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: { price_per_1000: 80.0000 }
    });

    // Verify that existing Order #orderId STILL retains the snapshotted price of 20 EGP and 100 EGP charge
    const verifyOrderSnap = await request(`/api/orders/${orderId}`, { headers: custHeaders });
    assert.strictEqual(Number(verifyOrderSnap.data.data.order.service_price_snap), 20);
    assert.strictEqual(Number(verifyOrderSnap.data.data.order.charge), 100);
    console.log('✓ Price Snapshot Verified: changing service price does NOT mutate existing orders');

    // -------------------------------------------------------------
    // TEST 7: Order Status Updates in Admin Panel
    // -------------------------------------------------------------
    console.log('\n[TEST 7] Admin manually updates order status to PROCESSING then COMPLETED...');
    const stat1 = await request(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: { status: 'PROCESSING' }
    });
    assert.strictEqual(stat1.status, 200);

    const stat2 = await request(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: { status: 'COMPLETED', admin_notes: 'Fulfillment completed manually' }
    });
    assert.strictEqual(stat2.status, 200);

    const orderVerify = await request(`/api/orders/${orderId}`, { headers: custHeaders });
    assert.strictEqual(orderVerify.data.data.order.status, 'COMPLETED');
    console.log('✓ Order status successfully transitioned to COMPLETED');

    // -------------------------------------------------------------
    // TEST 8: Order Cancellation and Atomic Refund
    // -------------------------------------------------------------
    console.log('\n[TEST 8] Testing Order Cancellation and Atomic Refund...');
    // Customer places second order: 2,000 views @ 80 EGP / 1000 => 160 EGP charge
    // Balance before: 400 EGP, Balance after: 240 EGP
    const order2Res = await request('/api/orders', {
      method: 'POST',
      headers: custHeaders,
      body: {
        service_id: serviceId,
        target_link: 'https://www.tiktok.com/@creator/video/99999999999',
        quantity: 2000
      }
    });
    assert.strictEqual(order2Res.status, 201);
    const order2Id = order2Res.data.data.order.id;
    assert.strictEqual(Number(order2Res.data.data.newBalance), 240);

    // Admin cancels and refunds order2
    const refundRes = await request(`/api/admin/orders/${order2Id}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: { status: 'REFUNDED', admin_notes: 'Customer requested cancellation' }
    });
    assert.strictEqual(refundRes.status, 200);
    assert.strictEqual(Number(refundRes.data.data.refundAmount), 160);
    assert.strictEqual(Number(refundRes.data.data.updatedBalance), 400);
    console.log('✓ Order #2 refunded atomically: 160 EGP returned to customer wallet');

    // Duplicate Refund Prevention
    const dupRefundRes = await request(`/api/admin/orders/${order2Id}/status`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: { status: 'REFUNDED' }
    });
    assert.strictEqual(dupRefundRes.status, 400);
    assert.strictEqual(dupRefundRes.data.error.code, 'ALREADY_REFUNDED');
    console.log('✓ Duplicate refund strictly blocked');

    // -------------------------------------------------------------
    // TEST 9: Admin Manual Balance Adjustment (Credit & Debit)
    // -------------------------------------------------------------
    console.log('\n[TEST 9] Testing Admin Manual Balance Adjustments...');
    // Credit 50 EGP
    const manualCredit = await request(`/api/admin/users/${custId}/balance`, {
      method: 'POST',
      headers: adminHeaders,
      body: { type: 'MANUAL_CREDIT', amount: 50, reason: 'Loyalty bonus credit' }
    });
    assert.strictEqual(manualCredit.status, 200);
    assert.strictEqual(Number(manualCredit.data.data.newBalance), 450);

    // Debit 20 EGP
    const manualDebit = await request(`/api/admin/users/${custId}/balance`, {
      method: 'POST',
      headers: adminHeaders,
      body: { type: 'MANUAL_DEBIT', amount: 20, reason: 'Correction debit' }
    });
    assert.strictEqual(manualDebit.status, 200);
    assert.strictEqual(Number(manualDebit.data.data.newBalance), 430);
    console.log('✓ Manual adjustments executed with audit entries (New Balance: 430 EGP)');

    // -------------------------------------------------------------
    // TEST 10: Support Tickets Flow
    // -------------------------------------------------------------
    console.log('\n[TEST 10] Testing Support Tickets creation...');
    const ticketRes = await request('/api/tickets', {
      method: 'POST',
      headers: custHeaders,
      body: {
        subject: 'Inquiry about manual delivery timing',
        category: 'Order Issue',
        order_id: orderId,
        message: 'Hello, when will my TikTok views be delivered?'
      }
    });
    assert.strictEqual(ticketRes.status, 201);
    assert.strictEqual(ticketRes.data.data.status, 'OPEN');
    console.log(`✓ Support ticket #${ticketRes.data.data.id} created successfully`);

    // -------------------------------------------------------------
    // TEST 11: Settings Management by Admin
    // -------------------------------------------------------------
    console.log('\n[TEST 11] Testing Admin Settings management...');
    const updateSettings = await request('/api/admin/settings', {
      method: 'POST',
      headers: adminHeaders,
      body: {
        settings: [
          { key: 'site_name', value: 'ASALIA Production' },
          { key: 'support_whatsapp', value: '+201030646757' }
        ]
      }
    });
    assert.strictEqual(updateSettings.status, 200);

    const publicSettings = await request('/api/settings');
    assert.strictEqual(publicSettings.data.data.siteName, 'ASALIA Production');
    assert.strictEqual(publicSettings.data.data.supportWhatsApp, '+201030646757');
    console.log('✓ Settings updated and reflected on public API');

    console.log('\n===============================================================');
    console.log('   ALL 11 COMPREHENSIVE PRODUCTION PLATFORM TESTS PASSED!      ');
    console.log('===============================================================\n');

  } finally {
    server.close();
    await db.closeDb();
  }
}

runPlatformTests().catch(err => {
  console.error('[FATAL PLATFORM TEST ERROR]:', err);
  process.exit(1);
});
