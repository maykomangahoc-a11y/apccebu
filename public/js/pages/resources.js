// ═══════════════════════════════════════════════════════════════════════════
// Resources Page — Pickers, Checkers, Staging Areas
// ═══════════════════════════════════════════════════════════════════════════

const ResourcesPage = {
  pickers: [],
  checkers: [],
  staging: [],

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Resources</h2>
          <p class="page-desc">Manage pickers, checkers, and staging areas</p>
        </div>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="res-pickers" onclick="ResourcesPage.switchTab('res-pickers')">Pickers</button>
        <button class="tab" data-tab="res-checkers" onclick="ResourcesPage.switchTab('res-checkers')">Checkers</button>
        <button class="tab" data-tab="res-staging" onclick="ResourcesPage.switchTab('res-staging')">Staging Areas</button>
      </div>

      <div id="tab-res-pickers" class="tab-panel active">
        <div class="toolbar">
          <div></div>
          <button class="btn btn-primary btn-sm" onclick="ResourcesPage.showAddPicker()">+ Add Picker</button>
        </div>
        <div class="card" style="padding:0">
          <div class="table-container" style="border:none">
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Designation</th><th>Shift</th><th>Actions</th></tr></thead>
              <tbody id="pickers-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="tab-res-checkers" class="tab-panel">
        <div class="toolbar">
          <div></div>
          <button class="btn btn-primary btn-sm" onclick="ResourcesPage.showAddChecker()">+ Add Checker</button>
        </div>
        <div class="card" style="padding:0">
          <div class="table-container" style="border:none">
            <table>
              <thead><tr><th>Code</th><th>Name</th><th>Shift</th><th>Type</th><th>Actions</th></tr></thead>
              <tbody id="checkers-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="tab-res-staging" class="tab-panel">
        <div class="toolbar">
          <div></div>
          <button class="btn btn-primary btn-sm" onclick="ResourcesPage.showAddStaging()">+ Add Area</button>
        </div>
        <div class="card" style="padding:0">
          <div class="table-container" style="border:none">
            <table>
              <thead><tr><th>Name</th><th>Actions</th></tr></thead>
              <tbody id="staging-tbody"></tbody>
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
      const [pickers, checkers, staging] = await Promise.all([
        API.get('/api/resources/pickers'),
        API.get('/api/resources/checkers'),
        API.get('/api/resources/staging-areas'),
      ]);
      this.pickers = pickers;
      this.checkers = checkers;
      this.staging = staging;
      this.renderPickers();
      this.renderCheckers();
      this.renderStaging();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  renderPickers() {
    const tbody = document.getElementById('pickers-tbody');
    if (!tbody) return;
    if (this.pickers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><div class="empty-text">No pickers</div></div></td></tr>';
      return;
    }
    tbody.innerHTML = this.pickers.map(p => `
      <tr>
        <td><span class="badge badge-primary">${p.code}</span></td>
        <td>${p.name}</td>
        <td>${p.designation || 'Picker'}</td>
        <td>${p.shift || '1st Shift'}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm" onclick="ResourcesPage.editPicker(${p.id})">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="ResourcesPage.deletePicker(${p.id})">✕</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  renderCheckers() {
    const tbody = document.getElementById('checkers-tbody');
    if (!tbody) return;
    if (this.checkers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><div class="empty-text">No checkers</div></div></td></tr>';
      return;
    }
    tbody.innerHTML = this.checkers.map(c => `
      <tr>
        <td><span class="badge badge-info">${c.code}</span></td>
        <td>${c.name}</td>
        <td>${c.shift || '1st Shift'}</td>
        <td>${c.type || 'Outbound'}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn-secondary btn-sm" onclick="ResourcesPage.editChecker(${c.id})">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="ResourcesPage.deleteChecker(${c.id})">✕</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  renderStaging() {
    const tbody = document.getElementById('staging-tbody');
    if (!tbody) return;
    if (this.staging.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2"><div class="empty-state"><div class="empty-text">No staging areas</div></div></td></tr>';
      return;
    }
    tbody.innerHTML = this.staging.map(s => `
      <tr>
        <td>${s.name}</td>
        <td><button class="btn btn-danger btn-sm" onclick="ResourcesPage.deleteStaging(${s.id})">✕</button></td>
      </tr>
    `).join('');
  },

  // ─── Picker CRUD ─────────────────────────────────────────────────────────
  showAddPicker() {
    const body = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Code</label><input class="form-input" id="rp-code"></div>
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="rp-name"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Designation</label><input class="form-input" id="rp-designation" value="Picker"></div>
        <div class="form-group"><label class="form-label">Shift</label><input class="form-input" id="rp-shift" value="1st Shift"></div>
      </div>
    `;
    App.showModal('Add Picker', body, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ResourcesPage.createPicker()">Add</button>
    `);
  },

  async createPicker() {
    try {
      await API.post('/api/resources/pickers', {
        code: document.getElementById('rp-code').value,
        name: document.getElementById('rp-name').value,
        designation: document.getElementById('rp-designation').value,
        shift: document.getElementById('rp-shift').value,
      });
      App.closeModal(); App.toast('Picker added', 'success'); this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  editPicker(id) {
    const p = this.pickers.find(x => x.id === id);
    if (!p) return;
    const body = `
      <input type="hidden" id="rp-edit-id" value="${p.id}">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Code</label><input class="form-input" id="rp-edit-code" value="${p.code}"></div>
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="rp-edit-name" value="${p.name}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Designation</label><input class="form-input" id="rp-edit-designation" value="${p.designation || ''}"></div>
        <div class="form-group"><label class="form-label">Shift</label><input class="form-input" id="rp-edit-shift" value="${p.shift || ''}"></div>
      </div>
    `;
    App.showModal('Edit Picker', body, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ResourcesPage.updatePicker()">Save</button>
    `);
  },

  async updatePicker() {
    const id = document.getElementById('rp-edit-id').value;
    try {
      await API.put(`/api/resources/pickers/${id}`, {
        code: document.getElementById('rp-edit-code').value,
        name: document.getElementById('rp-edit-name').value,
        designation: document.getElementById('rp-edit-designation').value,
        shift: document.getElementById('rp-edit-shift').value,
      });
      App.closeModal(); App.toast('Updated', 'success'); this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async deletePicker(id) {
    if (!confirm('Delete picker?')) return;
    try { await API.delete(`/api/resources/pickers/${id}`); App.toast('Deleted', 'success'); this.loadData(); }
    catch (err) { App.toast(err.message, 'error'); }
  },

  // ─── Checker CRUD ────────────────────────────────────────────────────────
  showAddChecker() {
    const body = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Code</label><input class="form-input" id="rc-code"></div>
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="rc-name"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Shift</label><input class="form-input" id="rc-shift" value="1st Shift"></div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="rc-type"><option>Outbound</option><option>Inbound</option></select>
        </div>
      </div>
    `;
    App.showModal('Add Checker', body, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ResourcesPage.createChecker()">Add</button>
    `);
  },

  async createChecker() {
    try {
      await API.post('/api/resources/checkers', {
        code: document.getElementById('rc-code').value,
        name: document.getElementById('rc-name').value,
        shift: document.getElementById('rc-shift').value,
        type: document.getElementById('rc-type').value,
      });
      App.closeModal(); App.toast('Checker added', 'success'); this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  editChecker(id) {
    const c = this.checkers.find(x => x.id === id);
    if (!c) return;
    const body = `
      <input type="hidden" id="rc-edit-id" value="${c.id}">
      <div class="form-row">
        <div class="form-group"><label class="form-label">Code</label><input class="form-input" id="rc-edit-code" value="${c.code}"></div>
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="rc-edit-name" value="${c.name}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Shift</label><input class="form-input" id="rc-edit-shift" value="${c.shift || ''}"></div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="rc-edit-type">
            <option ${c.type === 'Outbound' ? 'selected' : ''}>Outbound</option>
            <option ${c.type === 'Inbound' ? 'selected' : ''}>Inbound</option>
          </select>
        </div>
      </div>
    `;
    App.showModal('Edit Checker', body, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ResourcesPage.updateChecker()">Save</button>
    `);
  },

  async updateChecker() {
    const id = document.getElementById('rc-edit-id').value;
    try {
      await API.put(`/api/resources/checkers/${id}`, {
        code: document.getElementById('rc-edit-code').value,
        name: document.getElementById('rc-edit-name').value,
        shift: document.getElementById('rc-edit-shift').value,
        type: document.getElementById('rc-edit-type').value,
      });
      App.closeModal(); App.toast('Updated', 'success'); this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async deleteChecker(id) {
    if (!confirm('Delete checker?')) return;
    try { await API.delete(`/api/resources/checkers/${id}`); App.toast('Deleted', 'success'); this.loadData(); }
    catch (err) { App.toast(err.message, 'error'); }
  },

  // ─── Staging CRUD ────────────────────────────────────────────────────────
  showAddStaging() {
    App.showModal('Add Staging Area', `
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="rs-name"></div>
    `, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="ResourcesPage.createStaging()">Add</button>
    `);
  },

  async createStaging() {
    try {
      await API.post('/api/resources/staging-areas', { name: document.getElementById('rs-name').value });
      App.closeModal(); App.toast('Staging area added', 'success'); this.loadData();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async deleteStaging(id) {
    if (!confirm('Delete staging area?')) return;
    try { await API.delete(`/api/resources/staging-areas/${id}`); App.toast('Deleted', 'success'); this.loadData(); }
    catch (err) { App.toast(err.message, 'error'); }
  },
};
