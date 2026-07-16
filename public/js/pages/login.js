// ═══════════════════════════════════════════════════════════════════════════
// Login Page
// ═══════════════════════════════════════════════════════════════════════════

const LoginPage = {
  render() {
    const container = document.getElementById('login-page');
    container.innerHTML = `
      <div class="login-card">
        <div class="login-brand">
          <div class="login-icon">🏭</div>
          <h1>APC Cebu Warehouse</h1>
          <p>Sign in to your account</p>
        </div>
        <div id="login-error" class="login-error"></div>
        <form id="login-form">
          <div class="form-group">
            <label class="form-label">Username</label>
            <input type="text" id="login-username" class="form-input" placeholder="Enter username" autocomplete="username" required>
          </div>
          <div class="form-group">
            <label class="form-label">PIN</label>
            <input type="password" id="login-pin" class="form-input" placeholder="Enter PIN" autocomplete="current-password" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;padding:0.7rem;margin-top:var(--space-sm);" id="login-submit">
            Sign In
          </button>
        </form>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', this.handleLogin.bind(this));
  },

  async handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const pin = document.getElementById('login-pin').value.trim();
    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');

    if (!username || !pin) {
      errorEl.textContent = 'Please enter both username and PIN';
      errorEl.style.display = 'block';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in...';
    errorEl.style.display = 'none';

    try {
      await API.login(username, pin);
      window.location.hash = '#/dashboard';
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  }
};
