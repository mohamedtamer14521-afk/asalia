/**
 * ASALIA API Client & UI Helpers
 */

class ApiClient {
  constructor() {
    this.baseUrl = '/api';
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const defaultHeaders = {
      'Accept': 'application/json'
    };

    const token = localStorage.getItem('asalia_token');
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    let requestBody = options.body;
    if (requestBody && !(requestBody instanceof FormData) && typeof requestBody === 'object') {
      requestBody = JSON.stringify(requestBody);
      defaultHeaders['Content-Type'] = 'application/json';
    } else if (typeof requestBody === 'string') {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const config = {
      credentials: 'include',
      ...options,
      body: requestBody,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    try {
      const res = await fetch(url, config);
      const data = await res.json();

      if (!res.ok || !data.success) {
        const error = data.error || {
          code: `HTTP_${res.status}`,
          message: 'An unexpected server error occurred.'
        };
        throw error;
      }

      return data.data;
    } catch (err) {
      if (err.message && !err.code) {
        throw { code: 'NETWORK_ERROR', message: 'Failed to connect to ASALIA servers.' };
      }
      throw err;
    }
  }

  get(endpoint, options = {}) {
    return this.request(endpoint, { method: 'GET', ...options });
  }

  post(endpoint, body, options = {}) {
    const isFormData = body instanceof FormData;
    return this.request(endpoint, {
      method: 'POST',
      body: isFormData ? body : JSON.stringify(body),
      ...options
    });
  }

  put(endpoint, body = {}, options = {}) {
    const isFormData = body instanceof FormData;
    return this.request(endpoint, {
      method: 'PUT',
      body: isFormData ? body : JSON.stringify(body),
      ...options
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { method: 'DELETE', ...options });
  }

  patch(endpoint, body, options = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
      ...options
    });
  }

  delete(endpoint, options = {}) {
    return this.request(endpoint, { method: 'DELETE', ...options });
  }
}

// Toast notification helper
function showToast(message, type = 'info', duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  if (typeof renderAppleEmojis === 'function') {
    renderAppleEmojis(toast);
  }

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Theme Switcher
class ThemeManager {
  constructor() {
    this.theme = localStorage.getItem('asalia_theme') || 'light';
    this.applyTheme(this.theme);
  }

  toggle() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('asalia_theme', this.theme);
    this.applyTheme(this.theme);
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    }
  }
}

window.api = new ApiClient();
window.showToast = showToast;
window.themeManager = new ThemeManager();

function createIosSpinner(size = '') {
  return `
    <div class="ios-spinner ${size}">
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
      <div class="ios-blade"></div>
    </div>
  `;
}
window.createIosSpinner = createIosSpinner;

// Authentic Apple iOS Emoji Parser
function renderAppleEmojis(root = document.body) {
  if (!root) return;
  const emojiRegex = /(\p{Extended_Pictographic})/gu;
  
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || !emojiRegex.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'TITLE', 'OPTION'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('.ios-spinner') || parent.classList.contains('apple-emoji')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const text = node.nodeValue;
    if (!emojiRegex.test(text)) continue;

    const span = document.createElement('span');
    span.innerHTML = text.replace(emojiRegex, (match) => {
      return `<img class="apple-emoji" src="https://emojicdn.elk.sh/${encodeURIComponent(match)}?style=apple" alt="${match}" draggable="false" loading="lazy">`;
    });
    if (node.parentNode) {
      node.parentNode.replaceChild(span, node);
    }
  }
}
window.renderAppleEmojis = renderAppleEmojis;

// Auto-run on DOM ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => renderAppleEmojis(document.body), 50);
  });
}
