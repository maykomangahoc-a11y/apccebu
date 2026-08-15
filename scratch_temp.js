

    const API_BASE = '/api';

    let dispatchData = [];
    let _checkers = [];

    // ── Combo Select helpers ──────────────────────────────────────
    function buildComboSelect(id, items, placeholder, selectedVal) {
        const listItems = items.map(item => {
            const cls = item === selectedVal ? 'cs-selected' : '';
            const esc = item.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            return `<li class="${cls}" onmousedown="comboPick('${id}','${esc}')">${item}</li>`;
        }).join('');
        return `<div class="combo-select">
            <input type="text" class="combo-select-input" id="${id}-q"
                   placeholder="${placeholder}" value="${selectedVal || ''}"
                   oninput="comboFilter('${id}',this.value)"
                   onfocus="comboOpen('${id}')"
                   onblur="comboClose('${id}')"
                   autocomplete="off">
            <ul class="combo-list" id="${id}-list">${listItems}</ul>
            <input type="hidden" id="${id}" value="${selectedVal || ''}">
        </div>`;
    }
    function comboOpen(id) {
        const list = document.getElementById(id + '-list');
        if (list) list.classList.add('open');
    }
    function comboClose(id) {
        setTimeout(() => {
            const list = document.getElementById(id + '-list');
            if (list) list.classList.remove('open');
        }, 150);
    }
    function comboFilter(id, q) {
        const list = document.getElementById(id + '-list');
        if (!list) return;
        list.classList.add('open');
        const lower = q.toLowerCase();
        list.querySelectorAll('li').forEach(li => {
            li.classList.toggle('cs-hidden', !li.textContent.toLowerCase().includes(lower));
        });
    }
    function comboPick(id, val) {
        const hidden = document.getElementById(id);
        if (hidden) hidden.value = val;
        const inp = document.getElementById(id + '-q');
        if (inp) inp.value = val;
        const list = document.getElementById(id + '-list');
        if (list) {
            list.classList.remove('open');
            list.querySelectorAll('li').forEach(li => {
                li.classList.toggle('cs-selected', li.textContent.trim() === val);
                li.classList.remove('cs-hidden');
            });
        }
    }
    let _pickedQtyMap = {};      // orderId → total pickerQty (for display)
    let _pickCompletedMap = {};  // orderId → total completed pickerQty
    let _pickOngoingMap = {};    // orderId → total in-progress pickerQty
    let currentUser = null;
    let _expandedCheckingId = null;
    let _expandedInProgressId = null;
    let _expandedLoadingId = null;
        _expandedDispatchingId = null;
    let _completedView = 'linechecking';

    const ACTIVE_PLAN_STATUSES = ["pending plan", "today's plan", "additional plan"];

    const PLAN_STATUS_MAP = {
        "pending plan":    { cls: 'ps-pending',    label: 'Pending Plan' },
        "today's plan":    { cls: 'ps-today',      label: "Today's Plan" },
        "additional plan": { cls: 'ps-additional', label: 'Additional Plan' },
        "tomorrow's plan": { cls: 'ps-tomorrow',   label: "Tomorrow's Plan" },
        "upcoming plan":   { cls: 'ps-upcoming',   label: 'Upcoming Plan' },
        "unconfirmed plan":{ cls: 'ps-unconfirmed',label: 'Unconfirmed Plan' },
        "grand advance":   { cls: 'ps-grand',      label: 'Grand Advance' },
    };

    const ORDER_STATUS_COLORS = {
        'In progress picking': '#a8c4d4',
        'Picking Completed':   '#00b4d8',
        'Ready to Dispatch':   '#f4a261',
        'Loading in progress': '#f9e03a',
        'Loaded ready for dispatch': '#57cc99',
        'dispatched':          '#48bb78',
        'Checking':            '#ffb4a2',
    };

    function filterActiveOrders() {
        return dispatchData.filter(item => {
            const orderStatus = (item.orderStatus || '').toLowerCase().trim();
            const archStatus  = (item.archiveStatus || '').toLowerCase().trim();
            return (
                orderStatus !== 'dispatched' &&
                archStatus  !== 'archive order' &&
                archStatus  !== 'archived'
            );
        });
    }

    function getPickingStatus(orderId, qty) {
        const completed = _pickCompletedMap[orderId] || 0;
        const ongoing   = _pickOngoingMap[orderId]   || 0;
        const orderQty  = parseInt(qty) || 0;
        if (orderQty > 0 && completed >= orderQty) return 'completed';
        if (ongoing > 0 || completed > 0) return 'ongoing';
        return 'pending';
    }

    function buildPickingBadge(orderId, qty) {
        const ps = getPickingStatus(orderId, qty);
        if (ps === 'completed') return '<span class="pick-badge pick-completed">Completed</span>';
        if (ps === 'ongoing')   return '<span class="pick-badge pick-ongoing">In Progress</span>';
        return '';
    }

    function applySearch(orders, query) {
        if (!query) return orders;
        const q = query.toLowerCase();
        return orders.filter(o =>
            (o.partyCode   || '').toLowerCase().includes(q) ||
            (o.accountName || '').toLowerCase().includes(q) ||
            (o.fo          || '').toLowerCase().includes(q)
        );
    }

    function buildPlanBadge(status) {
        if (!status) return '<span style="color:rgba(255,255,255,0.2);font-size:11px;">—</span>';
        const key = (status || '').toLowerCase().trim();
        const m = PLAN_STATUS_MAP[key];
        return `<span class="ps-badge ${m ? m.cls : ''}">${m ? m.label : status}</span>`;
    }

    function buildOrderStatusDot(status) {
        if (!status) return '<span style="color:rgba(255,255,255,0.2);font-size:11px;">—</span>';
        const color = ORDER_STATUS_COLORS[status] || 'rgba(255,255,255,0.3)';
        return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;">
            <span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>
            ${status}
        </span>`;
    }

    function safeId(id) { return (id || '').replace(/[^a-zA-Z0-9]/g, '_'); }

    function buildFoBadges(fo) {
        if (!fo) return '<span style="color:rgba(255,255,255,0.2);font-size:11px;">—</span>';
        const fos = String(fo).split(',').map(f => f.trim()).filter(f => f);
        return `<div class="fo-container">${fos.map(f => `<span class="fo-badge-pill">${f}</span>`).join('')}</div>`;
    }

    function formatTS(ts) {
        if (!ts) return '—';
        return ts;
    }

    function isToday(ts) {
        if (!ts) return false;
        const d = new Date(ts);
        if (isNaN(d.getTime())) return false;
        const now = new Date();
        return d.getDate() === now.getDate() &&
               d.getMonth() === now.getMonth() &&
               d.getFullYear() === now.getFullYear();
    }

    // ── CHECKING TAB ──────────────────────────────────────────────

    function renderChecking() {
        const search = document.getElementById('checking-search')?.value || '';
        const canAct = currentUser && ['admin', 'supervisor', 'processor'].includes(currentUser.role);
        // Only orders with NO linechecker assigned yet, and picking is ongoing or completed
        const orders = applySearch(
            filterActiveOrders().filter(o => {
                if ((o.linechecker || '').trim()) return false;
                const ps = getPickingStatus(o.id, o.qty);
                return ps === 'completed' || ps === 'ongoing';
            }),
            search
        );

        document.getElementById('count-checking').textContent = orders.length;

        if (!orders.length) {
            document.getElementById('checking-table').innerHTML =
                '<div class="empty-state"><div class="empty-icon">✅</div>All active orders have checkers assigned</div>';
            return;
        }

        const colSpan = canAct ? 7 : 6;
        const rows = orders.map(o => {
            const sid = safeId(o.id);
            const isExpanded = _expandedCheckingId === o.id;
            const pickedQty  = _pickedQtyMap[o.id] || 0;

            let actionCell = '';
            if (canAct) {
                if (isExpanded) {
                    actionCell = `<td style="text-align:center;"><button class="btn-action" style="background:rgba(255,255,255,0.08);color:var(--text-secondary);" onclick="cancelCheckingExpand()">✕ Cancel</button></td>`;
                } else {
                    actionCell = `<td style="text-align:center;"><button class="btn-action" onclick="expandChecking('${o.id}')">✅ Assign</button></td>`;
                }
            }

            const expandRow = (canAct && isExpanded) ? `
            <tr class="expand-row" id="er-c-${sid}">
                <td colspan="${colSpan}">
                    <div class="expand-inner">
                        <div class="expand-field" style="flex:1;min-width:220px;">
                            <label>Checker</label>
                            ${buildComboSelect(`checker-sel-${sid}`, _checkers.map(c => `${c.code} - ${c.name}`), '— Select Checker —', '')}
                        </div>
                        <div class="expand-field">
                            <label>Checked QTY</label>
                            <input type="number" id="checker-qty-${sid}"
                                value="${o.qty || ''}" min="0" placeholder="Qty">
                        </div>
                        <div class="expand-actions">
                            <button class="btn-expand-save" id="save-c-${sid}"
                                onclick="submitChecking('${o.id}','${sid}')">▶ Save</button>
                            <button class="btn-expand-cancel" onclick="cancelCheckingExpand()">✕ Cancel</button>
                        </div>
                    </div>
                </td>
            </tr>` : '';

            const rowStyle = isExpanded ? 'background:rgba(230,57,70,0.05);' : '';
            return `<tr style="${rowStyle}">
                <td>${buildFoBadges(o.fo)}</td>
                <td style="font-weight:600;white-space:nowrap;">${o.accountName || o.partyCode || '—'}</td>
                <td style="font-size:12px;color:var(--text-secondary);">${o.type || '—'}</td>
                <td style="text-align:center;font-weight:700;">${o.qty !== '' && o.qty !== undefined ? o.qty : '—'}</td>
                <td style="text-align:center;font-weight:700;color:var(--onesource-red);">${pickedQty || '—'}</td>
                <td style="text-align:center;">${buildPickingBadge(o.id, o.qty)}</td>
                ${actionCell}
            </tr>${expandRow}`;
        }).join('');

        const actionHeader = canAct ? '<th style="width:110px;text-align:center;">ACTION</th>' : '';
        document.getElementById('checking-table').innerHTML = `
            <table>
                <thead><tr>
                    <th style="width:200px;">FO#</th>
                    <th>ACCOUNT NAME</th>
                    <th style="width:120px;">TYPE</th>
                    <th style="width:90px;text-align:center;">ORDER QTY</th>
                    <th style="width:90px;text-align:center;">PICKED QTY</th>
                    <th style="width:110px;text-align:center;">PICKING STATUS</th>
                    ${actionHeader}
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function expandChecking(id) {
        _expandedCheckingId = _expandedCheckingId === id ? null : id;
        renderChecking();
    }

    function cancelCheckingExpand() {
        _expandedCheckingId = null;
        renderChecking();
    }

    // ── IN PROGRESS TAB ───────────────────────────────────────────

    function renderInProgress() {
        const search = document.getElementById('inprogress-search')?.value || '';
        const canAct = currentUser && ['admin', 'supervisor', 'processor'].includes(currentUser.role);
        // Orders WITH linechecker, WITHOUT endLineCheck (actively being checked)
        const orders = applySearch(
            filterActiveOrders().filter(o => (o.linechecker || '').trim() && !(o.endLineCheck || '').trim()),
            search
        );

        document.getElementById('count-inprogress').textContent = orders.length;

        if (!orders.length) {
            document.getElementById('inprogress-table').innerHTML =
                '<div class="empty-state"><div class="empty-icon">🔄</div>No orders in progress</div>';
            return;
        }

        const colSpan = canAct ? 8 : 7;
        const rows = orders.map(o => {
            const sid = safeId(o.id);
            const isExpanded = _expandedInProgressId === o.id;
            const pickedQty  = _pickedQtyMap[o.id] || 0;

            const checkerCell = `<span class="person-badge">${o.linechecker}</span>
                ${o.startLineCheck ? `<div style="font-size:10px;color:var(--onesource-red);margin-top:3px;">▶ ${o.startLineCheck}</div>` : ''}`;

            let actionCell = '';
            if (canAct) {
                if (isExpanded) {
                    actionCell = `<td style="text-align:center;"><button class="btn-action" style="background:rgba(255,255,255,0.08);color:var(--text-secondary);" onclick="cancelInProgressExpand()">✕ Cancel</button></td>`;
                } else {
                    actionCell = `<td style="text-align:center;"><button class="btn-action btn-action-update" onclick="expandInProgress('${o.id}')">Finish (Checking)</button></td>`;
                }
            }

            const expandRow = (canAct && isExpanded) ? `
            <tr class="expand-row" id="er-ip-${sid}">
                <td colspan="${colSpan}">
                    <div class="expand-inner">
                        <div class="expand-field" style="flex:1;min-width:220px;">
                            <label>Checker</label>
                            ${buildComboSelect(`ip-checker-sel-${sid}`, _checkers.map(c => `${c.code} - ${c.name}`), '— Select Checker —', o.linechecker || '')}
                        </div>
                        <div class="expand-field">
                            <label>Checked QTY</label>
                            <input type="number" id="ip-checker-qty-${sid}"
                                value="${o.checkedQty || o.qty || ''}" min="0" placeholder="Qty">
                        </div>
                        <div class="expand-actions">
                            <button class="btn-expand-save" id="save-ip-${sid}"
                                onclick="submitInProgress('${o.id}','${sid}')">▶ Save</button>
                            <button class="btn-expand-cancel" onclick="cancelInProgressExpand()">✕ Cancel</button>
                        </div>
                    </div>
                </td>
            </tr>` : '';

            const rowStyle = isExpanded ? 'background:rgba(230,57,70,0.05);' : '';
            return `<tr style="${rowStyle}">
                <td>${buildFoBadges(o.fo)}</td>
                <td style="font-weight:600;white-space:nowrap;">${o.accountName || o.partyCode || '—'}</td>
                <td style="font-size:12px;color:var(--text-secondary);">${o.type || '—'}</td>
                <td style="text-align:center;font-weight:700;">${o.qty !== '' && o.qty !== undefined ? o.qty : '—'}</td>
                <td style="text-align:center;font-weight:700;color:var(--onesource-red);">${pickedQty || '—'}</td>
                <td style="cursor:pointer;" onclick="startInlineEdit(this, '${o.id}', 'linechecker', 'select-checker', event)" title="Click to edit Checker">${checkerCell}</td>
                <td style="text-align:center;font-weight:700;color:var(--onesource-red);">${o.checkedQty || '—'}</td>
                ${actionCell}
            </tr>${expandRow}`;
        }).join('');

        const actionHeader = canAct ? '<th style="width:110px;text-align:center;">ACTION</th>' : '';
        document.getElementById('inprogress-table').innerHTML = `
            <table>
                <thead><tr>
                    <th style="width:200px;">FO#</th>
                    <th>ACCOUNT NAME</th>
                    <th style="width:120px;">TYPE</th>
                    <th style="width:90px;text-align:center;">ORDER QTY</th>
                    <th style="width:90px;text-align:center;">PICKED QTY</th>
                    <th style="width:185px;">LINECHECKER</th>
                    <th style="width:110px;text-align:center;">CHECKED QTY</th>
                    ${actionHeader}
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function expandInProgress(id) {
        _expandedInProgressId = _expandedInProgressId === id ? null : id;
        renderInProgress();
    }

    function cancelInProgressExpand() {
        _expandedInProgressId = null;
        renderInProgress();
    }

    async function submitInProgress(id, sid) {
        const o       = dispatchData.find(x => x.id === id);
        const checker = document.getElementById(`ip-checker-sel-${sid}`)?.value?.trim();
        const qty     = document.getElementById(`ip-checker-qty-${sid}`)?.value?.trim();

        if (!checker) { alert('Please select a checker.'); return; }

        const btn = document.getElementById(`save-ip-${sid}`);
        if (btn) btn.disabled = true;

        try {
            const r1 = await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'linechecker', value: checker })
            });
            if (!r1.ok) {
                const e = await r1.json().catch(() => ({}));
                alert(e.error || 'Failed to save checker.');
                if (btn) btn.disabled = false;
                return;
            }

            if (qty !== '') {
                await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ field: 'checkedQty', value: qty })
                });
            }

            const endTs = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
            await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'endLineCheck', value: endTs })
            });

            await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'orderStatus', value: 'Ready to Dispatch' })
            });

            AuthGuard.authFetch(`${API_BASE}/dispatch-plan/check-log`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id, fo: o?.fo || '', partyCode: o?.partyCode || '',
                    accountName: o?.accountName || '', qty: o?.qty || '',
                    checker, checkedQty: qty || ''
                })
            }).catch(e => console.warn('check-log failed:', e));

            _expandedInProgressId = null;
            await loadData();
        } catch (err) {
            alert('Error: ' + err.message);
            if (btn) btn.disabled = false;
        }
    }

    async function submitChecking(id, sid) {
        const o       = dispatchData.find(x => x.id === id);
        const checker = document.getElementById(`checker-sel-${sid}`)?.value?.trim();
        const qty     = document.getElementById(`checker-qty-${sid}`)?.value?.trim();

        if (!checker) { alert('Please select a checker.'); return; }

        const btn = document.getElementById(`save-c-${sid}`);
        if (btn) btn.disabled = true;

        try {
            const r1 = await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'linechecker', value: checker })
            });
            if (!r1.ok) {
                const e = await r1.json().catch(() => ({}));
                alert(e.error || 'Failed to save checker.');
                if (btn) btn.disabled = false;
                return;
            }

            if (qty !== '') {
                const r2 = await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ field: 'checkedQty', value: qty })
                });
                if (!r2.ok) console.warn('checkedQty save failed');
            }

            // Set startLineCheck only on first assignment
            if (!(o?.startLineCheck || '').trim()) {
                const startTs = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
                await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ field: 'startLineCheck', value: startTs })
                });
                await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ field: 'orderStatus', value: 'Checking' })
                });
            }

            // Log to Checking Data sheet
            AuthGuard.authFetch(`${API_BASE}/dispatch-plan/check-log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    fo:          o?.fo          || '',
                    partyCode:   o?.partyCode   || '',
                    accountName: o?.accountName || '',
                    qty:         o?.qty         || '',
                    checker,
                    checkedQty: qty || ''
                })
            }).catch(e => console.warn('check-log failed:', e));

            _expandedCheckingId = null;
            await loadData();
        } catch (err) {
            alert('Error: ' + err.message);
            if (btn) btn.disabled = false;
        }
    }

    // ── DISPATCHING TAB ──────────────────────────────────────────

    function renderDispatching() {
        const search  = document.getElementById('dispatching-search')?.value || '';
        const canAct  = currentUser && ['admin', 'supervisor', 'processor'].includes(currentUser.role);
        const orders  = applySearch(
            filterActiveOrders().filter(o => {
                const ps = getPickingStatus(o.id, o.qty);
                const isPicked = ps === 'completed';
                const isChecked = (o.endLineCheck || '').trim();
                const isDispatched = (o.orderStatus || '').toLowerCase() === 'dispatched';
                return isPicked && isChecked && !isDispatched;
            }),
            search
        );

        document.getElementById('count-dispatching').textContent = orders.length;

        if (!orders.length) {
            document.getElementById('dispatching-table').innerHTML =
                '<div class="empty-state"><div class="empty-icon">🚚</div>No active orders found</div>';
            return;
        }

        const rows = orders.map(o => {
            const sid = safeId(o.id);
            const isExpanded = _expandedDispatchingId === o.id;
            const hasDispatcher = (o.dispatcher || '').trim();
            const hasLoadingEnd = (o.loadingEnd || '').trim();

            const dispCell = hasDispatcher
                ? `<span class="person-badge person-badge-dispatch">${o.dispatcher}</span>
                   ${o.dispatcher_TS ? `<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">${formatTS(o.dispatcher_TS)}</div>` : ''}`
                : `<span style="color:rgba(255,255,255,0.2);font-size:11px;">—</span>`;

            let actionCell = '';
            if (canAct) {
                if (isExpanded) {
                    actionCell = `<td style="text-align:center;"><button class="btn-action btn-action-dispatch" style="background:rgba(255,255,255,0.08);color:var(--text-secondary);" onclick="cancelDispatchingExpand()">✕ Cancel</button></td>`;
                } else {
                    if (!hasDispatcher) {
                        actionCell = `<td style="text-align:center;"><button class="btn-action btn-action-update" style="background:var(--accent-orange);color:#fff;" onclick="expandDispatching('${o.id}')">🏗️ Start Loading</button></td>`;
                    } else if (hasDispatcher && !hasLoadingEnd) {
                        actionCell = `<td style="text-align:center;"><button class="btn-action" style="opacity:0.5;cursor:not-allowed;" disabled>⏳ Loading...</button></td>`;
                    } else if (hasLoadingEnd) {
                        actionCell = `<td style="text-align:center;"><button class="btn-action btn-action-dispatch" onclick="submitDispatching('${o.id}')">🚚 Dispatch</button></td>`;
                    }
                }
            }

            const expandRow = (canAct && isExpanded && !hasDispatcher) ? `
            <tr class="expand-row expand-row-dispatch" id="er-d-${sid}">
                <td colspan="10">
                    <div class="expand-inner">
                        <div class="expand-field" style="flex:1;min-width:220px;">
                            <label>Dispatcher</label>
                            ${buildComboSelect(`dispatcher-sel-${sid}`, _checkers.map(c => `${c.code} - ${c.name}`), '— Select Dispatcher —', o.dispatcher || '')}
                        </div>
                        <div class="expand-field">
                            <label>QTY</label>
                            <div class="expand-qty-display">${o.qty !== '' && o.qty !== undefined ? o.qty : '—'}</div>
                        </div>
                        <div class="expand-actions">
                            <button class="btn-expand-save" id="save-d-${sid}"
                                onclick="submitStartLoading('${o.id}','${sid}')">▶ Save</button>
                            <button class="btn-expand-cancel" onclick="cancelDispatchingExpand()">✕ Cancel</button>
                        </div>
                    </div>
                </td>
            </tr>` : '';

            const checkerBadge = (o.linechecker || '').trim()
                ? `<span class="person-badge">${o.linechecker}</span>
                   ${o.startLineCheck ? `<div style="font-size:10px;color:var(--onesource-red);margin-top:3px;">▶ ${o.startLineCheck}</div>` : ''}`
                : `<span style="color:rgba(255,255,255,0.2);font-size:11px;">—</span>`;

            const rowStyle = isExpanded ? 'background:rgba(230,57,70,0.05);' : '';
            return `<tr style="${rowStyle}">
                <td>${buildFoBadges(o.fo)}</td>
                <td style="font-weight:600;white-space:nowrap;">${o.accountName || o.partyCode || '—'}</td>
                <td style="text-align:center;font-weight:700;">${o.qty !== '' && o.qty !== undefined ? o.qty : '—'}</td>
                <td style="text-align:center;font-size:12px;">${o.cbm || '—'}</td>
                <td style="text-align:center;font-size:12px;">${o.weight || '—'}</td>
                <td>${buildPlanBadge(o.status)}</td>
                <td style="text-align:center;">${buildPickingBadge(o.id, o.qty)}</td>
                <td>${buildOrderStatusDot(o.orderStatus)}</td>
                <td style="cursor:pointer;" onclick="startInlineEdit(this, '${o.id}', 'linechecker', 'select-checker', event)" title="Click to edit Checker">${checkerBadge}</td>
                <td style="cursor:pointer;" onclick="startInlineEdit(this, '${o.id}', 'dispatcher', 'select-dispatcher', event)" title="Click to edit Dispatcher">${dispCell}</td>
                ${actionCell}
            </tr>${expandRow}`;
        }).join('');

        const actionHeader = canAct ? '<th style="width:130px;text-align:center;">ACTION</th>' : '';
        document.getElementById('dispatching-table').innerHTML = `
            <table>
                <thead><tr>
                    <th style="width:200px;">FO#</th>
                    <th>ACCOUNT NAME</th>
                    <th style="width:75px;text-align:center;">QTY</th>
                    <th style="width:75px;text-align:center;">CBM</th>
                    <th style="width:80px;text-align:center;">WEIGHT</th>
                    <th style="width:140px;">PLAN STATUS</th>
                    <th style="width:120px;text-align:center;">PICKING STATUS</th>
                    <th style="width:175px;">ORDER STATUS</th>
                    <th style="width:175px;">LINECHECKER</th>
                    <th style="width:185px;">DISPATCHER</th>
                    ${actionHeader}
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    function expandDispatching(id) {
        _expandedDispatchingId = _expandedDispatchingId === id ? null : id;
        renderDispatching();
    }

    function cancelDispatchingExpand() {
        _expandedLoadingId = null;
        _expandedDispatchingId = null;
        renderDispatching();
    }

    async function submitStartLoading(id, sid) {
        const o          = dispatchData.find(x => x.id === id);
        const dispatcher = document.getElementById(`dispatcher-sel-${sid}`)?.value?.trim();
        if (!dispatcher) { alert('Please select a dispatcher.'); return; }

        const btn = document.getElementById(`save-d-${sid}`);
        if (btn) btn.disabled = true;

        try {
            const r = await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'dispatcher', value: dispatcher })
            });
            if (!r.ok) {
                const e = await r.json().catch(() => ({}));
                alert(e.error || 'Failed to save dispatcher.');
                if (btn) btn.disabled = false;
                return;
            }

            await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'orderStatus', value: 'Loading in progress' })
            });
            
            await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'startLoading', value: new Date().toISOString() })
            });

            // Log to Dispatching Data sheet
            AuthGuard.authFetch(`${API_BASE}/dispatch-plan/dispatch-log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    fo:          o?.fo          || '',
                    partyCode:   o?.partyCode   || '',
                    accountName: o?.accountName || '',
                    qty:         o?.qty         || '',
                    dispatcher
                })
            }).catch(e => console.warn('dispatch-log failed:', e));

            _expandedDispatchingId = null;
            await loadData();
        } catch (err) {
            alert('Error: ' + err.message);
            if (btn) btn.disabled = false;
        }
    }

    async function submitDispatching(id) {
        const o = dispatchData.find(x => x.id === id);
        try {
            await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'orderStatus', value: 'Dispatched' })
            });
            await loadData();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }

    // ── LOADING TAB ──────────────────────────────────────────────
    
    function renderLoading() {
        const search  = document.getElementById('loading-search')?.value || '';
        const canAct  = currentUser && ['admin', 'supervisor', 'processor'].includes(currentUser.role);
        const orders  = applySearch(
            filterActiveOrders().filter(o => {
                const ps = getPickingStatus(o.id, o.qty);
                const isPicked = ps === 'completed';
                const hasDispatcher = (o.dispatcher || '').trim();
                const isLoaded = (o.loadingEnd || '').trim();
                return isPicked && hasDispatcher && !isLoaded;
            }),
            search
        );

        document.getElementById('count-loading').textContent = orders.length;

        if (!orders.length) {
            document.getElementById('loading-table').innerHTML =
                '<div class="empty-state"><div class="empty-icon">🏗️</div>No loading in progress found</div>';
            return;
        }

        const rows = orders.map(o => {
            const hasDispatcher = (o.dispatcher || '').trim();

            const dispCell = hasDispatcher
                ? `<span class="person-badge person-badge-dispatch">${o.dispatcher}</span>
                   ${o.dispatcher_TS ? `<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">${formatTS(o.dispatcher_TS)}</div>` : ''}`
                : `<span style="color:rgba(255,255,255,0.2);font-size:11px;">—</span>`;

            let actionCell = '';
            if (canAct) {
                actionCell = `<td style="text-align:center;"><button class="btn-action btn-action-update" onclick="submitFinishLoading('${o.id}')">🏁 Finish Loading</button></td>`;
            }

            const checkerBadge = (o.linechecker || '').trim()
                ? `<span class="person-badge">${o.linechecker}</span>
                   ${o.startLineCheck ? `<div style="font-size:10px;color:var(--onesource-red);margin-top:3px;">▶ ${o.startLineCheck}</div>` : ''}`
                : `<span style="color:rgba(255,255,255,0.2);font-size:11px;">—</span>`;

            return `<tr>
                <td>${buildFoBadges(o.fo)}</td>
                <td style="font-weight:600;white-space:nowrap;">${o.accountName || o.partyCode || '—'}</td>
                <td style="text-align:center;font-weight:700;">${o.qty !== '' && o.qty !== undefined ? o.qty : '—'}</td>
                <td style="text-align:center;font-size:12px;">${o.cbm || '—'}</td>
                <td style="text-align:center;font-size:12px;">${o.weight || '—'}</td>
                <td>${buildPlanBadge(o.status)}</td>
                <td style="text-align:center;">${buildPickingBadge(o.id, o.qty)}</td>
                <td>${buildOrderStatusDot(o.orderStatus)}</td>
                <td style="cursor:pointer;" onclick="startInlineEdit(this, '${o.id}', 'linechecker', 'select-checker', event)" title="Click to edit Checker">${checkerBadge}</td>
                <td style="cursor:pointer;" onclick="startInlineEdit(this, '${o.id}', 'dispatcher', 'select-dispatcher', event)" title="Click to edit Dispatcher">${dispCell}</td>
                ${actionCell}
            </tr>`;
        }).join('');

        const actionHeader = canAct ? '<th style="width:140px;text-align:center;">ACTION</th>' : '';
        document.getElementById('loading-table').innerHTML = `
            <table>
                <thead><tr>
                    <th style="width:200px;">FO#</th>
                    <th>ACCOUNT NAME</th>
                    <th style="width:75px;text-align:center;">QTY</th>
                    <th style="width:75px;text-align:center;">CBM</th>
                    <th style="width:80px;text-align:center;">WEIGHT</th>
                    <th style="width:140px;">PLAN STATUS</th>
                    <th style="width:120px;text-align:center;">PICKING STATUS</th>
                    <th style="width:175px;">ORDER STATUS</th>
                    <th style="width:175px;">LINECHECKER</th>
                    <th style="width:185px;">DISPATCHER</th>
                    ${actionHeader}
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    async function submitFinishLoading(id) {
        try {
            await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'orderStatus', value: 'Loaded ready for dispatch' })
            });
            
            await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field: 'loadingEnd', value: new Date().toISOString() })
            });

            await loadData();
        } catch (err) {
            alert('Error: ' + err.message);
        }
    }


    // ── COMPLETED TAB ─────────────────────────────────────────────

    function setCompletedView(view) {
        _completedView = view;
        document.getElementById('toggle-linechecking').classList.toggle('active', view === 'linechecking');
        document.getElementById('toggle-linechecking').classList.toggle('red', view === 'linechecking');
        document.getElementById('toggle-dispatching').classList.toggle('active', view === 'dispatching');
        document.getElementById('toggle-dispatching').classList.toggle('red', view === 'dispatching');
        renderCompleted();
    }

    function renderCompleted() {
        const search = document.getElementById('completed-search')?.value || '';
        const isLC   = _completedView === 'linechecking';

        let orders = dispatchData.filter(o => {
            if (isLC) {
                return (o.linechecker || '').trim() && isToday(o.startLineCheck);
            } else {
                return (o.loadingEnd || '').trim() && isToday(o.loadingEnd);
            }
        });
        orders = applySearch(orders, search);

        document.getElementById('count-completed').textContent = orders.length;

        if (!orders.length) {
            const msg = isLC ? 'No line-checked orders found' : 'No orders with dispatcher assigned';
            document.getElementById('completed-table').innerHTML =
                `<div class="empty-state"><div class="empty-icon">📦</div>${msg}</div>`;
            return;
        }

        const rows = orders.map(o => {
            const person  = isLC ? (o.linechecker || '—')     : (o.dispatcher || '—');
            const ts      = isLC ? (o.linechecker_TS || '')    : (o.dispatcher_TS || '');
            const byUser  = isLC ? (o.linechecker_User || '')  : (o.dispatcher_User || '');
            const personClass = isLC ? '' : 'person-badge-dispatch';

            const checkedQtyCell = isLC
                ? `<td style="text-align:center;font-weight:700;color:var(--onesource-red);">${o.checkedQty || '—'}</td>`
                : '';

            return `<tr>
                <td>${buildFoBadges(o.fo)}</td>
                <td style="font-weight:600;white-space:nowrap;">${o.accountName || o.partyCode || '—'}</td>
                <td style="text-align:center;font-weight:700;">${o.qty !== '' && o.qty !== undefined ? o.qty : '—'}</td>
                ${checkedQtyCell}
                <td>${buildPlanBadge(o.status)}</td>
                <td>${buildOrderStatusDot(o.orderStatus)}</td>
                <td style="cursor:pointer;" onclick="startInlineEdit(this, '${o.id}', '${isLC ? 'linechecker' : 'dispatcher'}', '${isLC ? 'select-checker' : 'select-dispatcher'}', event)" title="Click to edit ${isLC ? 'Linechecker' : 'Dispatcher'}">
                    <span class="person-badge ${personClass}">${person}</span>
                    ${byUser ? `<div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">by ${byUser}</div>` : ''}
                </td>
                <td style="font-size:11px;color:var(--text-secondary);">${formatTS(ts)}</td>
            </tr>`;
        }).join('');

        const checkedQtyHeader = isLC
            ? '<th style="width:110px;text-align:center;">CHECKED QTY</th>' : '';
        const personLabel = isLC ? 'LINECHECKER' : 'DISPATCHER';

        document.getElementById('completed-table').innerHTML = `
            <table>
                <thead><tr>
                    <th style="width:200px;">FO#</th>
                    <th>ACCOUNT NAME</th>
                    <th style="width:80px;text-align:center;">ORDER QTY</th>
                    ${checkedQtyHeader}
                    <th style="width:140px;">PLAN STATUS</th>
                    <th style="width:175px;">ORDER STATUS</th>
                    <th style="width:185px;">${personLabel}</th>
                    <th style="width:170px;">ASSIGNED AT</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    // ── TABS ──────────────────────────────────────────────────────

    function switchTab(tab) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');
        document.querySelector(`.tab-button[data-tab="${tab}"]`).classList.add('active');

        // cancel any open expand rows when switching tabs
        _expandedCheckingId = null;
        _expandedInProgressId = null;
        _expandedLoadingId = null;
        _expandedDispatchingId = null;
    }

    // ── DATA LOADING ──────────────────────────────────────────────

    async function loadData() {
        try {
            const [ordersRes, checkersRes, pickingRes] = await Promise.all([
                AuthGuard.authFetch(`${API_BASE}/dispatch-plan`),
                AuthGuard.authFetch(`${API_BASE}/checkers`),
                AuthGuard.authFetch(`${API_BASE}/picking-orders`)
            ]);

            if (ordersRes.ok)  dispatchData = await ordersRes.json();
            if (checkersRes.ok) _checkers   = await checkersRes.json();
            if (pickingRes.ok) {
                const picks = await pickingRes.json();
                _pickedQtyMap = {};
                _pickCompletedMap = {};
                _pickOngoingMap = {};
                picks.forEach(p => {
                    if (p.orderId) {
                        _pickedQtyMap[p.orderId] = (_pickedQtyMap[p.orderId] || 0) + (p.pickerQty || 0);
                        if (p.status === 'completed') {
                            _pickCompletedMap[p.orderId] = (_pickCompletedMap[p.orderId] || 0) + (p.pickerQty || 0);
                        } else {
                            _pickOngoingMap[p.orderId] = (_pickOngoingMap[p.orderId] || 0) + (p.pickerQty || 0);
                        }
                    }
                });
            }

            const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            document.getElementById('sync-text').textContent = 'Updated ' + now;

            renderChecking();
            renderInProgress();
            renderDispatching();
            renderLoading();
            renderCompleted();
        } catch (err) {
            console.error(err);
            document.getElementById('sync-text').textContent = 'Error loading data';
        }
    }

    // Initialize
    AuthGuard.init({ requiredRole: 'viewer' }).then(user => {
        currentUser = user;
        loadData();
    });

    // ── INLINE EDIT ──────────────────────────────────────────────
    let activeInlineEdit = null;
    let inlineEditSuppressBlur = false;

    function cancelInlineEdit() {
        if (activeInlineEdit) {
            activeInlineEdit.cellEl.innerHTML = activeInlineEdit.restoreHTML;
            activeInlineEdit = null;
        }
    }

    function startInlineEdit(cellEl, orderId, field, type, event) {
        if (event) event.stopPropagation();
        if (activeInlineEdit && activeInlineEdit.cellEl === cellEl) return;
        if (!currentUser || !['admin', 'supervisor', 'processor'].includes(currentUser.role)) return;

        cancelInlineEdit();

        const item = dispatchData.find(o => String(o.id) === String(orderId));
        if (!item) return;

        const rawValue = (item[field] || '').trim();
        activeInlineEdit = { cellEl, restoreHTML: cellEl.innerHTML };

        const inputStyle = 'width: 100%; padding: 4px 6px; background: #0f172a; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; color: white; font-size: 12px;';
        let inputHTML = '';

        if (type === 'select-checker' || type === 'select-dispatcher') {
            const options = _checkers.map(c => {
                const val = `${c.code} - ${c.name}`;
                return `<option value="${val}" ${rawValue === val ? 'selected' : ''}>${val}</option>`;
            }).join('');
            inputHTML = `<select class="inline-edit-input" style="${inputStyle}"><option value="">- Select -</option>${options}</select>`;
        } else {
            inputHTML = `<input type="text" class="inline-edit-input" value="${rawValue.replace(/"/g, '&quot;')}" style="${inputStyle}">`;
        }

        cellEl.innerHTML = inputHTML;
        const inputEl = cellEl.querySelector('.inline-edit-input');
        inputEl.addEventListener('click', e => e.stopPropagation());
        inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                inputEl.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                inlineEditSuppressBlur = true;
                cancelInlineEdit();
            }
        });

        if (type.startsWith('select')) {
            inputEl.addEventListener('change', () => inputEl.blur());
        }

        inputEl.addEventListener('blur', () => {
            if (inlineEditSuppressBlur) {
                inlineEditSuppressBlur = false;
                return;
            }
            commitInlineEdit(orderId, field, type, cellEl);
        });

        inputEl.focus();
    }

    async function commitInlineEdit(orderId, field, type, cellEl) {
        if (!activeInlineEdit || activeInlineEdit.cellEl !== cellEl) return;
        const inputEl = cellEl.querySelector('.inline-edit-input');
        if (!inputEl) return;

        let value = inputEl.value.trim();
        const restoreHTML = activeInlineEdit.restoreHTML;
        activeInlineEdit = null;
        cellEl.style.opacity = '0.5';

        try {
            const res = await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${orderId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field, value })
            });

            if (res.ok) {
                if (field === 'dispatcher' && value) {
                    await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${orderId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ field: 'orderStatus', value: 'Loading in progress' })
                    });
                } else if (field === 'linechecker' && value) {
                    const startTs = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
                    await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${orderId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ field: 'startLineCheck', value: startTs })
                    });
                    await AuthGuard.authFetch(`${API_BASE}/dispatch-plan/truck-field/${orderId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ field: 'orderStatus', value: 'Checking' })
                    });
                }
                loadData();
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.error || 'Failed to update field');
                cellEl.innerHTML = restoreHTML;
                cellEl.style.opacity = '1';
            }
        } catch (err) {
            console.error(err);
            alert('Error updating field: ' + err.message);
            cellEl.innerHTML = restoreHTML;
            cellEl.style.opacity = '1';
        }
    }

    // Auto-refresh every 2 minutes
    setInterval(loadData, 120000);

