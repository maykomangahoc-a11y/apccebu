// ═══════════════════════════════════════════════════════════════════════════
// API Helper — fetch wrapper with JWT, error handling, base URL detection
// ═══════════════════════════════════════════════════════════════════════════

const API = {
  baseUrl: window.location.origin,

  getToken() {
    return localStorage.getItem('auth_token');
  },

  setToken(token) {
    localStorage.setItem('auth_token', token);
  },

  clearToken() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('auth_user'));
    } catch {
      return null;
    }
  },

  setUser(user) {
    localStorage.setItem('auth_user', JSON.stringify(user));
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  async request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const headers = { 'Content-Type': 'application/json' };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (response.status === 401 || response.status === 403) {
        this.clearToken();
        window.location.hash = '#/login';
        throw new Error('Session expired. Please log in again.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      return data;
    } catch (error) {
      if (error.message === 'Failed to fetch') {
        throw new Error('Network error. Server may be offline.');
      }
      throw error;
    }
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  delete(path) { return this.request('DELETE', path); },

  // ─── Auth ───────────────────────────────────────────────────────────────
  async login(username, pin) {
    const data = await this.post('/api/auth/login', { username, pin });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  },

  async register(username, pin, role) {
    const data = await this.post('/api/auth/register', { username, pin, role });
    return data;
  },

  logout() {
    this.clearToken();
    window.location.hash = '#/login';
  }
};
