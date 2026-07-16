// ═══════════════════════════════════════════════════════════════════════════
// Dispatch Page
// ═══════════════════════════════════════════════════════════════════════════

const DispatchPage = {
  orders: [],
  filteredOrders: [],

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Dispatch Orders</h2>
          <p class="page-desc">Manage outbound dispatch operations</p>
        </div>
        <button class="btn btn-primary" onclick="DispatchPage.showAddModal()">+ New Order</button>
      </div>

      <div class="toolbar">
        <input type="text" class="search-input" id="dispatch-search" placeholder="Search FO, account, party code..." oninput="DispatchPage.filterOrders()">
        <select class="form-select" id="dispatch-status-filter" style="width:auto;min-width:140px" onchange="DispatchPage.filterOrders()">
          <option value="">All Statuses</option>
          <option value="RTD">RTD</option>
          <option value="Sorting">Sorting</option>
          <option value="Sorted">Sorted</option>
          <option value="Picking">Picking</option>
          <option value="Picked">Picked</option>
          <option value="Loading">Loading</option>
          <option value="Loaded">Loaded</option>
          <option value="Dispatched">Dispatched</option>
          <option value="Checking">Checking</option>
        </select>
        <button class="btn btn-secondary btn-sm" onclick="DispatchPage.loadOrders()">↻ Refresh</button>
      </div>

      <div class="card" style="padding:0">
        <div class="table-container" style="border:none;max-height:65vh;overflow-y:auto">
          <table>
            <thead>
              <tr>
                <th>FO</th>
                <th>Account</th>
                <th>Party Code</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Order Status</th>
                <th>Trucker</th>
                <th>Plate No</th>
                <th>Staging</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="dispatch-tbody">
              <tr><td colspan="10"><div class="loading-container"><div class="spinner"></div></div></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="margin-top:var(--space-md);display:flex;align-items:center;justify-content:space-between">
        <span id="dispatch-count" style="font-size:0.8rem;color:var(--text-muted)"></span>
      </div>
    `;

    this.loadOrders();
  },

  async loadOrders() {
    try {
      this.orders = await API.get('/api/dispatch');
      this.filterOrders();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  filterOrders() {
    const search = (document.getElementById('dispatch-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('dispatch-status-filter')?.value || '';

    this.filteredOrders = this.orders.filter(o => {
      const matchSearch = !search ||
        (o.fo || '').toLowerCase().includes(search) ||
        (o.account_name || '').toLowerCase().includes(search) ||
        (o.party_code || '').toLowerCase().includes(search);
      const matchStatus = !statusFilter || (o.order_status || '').toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchStatus;
    });

    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('dispatch-tbody');
    const countEl = document.getElementById('dispatch-count');
    if (!tbody) return;

    if (countEl) countEl.textContent = `${this.filteredOrders.length} of ${this.orders.length} orders`;

    if (this.filteredOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No orders found</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.filteredOrders.map(o => `
      <tr>
        <td title="${o.fo || ''}">${o.fo || '—'}</td>
        <td title="${o.account_name || ''}">${o.account_name || '—'}</td>
        <td>${o.party_code || '—'}</td>
        <td>${o.type || '—'}</td>
        <td>${o.qty || 0}</td>
        <td>${this.statusBadge(o.order_status)}</td>
        <td>${o.trucker || '—'}</td>
        <td>${o.plate_no || '—'}</td>
        <td>${o.staging_area || '—'}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm" onclick="DispatchPage.showEditModal('${o.id}')" title="Edit">✏️</button>
            <button class="btn btn-secondary btn-sm" onclick="DispatchPage.showStatusModal('${o.id}')" title="Status">📋</button>
            <button class="btn btn-danger btn-sm" onclick="DispatchPage.archiveOrder('${o.id}')" title="Archive">📁</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  statusBadge(status) {
    if (!status) return '—';
    const map = {
      rtd: 'badge-warning', sorting: 'badge-info', sorted: 'badge-info',
      picking: 'badge-primary', picked: 'badge-primary',
      loading: 'badge-warning', loaded: 'badge-success',
      dispatched: 'badge-success', checking: 'badge-info'
    };
    const cls = map[(status || '').toLowerCase()] || 'badge-primary';
    return `<span class="badge ${cls}">${status}</span>`;
  },

  showAddModal() {
    const body = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">FO</label><input class="form-input" id="d-fo"></div>
        <div class="form-group"><label class="form-label">Account Name</label><input class="form-input" id="d-account"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Party Code</label><input class="form-input" id="d-party"></div>
        <div class="form-group"><label class="form-label">Type</label><input class="form-input" id="d-type"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Qty</label><input type="number" class="form-input" id="d-qty" value="0"></div>
        <div class="form-group"><label class="form-label">Staging Area</label><input class="form-input" id="d-staging"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">CBM</label><input class="form-input" id="d-cbm"></div>
        <div class="form-group"><label class="form-label">Weight</label><input class="form-input" id="d-weight"></div>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="DispatchPage.createOrder()">Create Order</button>
    `;
    App.showModal('New Dispatch Order', body, footer);
  },

  async createOrder() {
    try {
      await API.post('/api/dispatch', {
        fo: document.getElementById('d-fo').value,
        account_name: document.getElementById('d-account').value,
        party_code: document.getElementById('d-party').value,
        type: document.getElementById('d-type').value,
        qty: parseInt(document.getElementById('d-qty').value) || 0,
        staging_area: document.getElementById('d-staging').value,
        cbm: document.getElementById('d-cbm').value,
        weight: document.getElementById('d-weight').value,
      });
      App.closeModal();
      App.toast('Order created', 'success');
      this.loadOrders();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  showEditModal(id) {
    const o = this.orders.find(x => x.id === id);
    if (!o) return;

    const body = `
      <input type="hidden" id="d-edit-id" value="${o.id}">
      <div class="form-row">
        <div class="form-group"><label class="form-label">FO</label><input class="form-input" id="d-edit-fo" value="${o.fo || ''}"></div>
        <div class="form-group"><label class="form-label">Account Name</label><input class="form-input" id="d-edit-account" value="${o.account_name || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Party Code</label><input class="form-input" id="d-edit-party" value="${o.party_code || ''}"></div>
        <div class="form-group"><label class="form-label">Type</label><input class="form-input" id="d-edit-type" value="${o.type || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Qty</label><input type="number" class="form-input" id="d-edit-qty" value="${o.qty || 0}"></div>
        <div class="form-group"><label class="form-label">Staging Area</label><input class="form-input" id="d-edit-staging" value="${o.staging_area || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Trucker</label><input class="form-input" id="d-edit-trucker" value="${o.trucker || ''}"></div>
        <div class="form-group"><label class="form-label">Plate No</label><input class="form-input" id="d-edit-plate" value="${o.plate_no || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Truck Size</label><input class="form-input" id="d-edit-truck-size" value="${o.truck_size || ''}"></div>
        <div class="form-group"><label class="form-label">Est Amount</label><input type="number" class="form-input" id="d-edit-amount" value="${o.est_amount || 0}"></div>
      </div>
    `;
    const footer = `
      <button class="btn btn-danger" onclick="DispatchPage.deleteOrder('${o.id}')">Delete</button>
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="DispatchPage.updateOrder()">Save Changes</button>
    `;
    App.showModal('Edit Dispatch Order', body, footer);
  },

  async updateOrder() {
    const id = document.getElementById('d-edit-id').value;
    try {
      await API.put(`/api/dispatch/${id}`, {
        fo: document.getElementById('d-edit-fo').value,
        account_name: document.getElementById('d-edit-account').value,
        party_code: document.getElementById('d-edit-party').value,
        type: document.getElementById('d-edit-type').value,
        qty: parseInt(document.getElementById('d-edit-qty').value) || 0,
        staging_area: document.getElementById('d-edit-staging').value,
        trucker: document.getElementById('d-edit-trucker').value,
        plate_no: document.getElementById('d-edit-plate').value,
        truck_size: document.getElementById('d-edit-truck-size').value,
        est_amount: parseFloat(document.getElementById('d-edit-amount').value) || 0,
      });
      App.closeModal();
      App.toast('Order updated', 'success');
      this.loadOrders();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  showStatusModal(id) {
    const o = this.orders.find(x => x.id === id);
    if (!o) return;

    const statuses = ['RTD', 'Sorting', 'Sorted', 'Picking', 'Picked', 'Loading', 'Loaded', 'Dispatched', 'Checking'];
    const body = `
      <p style="margin-bottom:var(--space-md);color:var(--text-secondary)">FO: <strong>${o.fo || '—'}</strong> | Current: <strong>${o.order_status || 'None'}</strong></p>
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-sm)">
        ${statuses.map(s => `
          <button class="btn ${(o.order_status || '').toLowerCase() === s.toLowerCase() ? 'btn-primary' : 'btn-secondary'} btn-sm"
            onclick="DispatchPage.setStatus('${id}','${s}')">${s}</button>
        `).join('')}
      </div>
    `;
    App.showModal('Update Order Status', body);
  },

  async setStatus(id, status) {
    try {
      await API.put(`/api/dispatch/${id}/status`, { order_status: status });
      App.closeModal();
      App.toast(`Status set to ${status}`, 'success');
      this.loadOrders();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async archiveOrder(id) {
    if (!confirm('Archive this order?')) return;
    try {
      await API.post(`/api/dispatch/${id}/archive`);
      App.toast('Order archived', 'success');
      this.loadOrders();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async deleteOrder(id) {
    if (!confirm('Permanently delete this order?')) return;
    try {
      await API.delete(`/api/dispatch/${id}`);
      App.closeModal();
      App.toast('Order deleted', 'success');
      this.loadOrders();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }
};
