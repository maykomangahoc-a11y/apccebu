// ═══════════════════════════════════════════════════════════════════════════
// Processing Page
// ═══════════════════════════════════════════════════════════════════════════

const ProcessingPage = {
  records: [],

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Processing</h2>
          <p class="page-desc">Order processing and SKU management</p>
        </div>
        <button class="btn btn-primary" onclick="ProcessingPage.showAddModal()">+ New Record</button>
      </div>

      <div class="toolbar">
        <input type="text" class="search-input" id="proc-search" placeholder="Search FO, account..." oninput="ProcessingPage.renderTable()">
        <select class="form-select" id="proc-status-filter" style="width:auto;min-width:140px" onchange="ProcessingPage.renderTable()">
          <option value="">All Statuses</option>
          <option value="Uploaded">Uploaded</option>
          <option value="Processing">Processing</option>
          <option value="Completed">Completed</option>
          <option value="Printed">Printed</option>
        </select>
        <button class="btn btn-secondary btn-sm" onclick="ProcessingPage.loadData()">↻ Refresh</button>
      </div>

      <div class="card" style="padding:0">
        <div class="table-container" style="border:none;max-height:65vh;overflow-y:auto">
          <table>
            <thead>
              <tr>
                <th>FO</th>
                <th>Account</th>
                <th>Party Code</th>
                <th>Cases</th>
                <th>Status</th>
                <th>Printing</th>
                <th>Processor</th>
                <th>Processed Qty</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="proc-tbody"><tr><td colspan="9"><div class="loading-container"><div class="spinner"></div></div></td></tr></tbody>
          </table>
        </div>
      </div>
    `;

    this.loadData();
  },

  async loadData() {
    try {
      this.records = await API.get('/api/processing');
      this.renderTable();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  renderTable() {
    const tbody = document.getElementById('proc-tbody');
    if (!tbody) return;

    const search = (document.getElementById('proc-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('proc-status-filter')?.value || '';

    const filtered = this.records.filter(r => {
      const matchSearch = !search || (r.fo || '').toLowerCase().includes(search) || (r.account_name || '').toLowerCase().includes(search);
      const matchStatus = !statusFilter || (r.processing_status || '').toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">⚙️</div><div class="empty-text">No processing records</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const statusBadge = r.processing_status ?
        `<span class="badge ${r.processing_status === 'Completed' ? 'badge-success' : r.processing_status === 'Processing' ? 'badge-warning' : 'badge-info'}">${r.processing_status}</span>` : '—';
      const printBadge = r.printing_status ?
        `<span class="badge ${r.printing_status === 'Printed' ? 'badge-success' : 'badge-info'}">${r.printing_status}</span>` : '—';

      return `
        <tr>
          <td>${r.fo || '—'}</td>
          <td>${r.account_name || '—'}</td>
          <td>${r.party_code || '—'}</td>
          <td>${r.cases || '—'}</td>
          <td>${statusBadge}</td>
          <td>${printBadge}</td>
          <td>${r.processor || '—'}</td>
          <td>${r.processed_qty || 0}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn-secondary btn-sm" onclick="ProcessingPage.showEditModal(${r.id})">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="ProcessingPage.deleteRecord(${r.id})">✕</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  showAddModal() {
    const body = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">FO</label><input class="form-input" id="pr-fo"></div>
        <div class="form-group"><label class="form-label">Account Name</label><input class="form-input" id="pr-account"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Party Code</label><input class="form-input" id="pr-party"></div>
        <div class="form-group"><label class="form-label">Cases</label><input class="form-input" id="pr-cases"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Size</label><input class="form-input" id="pr-size"></div>
        <div class="form-group"><label class="form-label">Trucker</label><input class="form-input" id="pr-trucker"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Loading Date</label><input class="form-input" id="pr-loading-date" type="date"></div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="pr-status">
            <option value="Uploaded">Uploaded</option>
            <option value="Processing">Processing</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ProcessingPage.createRecord()">Create</button>
    `;
    App.showModal('New Processing Record', body, footer);
  },

  async createRecord() {
    try {
      await API.post('/api/processing', {
        fo: document.getElementById('pr-fo').value,
        account_name: document.getElementById('pr-account').value,
        party_code: document.getElementById('pr-party').value,
        cases: document.getElementById('pr-cases').value,
        size: document.getElementById('pr-size').value,
        trucker: document.getElementById('pr-trucker').value,
        loading_date: document.getElementById('pr-loading-date').value,
        processing_status: document.getElementById('pr-status').value,
        upload_timestamp: new Date().toISOString(),
        uploader: API.getUser()?.username || '',
      });
      App.closeModal();
      App.toast('Processing record created', 'success');
      this.loadData();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  showEditModal(id) {
    const r = this.records.find(x => x.id === id);
    if (!r) return;

    const body = `
      <input type="hidden" id="pr-edit-id" value="${r.id}">
      <div class="form-row">
        <div class="form-group"><label class="form-label">FO</label><input class="form-input" id="pr-edit-fo" value="${r.fo || ''}"></div>
        <div class="form-group"><label class="form-label">Account</label><input class="form-input" id="pr-edit-account" value="${r.account_name || ''}"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Processing Status</label>
          <select class="form-select" id="pr-edit-status">
            ${['Uploaded','Processing','Completed'].map(s => `<option value="${s}" ${r.processing_status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Printing Status</label>
          <select class="form-select" id="pr-edit-print">
            <option value="">—</option>
            ${['Pending','Printed'].map(s => `<option value="${s}" ${r.printing_status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Processor</label><input class="form-input" id="pr-edit-processor" value="${r.processor || ''}"></div>
        <div class="form-group"><label class="form-label">Processed Qty</label><input type="number" class="form-input" id="pr-edit-pqty" value="${r.processed_qty || 0}"></div>
      </div>
    `;
    const footer = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ProcessingPage.updateRecord()">Save</button>
    `;
    App.showModal('Edit Processing Record', body, footer);
  },

  async updateRecord() {
    const id = document.getElementById('pr-edit-id').value;
    try {
      await API.put(`/api/processing/${id}`, {
        fo: document.getElementById('pr-edit-fo').value,
        account_name: document.getElementById('pr-edit-account').value,
        processing_status: document.getElementById('pr-edit-status').value,
        printing_status: document.getElementById('pr-edit-print').value,
        processor: document.getElementById('pr-edit-processor').value,
        processed_qty: parseInt(document.getElementById('pr-edit-pqty').value) || 0,
      });
      App.closeModal();
      App.toast('Record updated', 'success');
      this.loadData();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  async deleteRecord(id) {
    if (!confirm('Delete this processing record?')) return;
    try {
      await API.delete(`/api/processing/${id}`);
      App.toast('Record deleted', 'success');
      this.loadData();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }
};
