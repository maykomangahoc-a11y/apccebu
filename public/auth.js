/**
 * auth.js — Shared authentication utility
 * Include this script on every protected page.
 * 
 * Usage:
 *   <script src="/auth.js"></script>
 *   Then call: AuthGuard.init({ requiredRole: 'supervisor' })
 *   Or:        AuthGuard.init()  // any logged-in user
 */

const AuthGuard = (() => {
    const TOKEN_KEY = 'auth_token';
    const USER_KEY  = 'auth_user';

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function getUser()  {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
    }

    function logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        redirectToLogin();
    }

    function redirectToLogin() {
        const current = window.location.pathname + window.location.search;
        window.location.href = '/login.html?redirect=' + encodeURIComponent(current);
    }

    /**
     * Fetch with auth header automatically attached.
     * Redirects to login on 401.
     */
    async function authFetch(url, options = {}) {
        const token = getToken();
        const headers = { ...(options.headers || {}) };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401) {
            logout();
            throw new Error('Session expired. Please sign in again.');
        }
        if (res.status === 403) {
            const clone = res.clone();
            try {
                const body = await clone.json();
                if (body && body.error && (body.error.toLowerCase().includes('token') || body.error.toLowerCase().includes('expired'))) {
                    logout();
                    throw new Error('Session expired. Please sign in again.');
                }
            } catch (e) {}
            throw new Error('Access denied');
        }
        return res;
    }

    const ROLE_RANK = { visitor: 0, viewer: 1, client: 2, processor: 3, supervisor: 4, admin: 5 };

    function hasRole(required) {
        const user = getUser();
        if (!user) return false;
        return (ROLE_RANK[user.role] || 0) >= (ROLE_RANK[required] || 0);
    }

    /**
     * init({ requiredRole })
     * Call on page load. Validates the token with the server,
     * then optionally enforces a minimum role.
     */
    async function init({ requiredRole = null } = {}) {
        const token = getToken();
        if (!token) { redirectToLogin(); return null; }

        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (res.status === 401 || res.status === 403) { 
                logout(); 
                return null; 
            }
            if (!res.ok) {
                // If 502/503 (server restarting), just return the cached user
                return getUser();
            }

            const { user } = await res.json();
            // Update local cache with fresh server data
            localStorage.setItem(USER_KEY, JSON.stringify(user));

            if (requiredRole && !hasRole(requiredRole)) {
                // Redirect to home with an error flag
                window.location.href = '/?access_denied=1';
                return null;
            }

            // Inject user badge into any element with id="auth-user-badge"
            _renderBadge(user);

            return user;
        } catch (err) {
            // Network error (server down). Return cached user instead of logging out
            console.error('Auth check failed:', err);
            const cached = getUser();
            if (cached) _renderBadge(cached);
            return cached;
        }
    }

    function _renderBadge(user) {
        const badge = document.getElementById('auth-user-badge');
        if (!badge) return;
        const roleColors = { visitor: '#718096', viewer: '#a0aec0', client: '#9f7aea', processor: '#48bb78', supervisor: '#f6ad55', admin: '#fc8181' };
        const color = roleColors[user.role] || '#a0aec0';
        badge.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="text-align:right;">
                    <div style="font-size:13px; font-weight:600; color:var(--text-primary,#fff);">${user.username}</div>
                    <div style="font-size:10px; font-weight:700; color:${color}; text-transform:uppercase; letter-spacing:0.5px;">${user.role}</div>
                </div>
                <div style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.08);
                            display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;
                            color:var(--text-primary,#fff);border:2px solid ${color};">
                    ${user.username.charAt(0).toUpperCase()}
                </div>
                <button id="logout-btn" onclick="AuthGuard.logout()" 
                    style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                           border-radius:6px;color:#a0aec0;font-size:11px;padding:5px 10px;
                           cursor:pointer;font-family:inherit;transition:all 0.2s;"
                    onmouseover="this.style.background='rgba(230,57,70,0.15)';this.style.color='#fc8181';"
                    onmouseout="this.style.background='rgba(255,255,255,0.06)';this.style.color='#a0aec0';">
                    Sign out
                </button>
            </div>
        `;
    }

    return { init, getToken, getUser, hasRole, logout, authFetch };
})();

// Global fetch interceptor for all /api/ requests
const originalFetch = window.fetch;
window.fetch = async function () {
    let [resource, config] = arguments;
    
    // Check if it's an API request
    let url = '';
    if (typeof resource === 'string') {
        url = resource;
    } else if (resource instanceof Request) {
        url = resource.url;
    }

    if (url.includes('/api/')) {
        const token = AuthGuard.getToken();
        if (token) {
            config = config || {};
            config.headers = {
                ...config.headers,
                'Authorization': `Bearer ${token}`
            };
            
            // If resource is a Request object, we need to recreate it with new headers
            if (resource instanceof Request) {
                resource = new Request(resource, config);
            }
        }
        
        try {
            const res = await originalFetch(resource, config);
            if (res.status === 401) {
                AuthGuard.logout();
                throw new Error('Session expired. Please sign in again.');
            }
            if (res.status === 403) {
                const clone = res.clone();
                try {
                    const body = await clone.json();
                    if (body && body.error && (body.error.toLowerCase().includes('token') || body.error.toLowerCase().includes('expired'))) {
                        AuthGuard.logout();
                        throw new Error('Session expired. Please sign in again.');
                    }
                } catch (e) {}
                throw new Error('Access denied');
            }
            return res;
        } catch (error) {
            throw error;
        }
    }
    
    return originalFetch.apply(this, arguments);
};
