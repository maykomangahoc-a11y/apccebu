// ═══════════════════════════════════════════════════════════════════════════
// Picking Page
// ═══════════════════════════════════════════════════════════════════════════

const PickingPage = {
  pendingPicks: [],
  completedPicks: [],

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Picking</h2>
          <p class="page-desc">Manage picking assignments and history</p>
        </div>
        <button class="btn btn-primary" onclick="PickingPage.showAssignModal()">+ Assign Pick</button>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="pending" onclick="PickingPage.switchTab('pending')">Pending Picks</button>
        <button class="tab" data-tab="completed" onclick="PickingPage.switchTab('completed')">Completed</button>
      </div>

      <div id="tab-pending" class="tab-panel active">
        <div class="card" style="padding:0">
          <div class="table-container" style="border:none;max-height:60vh;overflow-y:auto">
            <table>
              <thead><tr><th>FO</th><th>Account</th><th>BL</th><th>Picker</th><th>Qty</th><th>Staging</th><th>Assigned</th><th>Actions</th></tr></thead>
              <tbody id="pending-picks-tbody"><tr><td colspan="8"><div class="loading-container"><div class="spinner"></div></div></td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="tab-completed" class="tab-panel">
        <div class="toolbar">
          <input type="text" class="search-input" id="picks-search" placeholder="Search completed picks..." oninput="PickingPage.renderCompleted()">
        </div>
        <div class="card" style="padding:0">
          <div class="table-container" style="border:none;max-height:60vh;overflow-y:auto">
            <table>
              <thead><tr><th>FO</th><th>Account</th><th>BL</th><th>Picker</th><th>Qty</th><th>Staging</th><th>Duration</th><th>Actions</th></tr></thead>
              <tbody id="completed-picks-tbody"><tr><td colspan="8"><div class="loading-container"><div class="spinner"></div></div></td></tr></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.loadData();
  },

  switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  },

  async loadData() {
    try {
      const [pending, completed] = await Promise.all([
        API.get('/api/picking/pending'),
        API.get('/api/picking'),
      ]);
      this.pendingPicks = pending;
      this.completedPicks = completed;
      this.renderPending();
      this.renderCompleted();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  renderPending() {
    const tbody = document.getElementById('pending-picks-tbody');
    if (!tbody) return;

    if (this.pendingPicks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No pending picks</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.pendingPicks.map(p => `
      <tr>
        <td>${p.fo || '—'}</td>
        <td>${p.account_name || '—'}</td>
        <td>${p.bl || '—'}</td>
        <td>${p.picker_code || '—'}</td>
        <td>${p.qty || 0}</td>
        <td>${p.staging_area || '—'}</td>
        <td>${p.assigned_user || '—'}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-success btn-sm" onclick="PickingPage.completePick('${p.id}')" title="Complete">✓</button>
            <button class="btn btn-danger btn-sm" onclick="PickingPage.deletePending('${p.id}')" title="Remove">✕</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  renderCompleted() {
    const tbody = document.getElementById('completed-picks-tbody');
    if (!tbody) return;

    const search = (document.getElementById('picks-search')?.value || '').toLowerCase();
    const filtered = this.completedPicks.filter(p =>
      !search ||
      (p.fo || '').toLowerCase().includes(search) ||
      (p.account_name || '').toLowerCase().includes(search) ||
      (p.picker_code || '').toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">No completed picks</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(p => `
      <tr>
        <td>${p.fo || '—'}</td>
        <td>${p.account_name || '—'}</td>
        <td>${p.bl || '—'}</td>
        <td>${p.picker_code || '—'}</td>
        <td>${p.qty || 0}</td>
        <td>${p.staging_area || '—'}</td>
        <td>${p.duration || '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="PickingPage.deleteCompleted(${p.id})">✕</button></td>
      </tr>
    `).join('');
  },

  showAssignModal() {
    const body = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">FO</label><input class="form-input" id="pk-fo"></div>
        <div class="form-group"><label class="form-label">Account Name</label><input class="form-input" id="pk-account"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">BL</label><input class="form-input" id="pk-bl"></div>
        <div class="form-group"><label class="form-label">Picker Code</label><input class="form-input" id="pk-picker"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Qty</label><input type="number" class="form-input" id="pk-qty" value="0"></div>
        <div class="form-group"><label class="form-label">Staging Area</label><input class="form-input" id="pk-staging"></div>
      </div>
      <div class="form-group"><label class="form-label">Party Code</label><input class="form-input" id="pk-party"></div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="PickingPage.createPending()">Assign</button>
    `;
    App.showModal('Assign Pick', body, footer);
  },

  async createPending() {
    try {
      await API.post('/api/picking/pending', {
        fo: document.getElementById('pk-fo').value,
        account_name: document.getElementById('pk-account').value,
        bl: document.getElementById('pk-bl').value,
        picker_code: document.getElementById('pk-picker').value,
        qty: parseInt(document.getElementById('pk-qty').value) || 0,
        staging_area: document.getElementById('pk-staging').value,
        party_code: document.getElementById('pk-party').value,
        timestamp: new Date().toISOString(),
      });
      App.closeModal();
      App.toast('Pick assigned', 'success');
      this.loadData();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async completePick(id) {
    try {
      await API.post(`/api/picking/pending/${id}/complete`, {
        end_time: new Date().toISOString(),
        duration: '',
      });
      App.toast('Pick completed', 'success');
      this.loadData();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async deletePending(id) {
    if (!confirm('Remove this pending pick?')) return;
    try {
      await API.delete(`/api/picking/pending/${id}`);
      App.toast('Pending pick removed', 'success');
      this.loadData();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async deleteCompleted(id) {
    if (!confirm('Delete this pick record?')) return;
    try {
      await API.delete(`/api/picking/${id}`);
      App.toast('Pick record deleted', 'success');
      this.loadData();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }
};
