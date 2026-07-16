// ═══════════════════════════════════════════════════════════════════════════
// Putaway Page
// ═══════════════════════════════════════════════════════════════════════════

const PutawayPage = {
  pendingData: [],
  completedData: [],

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Putaway</h2>
          <p class="page-desc">Manage putaway assignments and history</p>
        </div>
        <button class="btn btn-primary" onclick="PutawayPage.showAssignModal()">+ Assign Putaway</button>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="pa-pending" onclick="PutawayPage.switchTab('pa-pending')">Pending</button>
        <button class="tab" data-tab="pa-completed" onclick="PutawayPage.switchTab('pa-completed')">Completed</button>
      </div>

      <div id="tab-pa-pending" class="tab-panel active">
        <div class="card" style="padding:0">
          <div class="table-container" style="border:none;max-height:60vh;overflow-y:auto">
            <table>
              <thead><tr><th>JIB</th><th>GR Date</th><th>Operator</th><th>Qty</th><th>Pallets</th><th>Assigned By</th><th>Actions</th></tr></thead>
              <tbody id="pa-pending-tbody"><tr><td colspan="7"><div class="loading-container"><div class="spinner"></div></div></td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="tab-pa-completed" class="tab-panel">
        <div class="card" style="padding:0">
          <div class="table-container" style="border:none;max-height:60vh;overflow-y:auto">
            <table>
              <thead><tr><th>JIB</th><th>GR Date</th><th>Shift</th><th>Operator</th><th>Qty</th><th>Pallets</th><th>Duration</th><th>Actions</th></tr></thead>
              <tbody id="pa-completed-tbody"><tr><td colspan="8"><div class="loading-container"><div class="spinner"></div></div></td></tr></tbody>
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
        API.get('/api/putaway/pending'),
        API.get('/api/putaway'),
      ]);
      this.pendingData = pending;
      this.completedData = completed;
      this.renderPending();
      this.renderCompleted();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  renderPending() {
    const tbody = document.getElementById('pa-pending-tbody');
    if (!tbody) return;

    if (this.pendingData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No pending putaway</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.pendingData.map(p => `
      <tr>
        <td>${p.jib || '—'}</td>
        <td>${p.gr_date || '—'}</td>
        <td>${p.operator || '—'}</td>
        <td>${p.qty || '—'}</td>
        <td>${p.pallets || '—'}</td>
        <td>${p.assigned_user || '—'}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-success btn-sm" onclick="PutawayPage.completePutaway('${p.id}')">✓ Complete</button>
            <button class="btn btn-danger btn-sm" onclick="PutawayPage.deletePending('${p.id}')">✕</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  renderCompleted() {
    const tbody = document.getElementById('pa-completed-tbody');
    if (!tbody) return;

    if (this.completedData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🏗️</div><div class="empty-text">No completed putaway</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.completedData.map(p => `
      <tr>
        <td>${p.jib || '—'}</td>
        <td>${p.gr_date || '—'}</td>
        <td>${p.shift || '—'}</td>
        <td>${p.operator || '—'}</td>
        <td>${p.qty || '—'}</td>
        <td>${p.pallets || '—'}</td>
        <td>${p.duration || '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="PutawayPage.deleteCompleted(${p.id})">✕</button></td>
      </tr>
    `).join('');
  },

  showAssignModal() {
    const body = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">JIB</label><input class="form-input" id="pa-jib"></div>
        <div class="form-group"><label class="form-label">GR Date</label><input class="form-input" id="pa-gr" type="date"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Operator</label><input class="form-input" id="pa-operator"></div>
        <div class="form-group"><label class="form-label">Qty</label><input class="form-input" id="pa-qty"></div>
      </div>
      <div class="form-group"><label class="form-label">Pallets</label><input class="form-input" id="pa-pallets"></div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="PutawayPage.createPending()">Assign</button>
    `;
    App.showModal('Assign Putaway', body, footer);
  },

  async createPending() {
    try {
      await API.post('/api/putaway/pending', {
        jib: document.getElementById('pa-jib').value,
        gr_date: document.getElementById('pa-gr').value,
        operator: document.getElementById('pa-operator').value,
        qty: document.getElementById('pa-qty').value,
        pallets: document.getElementById('pa-pallets').value,
      });
      App.closeModal();
      App.toast('Putaway assigned', 'success');
      this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async completePutaway(id) {
    try {
      await API.post(`/api/putaway/pending/${id}/complete`, {
        end_time: new Date().toISOString(),
        duration: '',
        shift: '1st Shift',
      });
      App.toast('Putaway completed', 'success');
      this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async deletePending(id) {
    if (!confirm('Remove this pending putaway?')) return;
    try {
      await API.delete(`/api/putaway/pending/${id}`);
      App.toast('Removed', 'success');
      this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async deleteCompleted(id) {
    if (!confirm('Delete this putaway record?')) return;
    try {
      await API.delete(`/api/putaway/${id}`);
      App.toast('Deleted', 'success');
      this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  }
};
