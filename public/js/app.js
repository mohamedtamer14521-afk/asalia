/**
 * ASALIA Customer Portal Controller
 */

let currentUser = null;
let currentServices = [];
let currentCategories = [];
let currentPaymentMethods = [];
let selectedService = null;
let cooldownInterval = null;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  await initCustomerApp();
});

async function initCustomerApp() {
  try {
    const data = await window.api.get('/auth/me');
    if (!data || !data.user) {
      window.location.href = '/';
      return;
    }
    currentUser = data.user;
    updateUserUI();

    // Load branding and initial data
    loadSiteSettings();
    await Promise.all([
      loadDashboardStats(),
      loadCategoriesAndServices(),
      loadPaymentMethods()
    ]);

    // Check URL parameters for tab navigation
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    if (tab) {
      switchTab(tab);
    }
  } catch (err) {
    console.error('Customer init error:', err);
    window.location.href = '/';
  }
}

async function loadSiteSettings() {
  try {
    const res = await window.api.get('/settings');
    if (!res) return;
    if (res.siteName) {
      document.querySelectorAll('.brand-text, .logo-text').forEach(el => el.textContent = res.siteName);
      document.title = `${res.siteName} — ${window.i18n.lang === 'ar' ? 'لوحة العميل' : 'Customer Portal'}`;
    }
    if (res.logoUrl && res.logoUrl.trim()) {
      document.querySelectorAll('.logo-badge').forEach(el => {
        el.innerHTML = `<img src="${res.logoUrl}" alt="${res.siteName}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 6px;">`;
        el.style.background = 'transparent';
      });
    }
    if (res.faviconUrl && res.faviconUrl.trim()) {
      let fav = document.querySelector('link[rel="icon"]');
      if (!fav) {
        fav = document.createElement('link');
        fav.rel = 'icon';
        document.head.appendChild(fav);
      }
      fav.href = res.faviconUrl;
    }
    if (res.supportWhatsApp) {
      window.SUPPORT_WHATSAPP = res.supportWhatsApp;
    }
  } catch (e) {}
}

function updateUserUI() {
  if (!currentUser) return;
  const usernameElem = document.getElementById('topbar-username');
  if (usernameElem) usernameElem.textContent = currentUser.username;

  const sidebarUsernameElem = document.getElementById('sidebar-username');
  if (sidebarUsernameElem) sidebarUsernameElem.textContent = currentUser.username;

  const sidebarLangBtn = document.getElementById('sidebar-lang-toggle');
  if (sidebarLangBtn) sidebarLangBtn.textContent = window.i18n.lang === 'ar' ? 'English' : 'العربية';

  const welcomeHeading = document.getElementById('welcome-heading');
  if (welcomeHeading) {
    welcomeHeading.textContent = window.i18n.lang === 'ar' 
      ? `مرحباً بك، ${currentUser.username}` 
      : `Welcome back, ${currentUser.username}`;
  }

  updateBalanceDisplay(currentUser.balance);

  // If user is Admin, show Admin panel shortcut
  if (currentUser.role === 'ADMIN') {
    const adminLink = document.getElementById('admin-link-container');
    if (adminLink) adminLink.style.display = 'block';
  }
}

function updateBalanceDisplay(amount) {
  const formatted = `${Number(amount).toFixed(2)} EGP`;
  const topbar = document.getElementById('topbar-balance-val');
  if (topbar) topbar.textContent = formatted;

  const stat = document.getElementById('stat-balance');
  if (stat) stat.textContent = formatted;

  const avail = document.getElementById('order-available-balance');
  if (avail) avail.textContent = formatted;
}

async function refreshBalance() {
  try {
    const res = await window.api.get('/wallet/balance');
    currentUser.balance = res.balance;
    updateBalanceDisplay(res.balance);
    showToast(window.i18n.lang === 'ar' ? 'تم تحديث الرصيد' : 'Balance updated', 'info');
  } catch (err) {
    showToast(err.message || 'Failed to refresh balance', 'error');
  }
}

// Navigation Tab Switching
function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-tab-link').forEach(el => el.classList.remove('active'));

  const targetPane = document.getElementById(`tab-${tabId}`);
  const targetLink = document.getElementById(`tab-link-${tabId}`);

  if (targetPane) targetPane.classList.add('active');
  if (targetLink) targetLink.classList.add('active');

  // Close mobile sidebar if open
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('active');
  document.body.style.overflow = '';

  // Trigger tab-specific refresh
  if (tabId === 'dashboard') loadDashboardStats();
  if (tabId === 'orders') loadCustomerOrders();
  if (tabId === 'transactions') loadCustomerTransactions();
  if (tabId === 'services') loadServicesTable();
  if (tabId === 'tickets') loadCustomerTickets();
}

function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (sidebar) {
    const isOpen = sidebar.classList.toggle('open');
    if (backdrop) {
      if (isOpen) backdrop.classList.add('active');
      else backdrop.classList.remove('active');
    }
    document.body.style.overflow = isOpen ? 'hidden' : '';
  }
}

function toggleLanguage() {
  const nextLang = window.i18n.lang === 'ar' ? 'en' : 'ar';
  window.i18n.setLanguage(nextLang);
  updateUserUI();
  populateCategoriesSelect();
  renderServicesTable();
}

// -------------------------------------------------------------
// DASHBOARD STATS
// -------------------------------------------------------------
async function loadDashboardStats() {
  try {
    const data = await window.api.get('/dashboard');
    currentUser.balance = data.balance;
    updateBalanceDisplay(data.balance);

    document.getElementById('stat-orders').textContent = data.totalOrders;
    document.getElementById('stat-pending').textContent = data.pendingOrders;
    document.getElementById('stat-processing').textContent = data.processingOrders;
    document.getElementById('stat-completed').textContent = data.completedOrders;
    document.getElementById('stat-spent').textContent = `${data.totalSpent.toFixed(2)} EGP`;

    // Recent Orders Table
    const ordersTbody = document.getElementById('dashboard-recent-orders-tbody');
    if (data.recentOrders && data.recentOrders.length > 0) {
      ordersTbody.innerHTML = data.recentOrders.map(o => `
        <tr>
          <td><strong>#${o.id}</strong></td>
          <td>${o.service_name_snap}</td>
          <td>${o.quantity}</td>
          <td><strong>${Number(o.charge).toFixed(2)} EGP</strong></td>
          <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
          <td>${new Date(o.created_at).toLocaleDateString()}</td>
        </tr>
      `).join('');
    } else {
      ordersTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color:var(--text-muted);">لا توجد طلبات سابقة حتى الآن.</td></tr>`;
    }

    // Recent Transactions Table
    const txTbody = document.getElementById('dashboard-recent-tx-tbody');
    if (data.recentTransactions && data.recentTransactions.length > 0) {
      txTbody.innerHTML = data.recentTransactions.map(t => `
        <tr>
          <td><strong>#${t.id}</strong></td>
          <td><span class="badge badge-in-progress">${t.type}</span></td>
          <td style="color: ${Number(t.amount) >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">
            ${Number(t.amount) >= 0 ? '+' : ''}${Number(t.amount).toFixed(2)} EGP
          </td>
          <td>${Number(t.balance_after).toFixed(2)} EGP</td>
          <td>${t.description}</td>
          <td>${new Date(t.created_at).toLocaleDateString()}</td>
        </tr>
      `).join('');
    } else {
      txTbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color:var(--text-muted);">لا توجد معاملات رصيد مسجلة.</td></tr>`;
    }
  } catch (err) {
    console.error('Failed to load dashboard stats:', err);
  }
}

// -------------------------------------------------------------
// SERVICES & NEW ORDER
// -------------------------------------------------------------
async function loadCategoriesAndServices() {
  try {
    const [categories, services] = await Promise.all([
      window.api.get('/services/categories'),
      window.api.get('/services')
    ]);

    currentCategories = categories;
    currentServices = services;

    populateCategoriesSelect();
    onCategoryChanged();
    renderServicesTable();
  } catch (err) {
    console.error('Failed to load services data:', err);
  }
}

let currentPlatformFilter = 'all';
let currentSearchQuery = '';

function selectPlatformFilter(platform, btnElement) {
  currentPlatformFilter = (platform || 'all').toLowerCase();

  // Update active button state
  document.querySelectorAll('.platform-pill-btn').forEach(b => b.classList.remove('active'));
  if (btnElement) {
    btnElement.classList.add('active');
  }

  // Re-populate categories matching this platform
  const catSelect = document.getElementById('order-category-select');
  const isAr = window.i18n.lang === 'ar';

  const filteredCats = currentPlatformFilter === 'all'
    ? currentCategories
    : currentCategories.filter(c => c.platform?.toLowerCase() === currentPlatformFilter);

  if (catSelect) {
    catSelect.innerHTML = `<option value="">-- ${isAr ? 'اختر القسم' : 'Select Category'} --</option>` +
      filteredCats.map(c => `
        <option value="${c.id}">${isAr ? c.name_ar : c.name_en}</option>
      `).join('');

    // If only one category matches, auto-select it!
    if (filteredCats.length === 1) {
      catSelect.value = filteredCats[0].id;
    }
  }

  onCategoryChanged();
}

function onServiceSearchChanged(query) {
  currentSearchQuery = (query || '').toLowerCase().trim();
  onCategoryChanged();
}

function populateCategoriesSelect() {
  const catSelect = document.getElementById('order-category-select');
  if (!catSelect) return;

  const isAr = window.i18n.lang === 'ar';
  const filteredCats = currentPlatformFilter === 'all'
    ? currentCategories
    : currentCategories.filter(c => c.platform?.toLowerCase() === currentPlatformFilter);

  catSelect.innerHTML = `<option value="">-- ${isAr ? 'اختر القسم' : 'Select Category'} --</option>` +
    filteredCats.map(c => `
      <option value="${c.id}">${isAr ? c.name_ar : c.name_en} (${c.platform})</option>
    `).join('');
}

function getPlatformEmoji(platform) {
  const p = (platform || '').toLowerCase();
  if (p.includes('insta')) return '📷';
  if (p.includes('tik')) return '🎵';
  if (p.includes('you')) return '▶️';
  if (p.includes('face')) return '🔵';
  if (p.includes('tele')) return '✈️';
  if (p.includes('twit') || p === 'x') return '𝕏';
  if (p.includes('what')) return '💬';
  if (p.includes('snap')) return '👻';
  if (p.includes('link')) return '💼';
  return '🌟';
}

function toggleServiceDropdown(forceClose) {
  const menu = document.getElementById('custom-service-menu');
  const trigger = document.getElementById('custom-service-trigger');
  if (!menu || !trigger) return;

  if (forceClose === true || menu.style.display === 'block') {
    menu.style.display = 'none';
    trigger.classList.remove('active');
  } else {
    menu.style.display = 'block';
    trigger.classList.add('active');
  }
}

document.addEventListener('click', (e) => {
  const picker = document.getElementById('custom-service-picker');
  if (picker && !picker.contains(e.target)) {
    toggleServiceDropdown(true);
  }
});

function selectCustomService(serviceId) {
  const servSelect = document.getElementById('order-service-select');
  if (servSelect) {
    servSelect.value = serviceId;
  }
  toggleServiceDropdown(true);
  onServiceChanged();
}

function onCategoryChanged() {
  const catSelect = document.getElementById('order-category-select');
  const catId = catSelect ? catSelect.value : '';
  const servSelect = document.getElementById('order-service-select');
  if (!servSelect) return;
  const isAr = window.i18n.lang === 'ar';

  const selectedCat = currentCategories.find(c => c.id == catId);

  let filtered = currentServices;

  // 1. Filter by platform pill if active
  if (currentPlatformFilter && currentPlatformFilter !== 'all') {
    filtered = filtered.filter(s => {
      const p = s.platform?.toLowerCase();
      if (p === currentPlatformFilter) return true;
      if (s.category_id && currentCategories.find(c => c.id == s.category_id)?.platform?.toLowerCase() === currentPlatformFilter) return true;
      return false;
    });
  }

  // 2. Filter by category if selected
  if (catId) {
    filtered = filtered.filter(s => s.category_id == catId || (selectedCat && s.platform?.toLowerCase() === selectedCat.platform?.toLowerCase()));
  }

  // 3. Filter by search input if typed
  if (currentSearchQuery) {
    filtered = filtered.filter(s => {
      const text = `${s.id} ${s.name_ar || ''} ${s.name_en || ''} ${s.platform || ''}`.toLowerCase();
      return text.includes(currentSearchQuery);
    });
  }

  // Native select options with emojis
  servSelect.innerHTML = `<option value="">-- ${isAr ? 'اختر الخدمة' : 'Select Service'} (${filtered.length}) --</option>` +
    filtered.map(s => `
      <option value="${s.id}">${getPlatformEmoji(s.platform)} #${s.id} - ${isAr ? s.name_ar : s.name_en} — ${Number(s.price_per_1000).toFixed(2)} EGP / 1000</option>
    `).join('');

  // Custom Apple Dropdown with Images
  const customMenu = document.getElementById('custom-service-menu');
  if (customMenu) {
    if (filtered.length === 0) {
      customMenu.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">${isAr ? 'لا توجد خدمات مطابقة' : 'No services found'}</div>`;
    } else {
      customMenu.innerHTML = filtered.map(s => `
        <div class="apple-select-item ${selectedService?.id === s.id ? 'selected' : ''}" onclick="selectCustomService(${s.id})">
          <div style="width: 36px; height: 36px; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); flex-shrink: 0;">
            ${s.image_url ? `<img src="${s.image_url}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span style="font-size: 1.15rem;">${getPlatformEmoji(s.platform)}</span>`}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 0.92rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              #${s.id} - ${isAr ? s.name_ar : s.name_en}
            </div>
            <div style="font-size: 0.8rem; color: var(--apple-blue); font-weight: 700;">
              ${Number(s.price_per_1000).toFixed(2)} EGP / 1000
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  if (filtered.length === 1 && (catId || currentSearchQuery)) {
    servSelect.value = filtered[0].id;
    onServiceChanged();
  } else {
    const iconContainer = document.getElementById('picker-selected-icon');
    const textContainer = document.getElementById('picker-selected-text');
    if (iconContainer) iconContainer.innerHTML = '<span>🌟</span>';
    if (textContainer) textContainer.textContent = isAr ? '-- اختر الخدمة --' : '-- Select Service --';
    document.getElementById('service-info-box').style.display = 'none';
    selectedService = null;
    calculateOrderPrice();
  }
}

function onServiceChanged() {
  const servId = document.getElementById('order-service-select').value;
  selectedService = currentServices.find(s => s.id == servId) || null;

  const infoBox = document.getElementById('service-info-box');
  const isAr = window.i18n.lang === 'ar';
  const iconContainer = document.getElementById('picker-selected-icon');
  const textContainer = document.getElementById('picker-selected-text');

  if (!selectedService) {
    if (infoBox) infoBox.style.display = 'none';
    if (iconContainer) iconContainer.innerHTML = '<span>🌟</span>';
    if (textContainer) textContainer.textContent = isAr ? '-- اختر الخدمة --' : '-- Select Service --';
    calculateOrderPrice();
    return;
  }

  // Update Trigger Button with actual image!
  if (iconContainer) {
    iconContainer.innerHTML = selectedService.image_url
      ? `<img src="${selectedService.image_url}" style="width: 100%; height: 100%; object-fit: cover;">`
      : `<span style="font-size: 1.15rem;">${getPlatformEmoji(selectedService.platform)}</span>`;
  }
  if (textContainer) {
    textContainer.textContent = `#${selectedService.id} - ${isAr ? selectedService.name_ar : selectedService.name_en} — ${Number(selectedService.price_per_1000).toFixed(2)} EGP`;
  }

  // Update Info Box with image!
  if (infoBox) {
    infoBox.style.display = 'block';
    const infoImgBox = document.getElementById('service-info-img-box');
    if (infoImgBox) {
      infoImgBox.innerHTML = selectedService.image_url
        ? `<img src="${selectedService.image_url}" style="width: 100%; height: 100%; object-fit: cover;">`
        : `<span style="font-size: 1.6rem;">${getPlatformEmoji(selectedService.platform)}</span>`;
    }
    document.getElementById('service-info-title').textContent = 
      `#${selectedService.id} - ${isAr ? selectedService.name_ar : selectedService.name_en}`;
    document.getElementById('service-info-price').textContent = 
      `${isAr ? 'السعر' : 'Price'}: ${Number(selectedService.price_per_1000).toFixed(2)} EGP / 1000`;
    document.getElementById('service-info-limits').textContent = 
      `${isAr ? 'الحدود' : 'Limits'}: Min ${selectedService.min_quantity} — Max ${selectedService.max_quantity}`;
    document.getElementById('service-info-desc').textContent = 
      isAr ? (selectedService.description_ar || selectedService.description_en || '') : (selectedService.description_en || '');
    document.getElementById('service-info-speed').textContent = 
      `⚡ ${selectedService.processing_time_info || '0-24 Hours'}`;
    document.getElementById('service-info-linktype').textContent = 
      `🔗 ${selectedService.link_type}`;
  }

  const qtyInput = document.getElementById('order-quantity');
  if (qtyInput) {
    qtyInput.min = selectedService.min_quantity;
    qtyInput.max = selectedService.max_quantity;
    if (!qtyInput.value || Number(qtyInput.value) < selectedService.min_quantity) {
      qtyInput.value = selectedService.min_quantity;
    }
  }

  calculateOrderPrice();
}

function calculateOrderPrice() {
  const chargeElem = document.getElementById('order-calculated-charge');
  if (!selectedService) {
    chargeElem.textContent = '0.00 EGP';
    return;
  }

  const qty = parseInt(document.getElementById('order-quantity').value, 10) || 0;
  const pricePer1000 = Number(selectedService.price_per_1000);
  const charge = (qty / 1000) * pricePer1000;

  chargeElem.textContent = `${charge.toFixed(2)} EGP`;
}

// Handle Place Order
async function handlePlaceOrder(e) {
  e.preventDefault();
  if (!selectedService) {
    showToast(window.i18n.lang === 'ar' ? 'الرجاء اختيار خدمة أولاً' : 'Please select a service', 'error');
    return;
  }

  const link = document.getElementById('order-target-link').value.trim();
  const username = document.getElementById('order-target-username').value.trim();
  const quantity = parseInt(document.getElementById('order-quantity').value, 10);
  const submitBtn = document.getElementById('order-submit-btn');

  // Disable button immediately
  submitBtn.disabled = true;
  submitBtn.textContent = window.i18n.lang === 'ar' ? 'جاري تأكيد الطلب...' : 'Processing order...';

  try {
    const res = await window.api.post('/orders', {
      service_id: selectedService.id,
      target_link: link,
      username: username,
      quantity: quantity
    });

    showToast(window.i18n.lang === 'ar' ? `تم إنشاء الطلب #${res.order.id} بنجاح!` : `Order #${res.order.id} placed!`, 'success');
    
    // Update local balance
    currentUser.balance = res.newBalance;
    updateBalanceDisplay(res.newBalance);

    // Reset form
    document.getElementById('new-order-form').reset();
    document.getElementById('service-info-box').style.display = 'none';
    selectedService = null;
    calculateOrderPrice();

    // Start 10-second cooldown protection
    startOrderCooldown(res.cooldownSeconds || 10);

    // Offer optional WhatsApp notification
    if (res.whatsappUrl) {
      setTimeout(() => {
        if (confirm(window.i18n.lang === 'ar' 
          ? `تم حفظ الطلب #${res.order.id} في قاعدة البيانات بنجاح!\n\nهل تود فتح واتساب لإرسال إشعار فوري إلى الدعم (+201030646757)؟`
          : `Order #${res.order.id} successfully saved to database!\n\nWould you like to send WhatsApp confirmation to support (+201030646757)?`)) {
          window.open(res.whatsappUrl, '_blank');
        }
      }, 400);
    }
  } catch (err) {
    showToast(err.message || 'Failed to place order', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = window.i18n.t('order_now_btn');
  }
}

function startOrderCooldown(seconds) {
  const submitBtn = document.getElementById('order-submit-btn');
  const cooldownBox = document.getElementById('order-cooldown-timer');
  const secElem = document.getElementById('cooldown-seconds');

  let remaining = seconds;
  submitBtn.disabled = true;
  cooldownBox.style.display = 'block';
  secElem.textContent = remaining;

  if (cooldownInterval) clearInterval(cooldownInterval);

  cooldownInterval = setInterval(() => {
    remaining--;
    secElem.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(cooldownInterval);
      cooldownBox.style.display = 'none';
      submitBtn.disabled = false;
      submitBtn.textContent = window.i18n.t('order_now_btn');
    }
  }, 1000);
}

// -------------------------------------------------------------
// ORDERS TABLE
// -------------------------------------------------------------
async function loadCustomerOrders() {
  const tbody = document.getElementById('customer-orders-tbody');
  const status = document.getElementById('orders-filter-status').value;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 35px;">${window.createIosSpinner()}</td></tr>`;

  try {
    const res = await window.api.get(`/orders?status=${status}`);
    if (!res.orders || res.orders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد طلبات مسجلة بهذه الحالة.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.orders.map(o => `
      <tr>
        <td><strong>#${o.id}</strong></td>
        <td>${o.service_name_snap}</td>
        <td>
          <div style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <a href="${o.target_link}" target="_blank" rel="noopener" style="color: var(--primary);">${o.target_link}</a>
          </div>
          ${o.username ? `<small style="color: var(--text-secondary);">@${o.username}</small>` : ''}
        </td>
        <td>${o.quantity}</td>
        <td><strong>${Number(o.charge).toFixed(2)} EGP</strong></td>
        <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
        <td>${new Date(o.created_at).toLocaleString()}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="sendOrderToWhatsApp(${JSON.stringify(o).replace(/"/g, '&quot;')})">
            💬 واتساب
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 20px;">${err.message || 'Error'}</td></tr>`;
  }
}

function sendOrderToWhatsApp(order) {
  const text = [
    'New ASALIA Order',
    `Order ID: #${order.id}`,
    `Customer: ${order.customer_username_snap}`,
    `Service: ${order.service_name_snap}`,
    `Username: @${order.username}`,
    `Link: ${order.target_link}`,
    `Quantity: ${order.quantity}`,
    `Amount: ${Number(order.charge).toFixed(2)} EGP`,
    `Status: ${order.status}`
  ].join('\n');

  window.open(`https://wa.me/201030646757?text=${encodeURIComponent(text)}`, '_blank');
}

// -------------------------------------------------------------
// SERVICES TABLE
// -------------------------------------------------------------
function renderServicesTable() {
  const tbody = document.getElementById('customer-services-tbody');
  if (!tbody) return;

  const isAr = window.i18n.lang === 'ar';
  if (!currentServices || currentServices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد خدمات متاحة.</td></tr>`;
    return;
  }

  tbody.innerHTML = currentServices.map(s => `
    <tr>
      <td><strong>#${s.id}</strong></td>
      <td><span class="badge badge-in-progress">${s.platform}</span></td>
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          ${s.image_url ? `<img src="${s.image_url}" style="width: 32px; height: 32px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color); flex-shrink: 0;">` : ''}
          <span>${isAr ? s.name_ar : s.name_en}</span>
        </div>
      </td>
      <td><strong>${Number(s.price_per_1000).toFixed(2)} EGP</strong></td>
      <td>${s.min_quantity}</td>
      <td>${s.max_quantity}</td>
      <td>${s.processing_time_info || '0-24h'}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="orderSpecificService(${s.id})">
          ${isAr ? 'طلب' : 'Order'}
        </button>
      </td>
    </tr>
  `).join('');
}

function filterServicesTable() {
  const query = document.getElementById('services-search-input').value.toLowerCase();
  const rows = document.querySelectorAll('#customer-services-tbody tr');
  rows.forEach(r => {
    const text = r.textContent.toLowerCase();
    r.style.display = text.includes(query) ? '' : 'none';
  });
}

function orderSpecificService(serviceId) {
  switchTab('new-order');
  const service = currentServices.find(s => s.id == serviceId);
  if (service) {
    const catSelect = document.getElementById('order-category-select');
    if (catSelect) catSelect.value = service.category_id || '';
    onCategoryChanged();
    const servSelect = document.getElementById('order-service-select');
    if (servSelect) servSelect.value = service.id;
    onServiceChanged();
  }
}

// -------------------------------------------------------------
// TRANSACTIONS
// -------------------------------------------------------------
async function loadCustomerTransactions() {
  const tbody = document.getElementById('customer-transactions-tbody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 35px;">${window.createIosSpinner()}</td></tr>`;

  try {
    const res = await window.api.get('/wallet/transactions');
    if (!res.transactions || res.transactions.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد معاملات رصيد مسجلة.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.transactions.map(t => `
      <tr>
        <td><strong>#${t.id}</strong></td>
        <td><span class="badge badge-in-progress">${t.type}</span></td>
        <td style="color: ${Number(t.amount) >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight: 700;">
          ${Number(t.amount) >= 0 ? '+' : ''}${Number(t.amount).toFixed(2)} EGP
        </td>
        <td>${Number(t.balance_after).toFixed(2)} EGP</td>
        <td>${t.description}</td>
        <td>${t.reference_id ? `#${t.reference_id}` : '--'}</td>
        <td>${new Date(t.created_at).toLocaleString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 20px;">${err.message || 'Error'}</td></tr>`;
  }
}

// -------------------------------------------------------------
// DEPOSITS (ADD FUNDS)
// -------------------------------------------------------------
async function loadPaymentMethods() {
  try {
    const res = await window.api.get('/deposits/methods');
    currentPaymentMethods = res || [];
    populatePaymentMethodsSelect();
  } catch (err) {
    // If deposits route not yet mounted, fallback
  }
}

function populatePaymentMethodsSelect() {
  const select = document.getElementById('deposit-method-select');
  if (!select) return;
  const isAr = window.i18n.lang === 'ar';

  if (!currentPaymentMethods || currentPaymentMethods.length === 0) {
    select.innerHTML = `<option value="">-- ${isAr ? 'لا توجد طرق دفع مفعلة' : 'No active payment methods'} --</option>`;
    return;
  }

  select.innerHTML = `<option value="">-- ${isAr ? 'اختر طريقة الدفع' : 'Select Payment Method'} --</option>` +
    currentPaymentMethods.map(m => `
      <option value="${m.id}">${isAr ? m.name_ar : m.name_en}</option>
    `).join('');
}

function onDepositMethodChanged() {
  const id = document.getElementById('deposit-method-select').value;
  const method = currentPaymentMethods.find(m => m.id == id);
  const box = document.getElementById('deposit-instructions-box');

  if (!method) {
    box.style.display = 'none';
    return;
  }

  const isAr = window.i18n.lang === 'ar';
  box.style.display = 'block';

  const imgBox = document.getElementById('deposit-pm-img-box');
  if (imgBox) {
    imgBox.innerHTML = method.image_url
      ? `<img src="${method.image_url}" style="width: 100%; height: 100%; object-fit: contain;">`
      : `<span style="font-size: 1.6rem;">💳</span>`;
  }
  const title = document.getElementById('deposit-pm-title');
  if (title) {
    title.textContent = isAr ? method.name_ar : method.name_en;
  }

  document.getElementById('deposit-account-number').textContent = method.account_number;
  document.getElementById('deposit-account-holder').textContent = method.account_holder 
    ? `${isAr ? 'اسم المستلم' : 'Account Holder'}: ${method.account_holder}` 
    : '';
  document.getElementById('deposit-instructions-text').textContent = 
    isAr ? (method.instructions_ar || method.instructions_en || '') : (method.instructions_en || '');
  document.getElementById('deposit-limits-info').textContent = 
    `${isAr ? 'الحدود' : 'Limits'}: Min ${Number(method.min_deposit).toFixed(2)} EGP — Max ${Number(method.max_deposit).toFixed(2)} EGP`;

  const amountInput = document.getElementById('deposit-amount');
  amountInput.min = method.min_deposit;
  amountInput.max = method.max_deposit;
}

function copyAccountNumber() {
  const num = document.getElementById('deposit-account-number').textContent;
  if (num && num !== '--') {
    navigator.clipboard.writeText(num).then(() => {
      showToast(window.i18n.lang === 'ar' ? 'تم نسخ الرقم للحافظة' : 'Copied to clipboard', 'success');
    });
  }
}

async function handleDepositSubmit(e) {
  e.preventDefault();
  const methodId = document.getElementById('deposit-method-select').value;
  const amount = document.getElementById('deposit-amount').value;
  const senderNumber = document.getElementById('deposit-sender-number').value.trim();
  const reference = document.getElementById('deposit-reference').value.trim();
  const fileInput = document.getElementById('deposit-screenshot');

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast(window.i18n.lang === 'ar' ? 'الرجاء رفع لقطة شاشة لإيصال التحويل' : 'Please upload payment proof', 'error');
    return;
  }

  const submitBtn = document.getElementById('deposit-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '...';

  const formData = new FormData();
  formData.append('payment_method_id', methodId);
  formData.append('amount', amount);
  formData.append('sender_number', senderNumber);
  formData.append('transaction_reference', reference);
  formData.append('screenshot', fileInput.files[0]);

  try {
    const res = await window.api.post('/deposits', formData);
    showToast(window.i18n.lang === 'ar' ? `تم تسجيل طلب الإيداع #${res.deposit.id} بنجاح!` : `Deposit #${res.deposit.id} submitted!`, 'success');

    // Show WhatsApp Auxiliary Card
    const successCard = document.getElementById('deposit-success-card');
    const waLink = document.getElementById('deposit-whatsapp-link');
    const details = document.getElementById('deposit-success-details');

    details.textContent = window.i18n.lang === 'ar'
      ? `طلب الإيداع رقم #${res.deposit.id} بمبلغ ${Number(res.deposit.amount).toFixed(2)} ج.م مسجل بقاعدة البيانات بحالة قيد الانتظار (Pending).`
      : `Deposit #${res.deposit.id} of ${Number(res.deposit.amount).toFixed(2)} EGP is recorded in the database with status Pending.`;

    waLink.href = res.whatsappUrl;
    successCard.style.display = 'block';

    document.getElementById('add-funds-form').reset();
    document.getElementById('deposit-instructions-box').style.display = 'none';
  } catch (err) {
    showToast(err.message || 'Failed to submit deposit', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = window.i18n.t('submit_deposit');
  }
}

// -------------------------------------------------------------
// TICKETS
// -------------------------------------------------------------
async function loadCustomerTickets() {
  const tbody = document.getElementById('customer-tickets-tbody');
  try {
    const res = await window.api.get('/tickets');
    if (!res || res.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد تذاكر دعم حالية.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.map(t => `
      <tr>
        <td><strong>#${t.id}</strong></td>
        <td>${t.subject}</td>
        <td>${t.category}</td>
        <td>${t.order_id ? `#${t.order_id}` : '--'}</td>
        <td><span class="badge badge-${t.status === 'OPEN' ? 'pending' : 'completed'}">${t.status}</span></td>
        <td>${new Date(t.created_at).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">لا توجد تذاكر دعم مفتوحة.</td></tr>`;
  }
}

function openTicketModal() {
  const subject = prompt(window.i18n.lang === 'ar' ? 'عنوان التذكرة / المشكلة:' : 'Ticket Subject:');
  if (!subject) return;
  const message = prompt(window.i18n.lang === 'ar' ? 'تفاصيل المشكلة:' : 'Ticket Message:');
  if (!message) return;

  window.api.post('/tickets', { subject, message, category: 'General' })
    .then(res => {
      showToast(window.i18n.lang === 'ar' ? 'تم فتح التذكرة بنجاح!' : 'Ticket opened successfully!', 'success');
      loadCustomerTickets();
    })
    .catch(err => {
      showToast(err.message || 'Failed to open ticket', 'error');
    });
}

// Logout
async function handleLogout() {
  try {
    localStorage.removeItem('asalia_token');
    await window.api.post('/auth/logout', {});
    window.location.href = '/';
  } catch (e) {
    localStorage.removeItem('asalia_token');
    window.location.href = '/';
  }
}
