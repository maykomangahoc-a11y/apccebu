// ═══════════════════════════════════════════════════════════════════════════
// Dashboard Page
// ═══════════════════════════════════════════════════════════════════════════

const DashboardPage = {
  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Dashboard</h2>
          <p class="page-desc">Warehouse operations overview</p>
        </div>
      </div>
      <div class="stat-grid" id="dash-stats">
        <div class="stat-card" style="--stat-color: var(--accent-primary)">
          <div class="stat-icon">🚚</div>
          <div class="stat-value" id="stat-dispatch">—</div>
          <div class="stat-label">Active Dispatch Orders</div>
        </div>
        <div class="stat-card" style="--stat-color: var(--accent-success)">
          <div class="stat-icon">📦</div>
          <div class="stat-value" id="stat-picking">—</div>
          <div class="stat-label">Pending Picks</div>
        </div>
        <div class="stat-card" style="--stat-color: var(--accent-warning)">
          <div class="stat-icon">⚙️</div>
          <div class="stat-value" id="stat-processing">—</div>
          <div class="stat-label">Processing Orders</div>
        </div>
        <div class="stat-card" style="--stat-color: var(--accent-info)">
          <div class="stat-icon">📥</div>
          <div class="stat-value" id="stat-inbound">—</div>
          <div class="stat-label">Inbound Monitoring</div>
        </div>
        <div class="stat-card" style="--stat-color: var(--accent-purple)">
          <div class="stat-icon">🏗️</div>
          <div class="stat-value" id="stat-putaway">—</div>
          <div class="stat-label">Pending Putaway</div>
        </div>
        <div class="stat-card" style="--stat-color: var(--accent-orange)">
          <div class="stat-icon">👥</div>
          <div class="stat-value" id="stat-users">—</div>
          <div class="stat-label">Active Users</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Recent Dispatch Orders</h3>
          <a href="#/dispatch" class="btn btn-secondary btn-sm">View All →</a>
        </div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>FO</th>
                <th>Account</th>
                <th>Status</th>
                <th>Qty</th>
                <th>Trucker</th>
                <th>Order Status</th>
              </tr>
            </thead>
            <tbody id="dash-recent-orders">
              <tr><td colspan="6" class="loading-container"><div class="spinner"></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.loadStats();
    this.loadRecentOrders();
  },

  async loadStats() {
    try {
      const [dispatch, pendingPicks, processing, inbound, putaway, users] = await Promise.allSettled([
        API.get('/api/dispatch'),
        API.get('/api/picking/pending'),
        API.get('/api/processing'),
        API.get('/api/inbound/monitoring'),
        API.get('/api/putaway/pending'),
        API.get('/api/users'),
      ]);

      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setVal('stat-dispatch', dispatch.status === 'fulfilled' ? dispatch.value.length : 0);
      setVal('stat-picking', pendingPicks.status === 'fulfilled' ? pendingPicks.value.length : 0);
      setVal('stat-processing', processing.status === 'fulfilled' ? processing.value.length : 0);
      setVal('stat-inbound', inbound.status === 'fulfilled' ? inbound.value.length : 0);
      setVal('stat-putaway', putaway.status === 'fulfilled' ? putaway.value.length : 0);
      setVal('stat-users', users.status === 'fulfilled' ? users.value.length : 0);
    } catch (err) {
      console.error('Dashboard stats error:', err);
    }
  },

  async loadRecentOrders() {
    const tbody = document.getElementById('dash-recent-orders');
    if (!tbody) return;

    try {
      const orders = await API.get('/api/dispatch');
      const recent = orders.slice(0, 10);

      if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No dispatch orders yet</div></div></td></tr>';
        return;
      }

      tbody.innerHTML = recent.map(o => `
        <tr>
          <td>${o.fo || '—'}</td>
          <td>${o.account_name || '—'}</td>
          <td>${o.status ? `<span class="badge badge-primary">${o.status}</span>` : '—'}</td>
          <td>${o.qty || 0}</td>
          <td>${o.trucker || '—'}</td>
          <td>${o.order_status ? `<span class="badge badge-info">${o.order_status}</span>` : '—'}</td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--accent-danger)">Failed to load: ${err.message}</td></tr>`;
    }
  }
};
