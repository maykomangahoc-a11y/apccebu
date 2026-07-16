// ═══════════════════════════════════════════════════════════════════════════
// Inbound Page
// ═══════════════════════════════════════════════════════════════════════════

const InboundPage = {
  monitoring: [],
  inboundData: [],

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Inbound</h2>
          <p class="page-desc">Inbound monitoring and data tracking</p>
        </div>
        <button class="btn btn-primary" onclick="InboundPage.showAddMonitoring()">+ New Entry</button>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="monitoring" onclick="InboundPage.switchTab('monitoring')">Monitoring</button>
        <button class="tab" data-tab="data" onclick="InboundPage.switchTab('data')">Inbound Data</button>
      </div>

      <div id="tab-monitoring" class="tab-panel active">
        <div class="card" style="padding:0">
          <div class="table-container" style="border:none;max-height:60vh;overflow-y:auto">
            <table>
              <thead><tr><th>Type</th><th>Day</th><th>Trucker</th><th>Source</th><th>ID</th><th>Arrival</th><th>Status</th><th>Checker</th><th>Actions</th></tr></thead>
              <tbody id="monitoring-tbody"><tr><td colspan="9"><div class="loading-container"><div class="spinner"></div></div></td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="tab-data" class="tab-panel">
        <div class="page-header" style="margin-bottom:var(--space-md)">
          <div></div>
          <button class="btn btn-primary btn-sm" onclick="InboundPage.showAddData()">+ Add Data</button>
        </div>
        <div class="card" style="padding:0">
          <div class="table-container" style="border:none;max-height:60vh;overflow-y:auto">
            <table>
              <thead><tr><th>GR Date</th><th>JIB</th><th>Shift</th><th>Operator</th><th>Qty</th><th>Pallets</th><th>Duration</th><th>Actions</th></tr></thead>
              <tbody id="inbound-data-tbody"><tr><td colspan="8"><div class="loading-container"><div class="spinner"></div></div></td></tr></tbody>
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
      const [monitoring, data] = await Promise.all([
        API.get('/api/inbound/monitoring'),
        API.get('/api/inbound/data'),
      ]);
      this.monitoring = monitoring;
      this.inboundData = data;
      this.renderMonitoring();
      this.renderInboundData();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  renderMonitoring() {
    const tbody = document.getElementById('monitoring-tbody');
    if (!tbody) return;

    if (this.monitoring.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">📥</div><div class="empty-text">No monitoring entries</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.monitoring.map(m => {
      const statusCls = (m.status || '').toLowerCase() === 'completed' ? 'badge-success' : (m.status || '').toLowerCase() === 'unloading' ? 'badge-warning' : 'badge-info';
      return `
        <tr>
          <td>${m.type || '—'}</td>
          <td>${m.day || '—'}</td>
          <td>${m.trucker || '—'}</td>
          <td>${m.source || '—'}</td>
          <td>${m.identifier || '—'}</td>
          <td>${m.arrival || '—'}</td>
          <td>${m.status ? `<span class="badge ${statusCls}">${m.status}</span>` : '—'}</td>
          <td>${m.checker || '—'}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn-secondary btn-sm" onclick="InboundPage.showEditMonitoring(${m.id})">✏️</button>
              <button class="btn btn-secondary btn-sm" onclick="InboundPage.archiveMonitoring(${m.id})" title="Archive">📁</button>
              <button class="btn btn-danger btn-sm" onclick="InboundPage.deleteMonitoring(${m.id})">✕</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderInboundData() {
    const tbody = document.getElementById('inbound-data-tbody');
    if (!tbody) return;

    if (this.inboundData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No inbound data</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.inboundData.map(d => `
      <tr>
        <td>${d.gr_date || '—'}</td>
        <td>${d.jib || '—'}</td>
        <td>${d.shift || '—'}</td>
        <td>${d.operator || '—'}</td>
        <td>${d.qty || '—'}</td>
        <td>${d.pallets || '—'}</td>
        <td>${d.duration || '—'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="InboundPage.deleteData(${d.id})">✕</button></td>
      </tr>
    `).join('');
  },

  showAddMonitoring() {
    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="im-type"><option value="Inbound">Inbound</option><option value="Transfer">Transfer</option></select>
        </div>
        <div class="form-group"><label class="form-label">Day</label><input class="form-input" id="im-day" type="date"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Trucker</label><input class="form-input" id="im-trucker"></div>
        <div class="form-group"><label class="form-label">Source</label><input class="form-input" id="im-source"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Identifier</label><input class="form-input" id="im-identifier"></div>
        <div class="form-group"><label class="form-label">Checker</label><input class="form-input" id="im-checker"></div>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="InboundPage.createMonitoring()">Create</button>
    `;
    App.showModal('New Monitoring Entry', body, footer);
  },

  async createMonitoring() {
    try {
      await API.post('/api/inbound/monitoring', {
        type: document.getElementById('im-type').value,
        day: document.getElementById('im-day').value,
        trucker: document.getElementById('im-trucker').value,
        source: document.getElementById('im-source').value,
        identifier: document.getElementById('im-identifier').value,
        checker: document.getElementById('im-checker').value,
      });
      App.closeModal();
      App.toast('Entry created', 'success');
      this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  showEditMonitoring(id) {
    const m = this.monitoring.find(x => x.id === id);
    if (!m) return;
    const statuses = ['', 'Waiting', 'Docked', 'Unloading', 'Completed'];
    const body = `
      <input type="hidden" id="im-edit-id" value="${m.id}">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Trucker</label><input class="form-input" id="im-edit-trucker" value="${m.trucker || ''}"></div>
        <div class="form-group"><label class="form-label">Arrival</label><input class="form-input" id="im-edit-arrival" value="${m.arrival || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Start Time</label><input class="form-input" id="im-edit-start" value="${m.start_time || ''}"></div>
        <div class="form-group"><label class="form-label">End Unload</label><input class="form-input" id="im-edit-end" value="${m.end_unload || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="im-edit-status">
            ${statuses.map(s => `<option value="${s}" ${m.status === s ? 'selected' : ''}>${s || '—'}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Checker</label><input class="form-input" id="im-edit-checker" value="${m.checker || ''}"></div>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="InboundPage.updateMonitoring()">Save</button>
    `;
    App.showModal('Edit Monitoring', body, footer);
  },

  async updateMonitoring() {
    const id = document.getElementById('im-edit-id').value;
    try {
      await API.put(`/api/inbound/monitoring/${id}`, {
        trucker: document.getElementById('im-edit-trucker').value,
        arrival: document.getElementById('im-edit-arrival').value,
        start_time: document.getElementById('im-edit-start').value,
        end_unload: document.getElementById('im-edit-end').value,
        status: document.getElementById('im-edit-status').value,
        checker: document.getElementById('im-edit-checker').value,
      });
      App.closeModal();
      App.toast('Updated', 'success');
      this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async archiveMonitoring(id) {
    if (!confirm('Archive this entry?')) return;
    try {
      await API.post(`/api/inbound/monitoring/${id}/archive`);
      App.toast('Archived', 'success');
      this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async deleteMonitoring(id) {
    if (!confirm('Delete this entry?')) return;
    try {
      await API.delete(`/api/inbound/monitoring/${id}`);
      App.toast('Deleted', 'success');
      this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  showAddData() {
    const body = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">GR Date</label><input class="form-input" id="id-gr" type="date"></div>
        <div class="form-group"><label class="form-label">JIB</label><input class="form-input" id="id-jib"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Shift</label><input class="form-input" id="id-shift" value="1st Shift"></div>
        <div class="form-group"><label class="form-label">Operator</label><input class="form-input" id="id-operator"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Qty</label><input class="form-input" id="id-qty"></div>
        <div class="form-group"><label class="form-label">Pallets</label><input class="form-input" id="id-pallets"></div>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="InboundPage.createData()">Create</button>
    `;
    App.showModal('New Inbound Data', body, footer);
  },

  async createData() {
    try {
      await API.post('/api/inbound/data', {
        gr_date: document.getElementById('id-gr').value,
        jib: document.getElementById('id-jib').value,
        shift: document.getElementById('id-shift').value,
        operator: document.getElementById('id-operator').value,
        qty: document.getElementById('id-qty').value,
        pallets: document.getElementById('id-pallets').value,
      });
      App.closeModal();
      App.toast('Data created', 'success');
      this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async deleteData(id) {
    if (!confirm('Delete this record?')) return;
    try {
      await API.delete(`/api/inbound/data/${id}`);
      App.toast('Deleted', 'success');
      this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  }
};
