/**
 * ASALIA Admin Control Panel Controller
 */

let currentAdmin = null;
let pollInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initAdminApp();
});

async function initAdminApp() {
  try {
    const data = await window.api.get('/auth/me');
    if (data && data.user && data.user.role === 'ADMIN') {
      showAdminWorkspace(data.user);
      return;
    }
    showAdminLoginScreen();
  } catch (err) {
    showAdminLoginScreen();
  }
}

function showAdminWorkspace(user) {
  currentAdmin = user;
  const loginScreen = document.getElementById('admin-login-screen');
  const workspace = document.getElementById('admin-workspace-layout');
  if (loginScreen) loginScreen.style.display = 'none';
  if (workspace) workspace.style.display = 'flex';

  const nameBadge = document.getElementById('admin-name-badge');
  if (nameBadge) nameBadge.textContent = currentAdmin.username;

  loadAdminDashboard();
  startAdminPolling();
}

function showAdminLoginScreen() {
  const loginScreen = document.getElementById('admin-login-screen');
  const workspace = document.getElementById('admin-workspace-layout');
  if (workspace) workspace.style.display = 'none';
  if (loginScreen) loginScreen.style.display = 'flex';
}

async function handleDirectAdminLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('adm-login-btn');
  const login = document.getElementById('adm-login-input').value.trim();
  const password = document.getElementById('adm-password-input').value;

  btn.disabled = true;
  btn.textContent = 'جاري التحقق...';

  try {
    const res = await window.api.post('/auth/login', { login, password });
    if (res.user.role !== 'ADMIN') {
      showToast('عفواً، هذا الحساب ليس لديه صلاحيات المسؤول.', 'error');
      return;
    }

    if (res.token) {
      localStorage.setItem('asalia_token', res.token);
    }

    showToast('مرحباً بك في لوحة تحكم الإدارة!', 'success');
    showAdminWorkspace(res.user);
  } catch (err) {
    showToast(err.message || 'بيانات الدخول غير صحيحة', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'دخول لوحة التحكم';
  }
}

function switchAdminTab(tabId) {
  document.querySelectorAll('.admin-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.admin-nav-item a').forEach(el => el.classList.remove('active'));

  const pane = document.getElementById(`admin-tab-${tabId}`);
  const link = document.getElementById(`tab-link-${tabId}`);

  if (pane) pane.classList.add('active');
  if (link) link.classList.add('active');

  if (tabId === 'dashboard') loadAdminDashboard();
  if (tabId === 'deposits') loadAdminDeposits();
  if (tabId === 'orders') loadAdminOrders();
  if (tabId === 'users') loadAdminUsers();
  if (tabId === 'services') loadAdminServices();
  if (tabId === 'payment-methods') loadAdminPaymentMethods();
  if (tabId === 'settings') loadAdminSettings();
  if (tabId === 'logs') loadAdminLogs();
}

let lastPendingDeposits = null;
let lastPendingOrders = null;

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch (e) {}
}

function startAdminPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    try {
      const data = await window.api.get('/admin/dashboard');
      updateAdminDashboardUI(data);

      // Check if new orders arrived since last poll
      if (lastPendingOrders !== null && data.pendingOrders > lastPendingOrders) {
        playNotificationSound();
        showToast(`🔔 وصل ${data.pendingOrders - lastPendingOrders} طلب جديد ينتظر التنفيذ!`, 'info');
        const ordersTab = document.getElementById('admin-tab-orders');
        if (ordersTab && ordersTab.classList.contains('active')) loadAdminOrders();
      }

      // Check if new deposits arrived since last poll
      if (lastPendingDeposits !== null && data.pendingDeposits > lastPendingDeposits) {
        playNotificationSound();
        showToast(`💳 وصل ${data.pendingDeposits - lastPendingDeposits} إيداع جديد ينتظر المراجعة!`, 'success');
        const depTab = document.getElementById('admin-tab-deposits');
        if (depTab && depTab.classList.contains('active')) loadAdminDeposits();
      }

      lastPendingOrders = data.pendingOrders;
      lastPendingDeposits = data.pendingDeposits;

      // Update sidebar notification badges
      const depBadge = document.getElementById('sidebar-pending-deposits-badge');
      if (depBadge) {
        depBadge.textContent = data.pendingDeposits;
        depBadge.style.display = data.pendingDeposits > 0 ? 'inline-flex' : 'none';
      }

      const ordBadge = document.getElementById('sidebar-pending-orders-badge');
      if (ordBadge) {
        ordBadge.textContent = data.pendingOrders;
        ordBadge.style.display = data.pendingOrders > 0 ? 'inline-flex' : 'none';
      }
    } catch (e) {
      // Polling network drop handle
    }
  }, 10000);
}

// -------------------------------------------------------------
// DASHBOARD METRICS
// -------------------------------------------------------------
async function loadAdminDashboard() {
  try {
    const data = await window.api.get('/admin/dashboard');
    updateAdminDashboardUI(data);
  } catch (err) {
    showToast(err.message || 'Failed to load dashboard metrics', 'error');
  }
}

function updateAdminDashboardUI(data) {
  document.getElementById('adm-stat-pending-deposits').textContent = data.pendingDeposits;
  document.getElementById('adm-stat-pending-orders').textContent = data.pendingOrders;
  document.getElementById('adm-stat-processing-orders').textContent = data.processingOrders;
  document.getElementById('adm-stat-completed-orders').textContent = data.completedOrders;
  document.getElementById('adm-stat-customers').textContent = data.totalCustomers;
  document.getElementById('adm-stat-total-deposits').textContent = `${data.totalDepositAmount.toFixed(2)} EGP`;
}

// -------------------------------------------------------------
// DEPOSITS MANAGEMENT
// -------------------------------------------------------------
async function loadAdminDeposits() {
  const tbody = document.getElementById('adm-deposits-tbody');
  const status = document.getElementById('adm-deposits-filter-status').value;
  tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 35px;">${window.createIosSpinner()}</td></tr>`;

  try {
    const res = await window.api.get(`/admin/deposits?status=${status}`);
    if (!res.deposits || res.deposits.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد طلبات إيداع مطابقة.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.deposits.map(d => `
      <tr>
        <td><strong>#${d.id}</strong></td>
        <td>
          <strong>${d.customer_username}</strong><br>
          <small style="color:var(--text-muted);">${d.customer_email}</small>
        </td>
        <td><strong style="color:var(--success); font-size:1.05rem;">${Number(d.amount).toFixed(2)} EGP</strong></td>
        <td>${d.payment_method_name_snap}</td>
        <td><code>${d.sender_number}</code></td>
        <td><code>${d.transaction_reference || 'N/A'}</code></td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="viewProofImage(${d.id})">
            🖼️ عرض الإيصال
          </button>
        </td>
        <td><span class="badge badge-${d.status.toLowerCase()}">${d.status}</span></td>
        <td>${new Date(d.created_at).toLocaleString()}</td>
        <td>
          ${d.status === 'PENDING' ? `
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-success btn-sm" onclick="approveDeposit(${d.id}, ${d.amount})">
                ✓ قبول وشحن
              </button>
              <button class="btn btn-danger btn-sm" onclick="rejectDeposit(${d.id})">
                ✕ رفض
              </button>
            </div>
          ` : `
            <span style="color:var(--text-muted); font-size:0.85rem;">مكتمل (${d.status})</span>
          `}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--danger);">${err.message}</td></tr>`;
  }
}

function viewProofImage(depositId) {
  const img = document.getElementById('proof-img');
  img.src = `/api/admin/deposits/${depositId}/proof?t=${Date.now()}`;
  openModal('proof-modal');
}

async function approveDeposit(depositId, amount) {
  if (!confirm(`هل أنت متأكد من قبول الإيداع رقم #${depositId} وشحن مبلغ ${Number(amount).toFixed(2)} ج.م لحساب العميل؟`)) {
    return;
  }

  try {
    const res = await window.api.post(`/admin/deposits/${depositId}/approve`, {
      admin_notes: 'Approved via Admin Panel'
    });
    showToast(res.message || 'Deposit approved!', 'success');
    loadAdminDeposits();
    loadAdminDashboard();
  } catch (err) {
    showToast(err.message || 'Approval failed', 'error');
  }
}

async function rejectDeposit(depositId) {
  const reason = prompt('أدخل سبب رفض الإيداع (سيظهر للعميل):', 'بيانات التحويل غير مطابقة أو لم يصل التحويل');
  if (!reason) return;

  try {
    const res = await window.api.post(`/admin/deposits/${depositId}/reject`, {
      admin_notes: reason
    });
    showToast(res.message || 'Deposit rejected', 'info');
    loadAdminDeposits();
    loadAdminDashboard();
  } catch (err) {
    showToast(err.message || 'Reject failed', 'error');
  }
}

// -------------------------------------------------------------
// ORDERS MANAGEMENT
// -------------------------------------------------------------
async function loadAdminOrders() {
  const tbody = document.getElementById('adm-orders-tbody');
  const status = document.getElementById('adm-orders-filter-status').value;
  const search = document.getElementById('adm-orders-search').value;
  tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 35px;">${window.createIosSpinner()}</td></tr>`;

  try {
    const res = await window.api.get(`/admin/orders?status=${status}&search=${encodeURIComponent(search)}`);
    if (!res.orders || res.orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد طلبات مطابقة.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.orders.map(o => `
      <tr>
        <td><strong>#${o.id}</strong></td>
        <td><strong>${o.customer_username_snap}</strong></td>
        <td>${o.service_name_snap}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px; max-width: 220px;">
            <a href="${o.target_link}" target="_blank" rel="noopener" style="color: var(--apple-blue); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; font-weight: 500;" title="${o.target_link}">
              🔗 ${o.target_link}
            </a>
            <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; font-size: 0.75rem; flex-shrink: 0;" onclick="navigator.clipboard.writeText('${o.target_link}'); showToast('تم نسخ الرابط بنجاح! 📋', 'success')" title="نسخ الرابط">
              📋
            </button>
          </div>
          ${o.username ? `<small style="color:var(--text-muted);">@${o.username}</small>` : ''}
        </td>
        <td><strong>${o.quantity}</strong></td>
        <td><strong>${Number(o.charge).toFixed(2)} EGP</strong></td>
        <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
        <td>${new Date(o.created_at).toLocaleString()}</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center;">
            <select class="form-select" style="padding: 4px 8px; font-size: 0.85rem;" onchange="updateOrderStatus(${o.id}, this.value)">
              <option value="">تغيير الحالة...</option>
              <option value="PROCESSING">قيد المعالجة</option>
              <option value="IN_PROGRESS">قيد التنفيذ</option>
              <option value="COMPLETED">مكتمل</option>
              <option value="CANCELED">إلغاء بدون استرجاع</option>
              <option value="REFUNDED">إلغاء واسترجاع المبلغ للعميل</option>
            </select>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger);">${err.message}</td></tr>`;
  }
}

async function updateOrderStatus(orderId, newStatus) {
  if (!newStatus) return;

  if (newStatus === 'REFUNDED') {
    if (!confirm(`تنبيه مالي: هل أنت متأكد من إلغاء الطلب #${orderId} واسترجاع المبلغ بالكامل إلى محفظة العميل فوراً؟`)) {
      loadAdminOrders();
      return;
    }
  }

  try {
    const res = await window.api.patch(`/admin/orders/${orderId}/status`, {
      status: newStatus,
      admin_notes: `Manual status change to ${newStatus}`
    });
    showToast(res.message || 'Status updated', 'success');
    loadAdminOrders();
    loadAdminDashboard();
  } catch (err) {
    showToast(err.message || 'Status update failed', 'error');
    loadAdminOrders();
  }
}

// -------------------------------------------------------------
// USERS MANAGEMENT
// -------------------------------------------------------------
async function loadAdminUsers() {
  const tbody = document.getElementById('adm-users-tbody');
  const search = document.getElementById('adm-users-search').value;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 35px;">${window.createIosSpinner()}</td></tr>`;

  try {
    const res = await window.api.get(`/admin/users?search=${encodeURIComponent(search)}`);
    if (!res.users || res.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">لا يوجد عملاء مسجلون.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.users.map(u => `
      <tr>
        <td><strong>#${u.id}</strong></td>
        <td><strong>${u.username}</strong></td>
        <td>${u.email}</td>
        <td><strong style="color:var(--success); font-size:1.05rem;">${Number(u.balance).toFixed(2)} EGP</strong></td>
        <td>${u.total_orders}</td>
        <td>${Number(u.total_spent).toFixed(2)} EGP</td>
        <td>
          <span class="badge ${u.is_active ? 'badge-completed' : 'badge-rejected'}">
            ${u.is_active ? 'نشط' : 'معطل'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-secondary btn-sm" onclick="adjustUserBalance(${u.id}, '${u.username}', ${u.balance})">
              💰 تعديل الرصيد
            </button>
            <button class="btn btn-${u.is_active ? 'danger' : 'success'} btn-sm" onclick="toggleUserActive(${u.id}, ${!u.is_active})">
              ${u.is_active ? 'تعطيل' : 'تفعيل'}
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger);">${err.message}</td></tr>`;
  }
}

async function adjustUserBalance(userId, username, currentBalance) {
  const action = prompt(`تعديل رصيد العميل (${username})\nرصيده الحالي: ${Number(currentBalance).toFixed(2)} EGP\n\nأدخل 1 لإضافة رصيد (شحن يدوي)\nأدخل 2 لخصم رصيد (خصم يدوي):`, '1');
  if (action !== '1' && action !== '2') return;

  const type = action === '1' ? 'MANUAL_CREDIT' : 'MANUAL_DEBIT';
  const amountStr = prompt(`أدخل المبلغ المطلوب ${type === 'MANUAL_CREDIT' ? 'إضافته' : 'خصمه'} بالجنيه:`);
  if (!amountStr || isNaN(parseFloat(amountStr))) return;

  const reason = prompt('أدخل سبب العملية (إلزامي لسجل التدقيق الأمني):');
  if (!reason) {
    alert('السبب إلزامي لتسجيل العملية في سجل الأمان.');
    return;
  }

  try {
    const res = await window.api.post(`/admin/users/${userId}/balance`, {
      type,
      amount: parseFloat(amountStr),
      reason
    });
    showToast(res.message || 'Balance updated', 'success');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message || 'Adjustment failed', 'error');
  }
}

async function toggleUserActive(userId, makeActive) {
  if (!confirm(`هل أنت متأكد من ${makeActive ? 'تفعيل' : 'تعطيل'} هذا الحساب؟`)) return;
  try {
    const res = await window.api.patch(`/admin/users/${userId}/status`, { is_active: makeActive });
    showToast(res.message, 'info');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// -------------------------------------------------------------
// SERVICES MANAGEMENT
// -------------------------------------------------------------
let adminAllServices = [];
let adminCurrentPlatform = 'all';

function getPlatformIcon(platform) {
  const p = (platform || '').toLowerCase();
  if (p.includes('insta')) return '📷';
  if (p.includes('tik')) return '🎵';
  if (p.includes('you')) return '▶️';
  if (p.includes('face')) return '🔵';
  if (p.includes('tele')) return '✈️';
  if (p.includes('twit') || p === 'x') return '𝕏';
  if (p.includes('what')) return '💬';
  if (p.includes('snap')) return '👻';
  return '🌟';
}

async function loadAdminServices() {
  const tbody = document.getElementById('adm-services-tbody');
  tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 35px;">${window.createIosSpinner()}</td></tr>`;

  try {
    const services = await window.api.get('/services');
    adminAllServices = services || [];
    renderAdminServicesTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--danger);">${err.message}</td></tr>`;
  }
}

function filterAdminByPlatform(platform, btnElement) {
  adminCurrentPlatform = (platform || 'all').toLowerCase();
  document.querySelectorAll('#admin-tab-services .platform-pill-btn').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  renderAdminServicesTable();
}

function filterAdminServices() {
  renderAdminServicesTable();
}

function renderAdminServicesTable() {
  const tbody = document.getElementById('adm-services-tbody');
  const query = (document.getElementById('adm-services-search')?.value || '').toLowerCase().trim();

  let filtered = adminAllServices;

  if (adminCurrentPlatform && adminCurrentPlatform !== 'all') {
    filtered = filtered.filter(s => s.platform?.toLowerCase() === adminCurrentPlatform);
  }

  if (query) {
    filtered = filtered.filter(s => {
      const text = `${s.id} ${s.name_ar || ''} ${s.name_en || ''} ${s.platform || ''}`.toLowerCase();
      return text.includes(query);
    });
  }

  if (!filtered || filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد خدمات مطابقة.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(s => `
    <tr>
      <td><strong>#${s.id}</strong></td>
      <td>
        <div style="width: 38px; height: 38px; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color);">
          ${s.image_url ? `<img src="${s.image_url}" style="width:100%; height:100%; object-fit:cover;">` : `<span style="font-size:1.15rem;">${getPlatformIcon(s.platform)}</span>`}
        </div>
      </td>
      <td><span class="badge badge-in-progress">${s.platform}</span></td>
      <td>
        <strong>${s.name_ar}</strong><br>
        <small style="color:var(--text-muted);">${s.name_en}</small>
      </td>
      <td><strong>${Number(s.price_per_1000).toFixed(2)} EGP</strong></td>
      <td>${s.min_quantity}</td>
      <td>${s.max_quantity}</td>
      <td><code>${s.link_type}</code></td>
      <td>
        <span class="badge ${s.is_active ? 'badge-completed' : 'badge-rejected'}">
          ${s.is_active ? 'مفعل' : 'معطل'}
        </span>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-outline btn-sm" onclick="editServicePrice(${s.id}, ${s.price_per_1000})">
            السعر
          </button>
          <button class="btn btn-${s.is_active ? 'secondary' : 'success'} btn-sm" onclick="toggleServiceActive(${s.id}, ${!s.is_active})">
            ${s.is_active ? 'تعطيل' : 'تفعيل'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteService(${s.id}, '${s.name_ar}')">
            حذف
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function toggleServiceActive(serviceId, makeActive) {
  try {
    await window.api.put(`/admin/services/${serviceId}`, {
      is_active: makeActive
    });
    showToast(makeActive ? 'تم تفعيل الخدمة' : 'تم تعطيل الخدمة', 'info');
    loadAdminServices();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteService(serviceId, serviceName) {
  if (!confirm(`هل أنت متأكد من حذف الخدمة (${serviceName}) نهائياً؟`)) return;
  try {
    await window.api.delete(`/admin/services/${serviceId}`);
    showToast('تم حذف الخدمة بنجاح!', 'success');
    loadAdminServices();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function editServicePrice(serviceId, currentPrice) {
  const newPrice = prompt(`تعديل سعر الخدمة #${serviceId}\nالسعر الحالي لكل 1000: ${currentPrice} EGP\n\nأدخل السعر الجديد لكل 1000:`, currentPrice);
  if (!newPrice || isNaN(parseFloat(newPrice))) return;

  try {
    await window.api.put(`/admin/services/${serviceId}`, {
      price_per_1000: parseFloat(newPrice)
    });
    showToast('تم تحديث سعر الخدمة بنجاح!', 'success');
    loadAdminServices();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateServiceImagePreview(url) {
  const container = document.getElementById('modal-service-img-preview');
  const img = document.getElementById('modal-service-preview-tag');
  if (url && url.trim()) {
    img.src = url.trim();
    img.onerror = () => { if (container) container.style.display = 'none'; };
    img.onload = () => { if (container) container.style.display = 'block'; };
  } else {
    if (container) container.style.display = 'none';
  }
}

async function uploadDirectServiceImage(input) {
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  showToast('جاري رفع صورة الخدمة من جهازك...', 'info');
  try {
    const res = await window.api.request('/admin/upload-image', {
      method: 'POST',
      body: formData
    });

    document.getElementById('modal-service-image').value = res.url;
    updateServiceImagePreview(res.url);
    showToast('تم رفع صورة الخدمة بنجاح! 📸', 'success');
  } catch (err) {
    showToast(err.message || 'فشل رفع صورة الخدمة', 'error');
  }
}

let adminCategories = [];

async function loadAdminCategories() {
  try {
    adminCategories = await window.api.get('/services/categories');
    const catSelect = document.getElementById('modal-service-category');
    if (catSelect && adminCategories && adminCategories.length > 0) {
      catSelect.innerHTML = '<option value="">-- ربط تلقائي حسب المنصة --</option>' +
        adminCategories.map(c => `<option value="${c.id}">${c.name_ar} (${c.platform})</option>`).join('');
    }
  } catch (e) {
    console.error('Failed to load admin categories:', e);
  }
}

function openCreateServiceModal() {
  loadAdminCategories();
  const modal = document.getElementById('create-service-modal');
  if (modal) {
    modal.style.display = 'flex';
    const form = document.getElementById('create-service-form');
    if (form) form.reset();
    const preview = document.getElementById('modal-service-img-preview');
    if (preview) preview.style.display = 'none';
  }
}

function closeCreateServiceModal() {
  const modal = document.getElementById('create-service-modal');
  if (modal) modal.style.display = 'none';
}

function onModalPlatformChanged(platform) {
  const catSelect = document.getElementById('modal-service-category');
  if (!catSelect || !adminCategories || adminCategories.length === 0) return;
  const match = adminCategories.find(c => c.platform.toLowerCase() === platform.toLowerCase());
  if (match) {
    catSelect.value = match.id;
  } else {
    catSelect.value = '';
  }
}

async function submitCreateService(e) {
  e.preventDefault();
  const platform = document.getElementById('modal-service-platform').value;
  const category_id = document.getElementById('modal-service-category').value;
  const name_ar = document.getElementById('modal-service-name-ar').value.trim();
  const name_en = document.getElementById('modal-service-name-en').value.trim();
  const price = document.getElementById('modal-service-price').value;
  const min = document.getElementById('modal-service-min').value;
  const max = document.getElementById('modal-service-max').value;
  const link_type = document.getElementById('modal-service-linktype').value;
  const processing_time_info = document.getElementById('modal-service-speed').value.trim();
  const image_url = document.getElementById('modal-service-image')?.value.trim() || '';

  try {
    await window.api.post('/admin/services', {
      platform,
      category_id: category_id ? parseInt(category_id, 10) : undefined,
      name_ar,
      name_en,
      price_per_1000: parseFloat(price),
      min_quantity: parseInt(min, 10),
      max_quantity: parseInt(max, 10),
      link_type,
      processing_time_info,
      image_url
    });

    showToast('تمت إضافة الخدمة وحفظ صورتها بنجاح!', 'success');
    closeCreateServiceModal();
    loadAdminServices();
  } catch (err) {
    showToast(err.message || 'فشل إضافة الخدمة', 'error');
  }
}

// -------------------------------------------------------------
// PAYMENT METHODS MANAGEMENT
// -------------------------------------------------------------
async function loadAdminPaymentMethods() {
  const tbody = document.getElementById('adm-pm-tbody');
  tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 35px;">${window.createIosSpinner()}</td></tr>`;

  try {
    const methods = await window.api.get('/admin/payment-methods');
    if (!methods || methods.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد وسائل دفع مضافة.</td></tr>`;
      return;
    }

    tbody.innerHTML = methods.map(m => `
      <tr>
        <td><strong>#${m.id}</strong></td>
        <td>
          <strong>${m.name_ar}</strong><br>
          <small style="color:var(--text-muted);">${m.name_en}</small>
        </td>
        <td><strong style="color:var(--accent);">${m.account_number}</strong></td>
        <td>${m.account_holder || '--'}</td>
        <td>${Number(m.min_deposit).toFixed(2)} EGP</td>
        <td>${Number(m.max_deposit).toFixed(2)} EGP</td>
        <td>
          <span class="badge ${m.is_active ? 'badge-completed' : 'badge-rejected'}">
            ${m.is_active ? 'نشط' : 'معطل'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-outline btn-sm" onclick="editPaymentMethodNumber(${m.id}, '${m.account_number}')">
              الرقم
            </button>
            <button class="btn btn-${m.is_active ? 'secondary' : 'success'} btn-sm" onclick="togglePaymentMethodActive(${m.id}, ${!m.is_active})">
              ${m.is_active ? 'تعطيل' : 'تفعيل'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="deletePaymentMethod(${m.id}, '${m.name_ar}')">
              حذف
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger);">${err.message}</td></tr>`;
  }
}

async function editPaymentMethodNumber(id, currentNum) {
  const newNum = prompt(`تعديل رقم التحويل / الحساب لوسيلة الدفع #${id}:`, currentNum);
  if (!newNum || !newNum.trim()) return;

  try {
    await window.api.request(`/admin/payment-methods/${id}`, {
      method: 'PUT',
      body: { account_number: newNum.trim() }
    });
    showToast('تم تحديث رقم الحساب بنجاح!', 'success');
    loadAdminPaymentMethods();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function togglePaymentMethodActive(id, makeActive) {
  try {
    await window.api.request(`/admin/payment-methods/${id}`, {
      method: 'PUT',
      body: { is_active: makeActive }
    });
    showToast(makeActive ? 'تم تفعيل وسيلة الدفع' : 'تم تعطيل وسيلة الدفع', 'info');
    loadAdminPaymentMethods();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePaymentMethod(id, name) {
  if (!confirm(`هل أنت متأكد من حذف وسيلة الدفع (${name}) نهائياً؟`)) return;
  try {
    await window.api.delete(`/admin/payment-methods/${id}`);
    showToast('تم حذف وسيلة الدفع بنجاح!', 'success');
    loadAdminPaymentMethods();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openCreatePaymentMethodModal() {
  const name_ar = prompt('اسم وسيلة الدفع بالعربية (مثال: فودافون كاش):', 'فودافون كاش');
  if (!name_ar) return;
  const name_en = prompt('اسم وسيلة الدفع بالإنجليزية (مثال: Vodafone Cash):', 'Vodafone Cash');
  if (!name_en) return;
  const account_number = prompt('رقم التحويل / المحفظة:', '01030646757');
  if (!account_number) return;
  const instructions_ar = prompt('تعليمات التحويل للعميل:', 'حول المبلغ عبر فودافون كاش ثم ارفع لقطة الشاشة لرسالة التأكيد.');

  window.api.post('/admin/payment-methods', {
    name_ar, name_en, account_number,
    instructions_ar: instructions_ar || '',
    min_deposit: 10, max_deposit: 50000
  }).then(() => {
    showToast('تمت إضافة وسيلة الدفع بنجاح!', 'success');
    loadAdminPaymentMethods();
  }).catch(err => {
    showToast(err.message, 'error');
  });
}

async function uploadDirectLogo(input) {
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  showToast('جاري رفع صورة اللوجو من جهازك...', 'info');
  try {
    const res = await window.api.request('/admin/upload-image', {
      method: 'POST',
      body: formData
    });

    document.getElementById('set-site-logo').value = res.url;
    updateLogoPreview(res.url);
    showToast('تم رفع الصورة بنجاح! اضغط على "حفظ التغييرات" لتثبيتها.', 'success');
  } catch (err) {
    showToast(err.message || 'فشل رفع الصورة', 'error');
  }
}

function updateLogoPreview(url) {
  const container = document.getElementById('logo-preview-container');
  const img = document.getElementById('set-logo-preview');
  if (url && url.trim()) {
    img.src = url.trim();
    img.onerror = () => { if (container) container.style.display = 'none'; };
    img.onload = () => { if (container) container.style.display = 'block'; };
  } else {
    if (container) container.style.display = 'none';
  }
}

async function loadAdminSettings() {
  try {
    const settings = await window.api.get('/admin/settings');
    const map = {};
    settings.forEach(s => { map[s.key] = s.value; });

    document.getElementById('set-site-name').value = map.site_name || 'ASALIA';
    document.getElementById('set-site-logo').value = map.site_logo_url || '';
    document.getElementById('set-site-favicon').value = map.site_favicon_url || '';
    document.getElementById('set-support-whatsapp').value = map.support_whatsapp || '+201030646757';
    document.getElementById('set-announcement-ar').value = map.announcement_ar || '';
    document.getElementById('set-announcement-en').value = map.announcement_en || '';
    document.getElementById('set-rate-usd').value = map.exchange_rate_usd || '0.020';
    document.getElementById('set-registration-enabled').value = map.registration_enabled || 'true';
    document.getElementById('set-maintenance-mode').value = map.maintenance_mode || 'false';

    updateLogoPreview(map.site_logo_url || '');

    if (map.site_name) {
      document.querySelectorAll('.logo-text').forEach(el => el.textContent = map.site_name);
    }
    if (map.site_logo_url && map.site_logo_url.trim()) {
      document.querySelectorAll('.logo-badge').forEach(el => {
        el.innerHTML = `<img src="${map.site_logo_url}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 6px;">`;
        el.style.background = 'transparent';
      });
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveAdminSettings() {
  const settings = [
    { key: 'site_name', value: document.getElementById('set-site-name').value.trim() },
    { key: 'site_logo_url', value: document.getElementById('set-site-logo').value.trim() },
    { key: 'site_favicon_url', value: document.getElementById('set-site-favicon').value.trim() },
    { key: 'support_whatsapp', value: document.getElementById('set-support-whatsapp').value.trim() },
    { key: 'announcement_ar', value: document.getElementById('set-announcement-ar').value.trim() },
    { key: 'announcement_en', value: document.getElementById('set-announcement-en').value.trim() },
    { key: 'exchange_rate_usd', value: document.getElementById('set-rate-usd').value.trim() },
    { key: 'registration_enabled', value: document.getElementById('set-registration-enabled').value },
    { key: 'maintenance_mode', value: document.getElementById('set-maintenance-mode').value }
  ];

  try {
    const res = await window.api.post('/admin/settings', { settings });
    showToast(res.message || 'تم حفظ الإعدادات بنجاح!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// -------------------------------------------------------------
// AUDIT LOGS
// -------------------------------------------------------------
async function loadAdminLogs() {
  const tbody = document.getElementById('adm-logs-tbody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 25px;">جاري تحميل سجل التدقيق...</td></tr>`;

  try {
    const logs = await window.api.get('/admin/logs');
    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد سجلات بعد.</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(l => `
      <tr>
        <td><strong>#${l.id}</strong></td>
        <td><strong>${l.admin_username}</strong></td>
        <td><span class="badge badge-in-progress">${l.action}</span></td>
        <td>${l.target_type}</td>
        <td>${l.target_id || '--'}</td>
        <td><small style="color:var(--text-muted);">${l.after_state || '--'}</small></td>
        <td>${new Date(l.created_at).toLocaleString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger);">${err.message}</td></tr>`;
  }
}

// Modal helper
function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}

function toggleAdminLanguage() {
  const nextLang = window.i18n.lang === 'ar' ? 'en' : 'ar';
  window.i18n.setLanguage(nextLang);
  document.getElementById('admin-lang-btn').textContent = nextLang === 'ar' ? 'English' : 'العربية';
}

async function handleAdminLogout() {
  try {
    localStorage.removeItem('asalia_token');
    await window.api.post('/auth/logout', {});
    window.location.href = '/admin';
  } catch (e) {
    localStorage.removeItem('asalia_token');
    window.location.href = '/admin';
  }
}
