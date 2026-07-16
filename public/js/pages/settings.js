// ═══════════════════════════════════════════════════════════════════════════
// Settings Page — Config + User Management
// ═══════════════════════════════════════════════════════════════════════════

const SettingsPage = {
  users: [],

  async render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Settings</h2>
          <p class="page-desc">App configuration and user management</p>
        </div>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="set-config" onclick="SettingsPage.switchTab('set-config')">Configuration</button>
        <button class="tab" data-tab="set-users" onclick="SettingsPage.switchTab('set-users')">User Management</button>
      </div>

      <div id="tab-set-config" class="tab-panel active">
        <div class="card" style="max-width:500px">
          <h3 class="card-title" style="margin-bottom:var(--space-lg)">App Configuration</h3>
          <div class="form-group">
            <label class="form-label">Day Start Hour (0–23)</label>
            <input type="number" class="form-input" id="cfg-day-start" min="0" max="23" value="3">
          </div>
          <div class="form-group">
            <label class="form-label">Daily Goal Qty</label>
            <input type="number" class="form-input" id="cfg-goal-qty" value="10000">
          </div>
          <div class="form-group">
            <label class="form-label">Daily Goal Value</label>
            <input type="number" class="form-input" id="cfg-goal-value" value="0">
          </div>
          <button class="btn btn-primary" onclick="SettingsPage.saveConfig()" id="cfg-save-btn">Save Configuration</button>
        </div>
      </div>

      <div id="tab-set-users" class="tab-panel">
        <div class="toolbar">
          <div></div>
          <button class="btn btn-primary btn-sm" onclick="SettingsPage.showAddUser()">+ Add User</button>
        </div>
        <div class="card" style="padding:0">
          <div class="table-container" style="border:none">
            <table>
              <thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody id="users-tbody"><tr><td colspan="5"><div class="loading-container"><div class="spinner"></div></div></td></tr></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.loadConfig();
    this.loadUsers();
  },

  switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  },

  async loadConfig() {
    try {
      const config = await API.get('/api/config');
      const app = config.app || {};
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
      setVal('cfg-day-start', app.dayStartHour ?? 3);
      setVal('cfg-goal-qty', app.dailyGoalQty ?? 10000);
      setVal('cfg-goal-value', app.dailyGoalValue ?? 0);
    } catch (err) {
      console.error('Load config error:', err);
    }
  },

  async saveConfig() {
    const btn = document.getElementById('cfg-save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      await API.put('/api/config/app', {
        value: {
          dayStartHour: parseInt(document.getElementById('cfg-day-start').value) || 3,
          dailyGoalQty: parseInt(document.getElementById('cfg-goal-qty').value) || 10000,
          dailyGoalValue: parseInt(document.getElementById('cfg-goal-value').value) || 0,
        }
      });
      App.toast('Configuration saved', 'success');
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Configuration';
    }
  },

  async loadUsers() {
    try {
      this.users = await API.get('/api/users');
      this.renderUsers();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  },

  renderUsers() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    if (this.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><div class="empty-text">No users</div></div></td></tr>';
      return;
    }

    tbody.innerHTML = this.users.map(u => {
      const date = u.created_at ? new Date(u.created_at).toLocaleDateString() : '—';
      return `
        <tr>
          <td>${u.username}</td>
          <td><span class="badge ${u.role === 'admin' ? 'badge-danger' : u.role === 'editor' ? 'badge-warning' : 'badge-info'}">${u.role}</span></td>
          <td>${u.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
          <td>${date}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn-secondary btn-sm" onclick="SettingsPage.showEditUser(${u.id})">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="SettingsPage.deleteUser(${u.id})">✕</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  showAddUser() {
    const body = `
      <div class="form-group"><label class="form-label">Username</label><input class="form-input" id="su-username"></div>
      <div class="form-group"><label class="form-label">PIN</label><input type="password" class="form-input" id="su-pin"></div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-select" id="su-role">
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    `;
    App.showModal('Add User', body, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="SettingsPage.createUser()">Create</button>
    `);
  },

  async createUser() {
    try {
      await API.register(
        document.getElementById('su-username').value,
        document.getElementById('su-pin').value,
        document.getElementById('su-role').value,
      );
      App.closeModal();
      App.toast('User created', 'success');
      this.loadUsers();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  showEditUser(id) {
    const u = this.users.find(x => x.id === id);
    if (!u) return;
    const body = `
      <input type="hidden" id="su-edit-id" value="${u.id}">
      <div class="form-group"><label class="form-label">Username</label><input class="form-input" id="su-edit-username" value="${u.username}"></div>
      <div class="form-group"><label class="form-label">New PIN (leave blank to keep)</label><input type="password" class="form-input" id="su-edit-pin"></div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <select class="form-select" id="su-edit-role">
          ${['viewer','editor','admin'].map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select class="form-select" id="su-edit-active">
          <option value="true" ${u.active ? 'selected' : ''}>Active</option>
          <option value="false" ${!u.active ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
    `;
    App.showModal('Edit User', body, `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="SettingsPage.updateUser()">Save</button>
    `);
  },

  async updateUser() {
    const id = document.getElementById('su-edit-id').value;
    const data = {
      username: document.getElementById('su-edit-username').value,
      role: document.getElementById('su-edit-role').value,
      active: document.getElementById('su-edit-active').value === 'true',
    };
    const pin = document.getElementById('su-edit-pin').value;
    if (pin) data.pin = pin;

    try {
      await API.put(`/api/users/${id}`, data);
      App.closeModal();
      App.toast('User updated', 'success');
      this.loadUsers();
    } catch (err) { App.toast(err.message, 'error'); }
  },

  async deleteUser(id) {
    if (!confirm('Delete this user?')) return;
    try {
      await API.delete(`/api/users/${id}`);
      App.toast('User deleted', 'success');
      this.loadUsers();
    } catch (err) { App.toast(err.message, 'error'); }
  }
};
