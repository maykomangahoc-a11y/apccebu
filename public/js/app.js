// ═══════════════════════════════════════════════════════════════════════════
// SPA Router & App Shell Controller
// ═══════════════════════════════════════════════════════════════════════════

const App = {
  currentPage: null,
  pageContainer: null,
  headerTitle: null,
  sidebarEl: null,

  routes: {
    '/login':      { title: 'Login',             module: 'login',      icon: '🔐', public: true },
    '/dashboard':  { title: 'Dashboard',         module: 'dashboard',  icon: '📊' },
    '/dispatch':   { title: 'Dispatch Plan',     module: 'dispatch',   icon: '📋' },
    '/checking':   { title: 'Outbound Checking', module: 'checking',   icon: '✅' },
    '/picking':    { title: 'Outbound Picking',  module: 'picking',    icon: '📦' },
    '/reporting':  { title: 'Reporting',         module: 'reporting',  icon: '📈' },
    '/inbound':    { title: 'Inbound',           module: 'inbound',    icon: '📥' },
    '/putaway':    { title: 'Putaway',           module: 'putaway',    icon: '🏗️' },
    '/resources':  { title: 'Resources',         module: 'resources',  icon: '👥' },
    '/settings':   { title: 'Management',        module: 'settings',   icon: '⚙️' },
  },

  init() {
    this.pageContainer = document.getElementById('page-content');
    this.headerTitle = document.getElementById('header-title');
    this.sidebarEl = document.getElementById('sidebar');

    // Menu toggle for mobile
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', () => this.toggleSidebar());
    }

    // Logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => API.logout());
    }

    // Listen for hash changes
    window.addEventListener('hashchange', () => this.navigate());

    // Initial navigation
    this.navigate();
  },

  navigate() {
    const hash = window.location.hash || '#/dashboard';
    const path = hash.replace('#', '');
    const route = this.routes[path];

    // Default redirect
    if (!route) {
      window.location.hash = '#/dashboard';
      return;
    }

    // Auth guard
    if (!route.public && !API.isLoggedIn()) {
      window.location.hash = '#/login';
      return;
    }

    // If logged in and trying to go to login, redirect to dashboard
    if (path === '/login' && API.isLoggedIn()) {
      window.location.hash = '#/dashboard';
      return;
    }

    // Show/hide app shell based on login page
    const appLayout = document.getElementById('app-layout');
    const loginPage = document.getElementById('login-page');

    if (path === '/login') {
      appLayout.style.display = 'none';
      loginPage.style.display = 'flex';
      if (typeof LoginPage !== 'undefined') LoginPage.render();
      return;
    } else {
      appLayout.style.display = 'flex';
      loginPage.style.display = 'none';
    }

    // Update header title
    if (this.headerTitle) {
      this.headerTitle.textContent = route.title;
    }

    // Update sidebar active state
    this.updateSidebarActive(path);

    // Update user badge
    this.updateUserBadge();

    // Load page module
    this.loadPage(route.module);

    // Close sidebar on mobile after nav
    if (window.innerWidth <= 1024) {
      this.sidebarEl?.classList.remove('open');
    }
  },

  async loadPage(moduleName) {
    if (!this.pageContainer) return;

    // Show loading
    this.pageContainer.innerHTML = `
      <div class="loading-container">
        <div class="spinner"></div>
        <span>Loading...</span>
      </div>
    `;

    // Call the page module's render function
    const pageModules = {
      dashboard: typeof DashboardPage !== 'undefined' ? DashboardPage : null,
      dispatch: typeof DispatchPage !== 'undefined' ? DispatchPage : null,
      picking: typeof PickingPage !== 'undefined' ? PickingPage : null,
      processing: typeof ProcessingPage !== 'undefined' ? ProcessingPage : null,
      inbound: typeof InboundPage !== 'undefined' ? InboundPage : null,
      putaway: typeof PutawayPage !== 'undefined' ? PutawayPage : null,
      resources: typeof ResourcesPage !== 'undefined' ? ResourcesPage : null,
      settings: typeof SettingsPage !== 'undefined' ? SettingsPage : null,
    };

    const pageModule = pageModules[moduleName];

    if (pageModule && typeof pageModule.render === 'function') {
      try {
        await pageModule.render(this.pageContainer);
      } catch (err) {
        console.error(`Error rendering ${moduleName}:`, err);
        this.pageContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <div class="empty-text">Error loading page: ${err.message}</div>
          </div>
        `;
      }
    } else {
      this.pageContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🚧</div>
          <div class="empty-text">Module "${moduleName}" not loaded</div>
        </div>
      `;
    }
  },

  updateSidebarActive(path) {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.path === path);
    });
  },

  updateUserBadge() {
    const user = API.getUser();
    if (!user) return;

    const avatarEl = document.getElementById('user-avatar');
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');

    if (avatarEl) avatarEl.textContent = (user.username || '?')[0].toUpperCase();
    if (nameEl) nameEl.textContent = user.username || 'User';
    if (roleEl) roleEl.textContent = user.role || 'viewer';
  },

  toggleSidebar() {
    this.sidebarEl?.classList.toggle('open');
  },

  // ─── Toast Notifications ───────────────────────────────────────────────
  toast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // ─── Modal Helper ─────────────────────────────────────────────────────
  showModal(title, bodyHtml, footerHtml = '') {
    let overlay = document.getElementById('app-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'app-modal-overlay';
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title"></h3>
            <button class="modal-close" onclick="App.closeModal()">✕</button>
          </div>
          <div class="modal-body"></div>
          <div class="modal-footer"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) App.closeModal();
      });
    }

    overlay.querySelector('.modal-title').textContent = title;
    overlay.querySelector('.modal-body').innerHTML = bodyHtml;
    overlay.querySelector('.modal-footer').innerHTML = footerHtml;
    overlay.classList.add('active');
  },

  closeModal() {
    const overlay = document.getElementById('app-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }
};

// Initialize app on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
