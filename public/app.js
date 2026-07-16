// Warehouse Picking Management System
// Google Sheets Integration

const API_BASE = '/api';

let state = {
  dispatchPlan: [], pickers: [], stagingAreas: [], completedPicking: [], pickerAssignments: [], charts: {}
};
let pickerCounter = 0;

// Format date to local time string: M/D/YYYY h:mm AM/PM
function formatLocalDateTime(date) {
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).replace(', ', ' ');
}

// Format a timestamp string for display (handles both local format and ISO strings)
function formatDisplayTime(dateStr) {
  if (!dateStr) return '-';
  const d = parseLocalDateTime(dateStr);
  return formatLocalDateTime(d);
}

// Parse timestamp string back to Date object, handling both local format and ISO strings
function parseLocalDateTime(dateStr) {
  if (!dateStr) return new Date();
  try {
    // First handle ISO strings (server may return these)
    const isoRegex = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.?\d*Z?$/;
    const isoMatch = dateStr.match(isoRegex);
    if (isoMatch) {
      const [, year, month, day, hour, minute] = isoMatch;
      // Treat as local time (fix for server timezone conversion issue)
      const d = new Date(parseInt(year), parseInt(month)-1, parseInt(day), parseInt(hour), parseInt(minute), 0);
      console.log(`parseLocalDateTime ISO("${dateStr}") -> hours: ${d.getHours()}`);
      return d;
    }
    // Parse manual format "M/D/YYYY h:mm AM/PM"
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)/i;
    const match = dateStr.match(regex);
    if (match) {
      let [, month, day, year, hour, minute, ampm] = match;
      hour = parseInt(hour);
      if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
      if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
      const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hour, parseInt(minute), 0);
      console.log(`parseLocalDateTime("${dateStr}") -> hours: ${d.getHours()}`);
      return d;
    }
    // Fallback to standard parsing
    console.log(`parseLocalDateTime fallback for: "${dateStr}"`);
    return new Date(dateStr);
  } catch (e) {
    console.error(`parseLocalDateTime error: ${e}`);
    return new Date();
  }
}
}

document.addEventListener('DOMContentLoaded', async function() {
  await loadInitialData();
  renderCharts();
});

async function loadInitialData() {
  try {
    const [dispatchPlan, pickers, stagingAreas, pickingData] = await Promise.all([
      fetch(API_BASE + '/dispatch-plan').then(r => r.json()),
      fetch(API_BASE + '/pickers').then(r => r.json()),
      fetch(API_BASE + '/staging-areas').then(r => r.json()),
      fetch(API_BASE + '/picking-data').then(r => r.json())
    ]);
    console.log('Raw pickingData from server:', pickingData);
    state.dispatchPlan = dispatchPlan; state.pickers = pickers;
    state.stagingAreas = stagingAreas || []; state.completedPicking = pickingData || [];

    document.getElementById('filter-start-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('filter-end-date').value = new Date();

    const areas = document.getElementById('staging-area');
    areas.innerHTML = '<option value="">-- Select Staging Area --</option>' + (stagingAreas || []).map(a => '<option value="' + a + '">' + a + '</option>').join('') || '';

    const pickerFilter = document.getElementById('filter-picker');
    const uniquePickers = new Set(state.completedPicking.map(o => o.Picker + ' - ' + o.Name));
    pickerFilter.innerHTML = '<option value="">All Pickers</option>' + Array.from(uniquePickers).map(p => '<option value="' + p + '">' + p + '</option>').join('');

    sessionStorage.setItem('pickingData', JSON.stringify(state.completedPicking));
    updateDashboard();
    renderCompleted();
  } catch (error) {
    console.error('Error loading data:', error);
    const localData = JSON.parse(sessionStorage.getItem('pickingData') || '[]');
    state.completedPicking = localData;
    updateDashboard();
    renderCompleted();
  }
}

function renderCharts() { if (state.completedPicking.length > 0) { renderPickerBarChart(); renderHourlyTrendChart(); renderHeatmapChart(); } }

function updateDashboard() {
  const data = state.completedPicking;
  document.getElementById('total-picks').textContent = data.length.toLocaleString();
  document.getElementById('avg-picks-per-picker').textContent = Math.round(data.length / new Set(data.map(o => o.Picker)).size || 1).toLocaleString();
  const totals = {}; data.forEach(o => { totals[o.Picker] = (totals[o.Picker] || 0) + o.QTY; });
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('top-picker').textContent = top ? top[0] : '-';
  const hourly = {}; data.forEach(o => { const hr = parseLocalDateTime(o.Start).getHours(); hourly[hr] = (hourly[hr] || 0) + o.QTY; });
  const peak = Object.entries(hourly).sort((a, b) => b[1] - a[1])[0];
  const peakHour12 = peak ? (() => { const h = parseInt(peak[0]); return (h % 12 || 12) + ':00 ' + (h < 12 ? 'AM' : 'PM'); })() : '-';
  document.getElementById('peak-hour').textContent = peak ? peakHour12 + ' (' + peak[1].toLocaleString() + ' picks)' : '-';
  const avgTime = data.length ? Math.round(data.reduce((s, o) => s + (parseLocalDateTime(o.End) - parseLocalDateTime(o.Start)) / 1000 / 60, 0) / data.length) : 0;
  document.getElementById('avg-pick-time').textContent = avgTime.toLocaleString();
  sessionStorage.setItem('pickingData', JSON.stringify(state.completedPicking));
}

function renderPickerBarChart() {
  const ctx = document.getElementById('pickerBarChart');
  const totals = {}; state.completedPicking.forEach(o => { totals[o.Picker] = (totals[o.Picker] || 0) + o.QTY; });
  const labels = Object.keys(totals).sort((a, b) => totals[b] - totals[a]); const data = labels.map(l => totals[l]);
  if (state.charts.pickerBar) { state.charts.pickerBar.data.labels = labels; state.charts.pickerBar.datasets[0].data = data; state.charts.pickerBar.update('none'); }
  else state.charts.pickerBar = new Chart(ctx, { type: 'bar', data: { labels, datasets: [{ label: 'Total Picks', data, backgroundColor: '#3498db' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
}

function renderHourlyTrendChart() {
  const ctx = document.getElementById('hourlyTrendChart');
  const hourly = {}; state.completedPicking.forEach(o => { const hr = parseLocalDateTime(o.Start).getHours(); hourly[hr] = (hourly[hr] || 0) + o.QTY; });
  const labels = Array.from({ length: 13 }, (_, i) => i + 6).map(h => h + ':00');
  const data = Array.from({ length: 13 }, (_, i) => i + 6).map(h => hourly[h] || 0);
  if (state.charts.hourlyTrend) { state.charts.hourlyTrend.data.labels = labels; state.charts.hourlyTrend.datasets[0].data = data; state.charts.hourlyTrend.update('none'); }
  else state.charts.hourlyTrend = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: 'Hourly Picks', data, borderColor: '#27ae60', backgroundColor: 'rgba(39, 174, 96, 0.1)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
}

function renderHeatmapChart() {
  const canvas = document.getElementById('heatmapChart');
  const pickerHourly = {}; state.completedPicking.forEach(o => { const pid = o.Picker, hr = parseLocalDateTime(o.Start).getHours(); if(!pickerHourly[pid]) pickerHourly[pid] = {}; pickerHourly[pid][hr] = (pickerHourly[pid][hr] || 0) + o.QTY; });
  const pickers = Object.keys(pickerHourly).slice(0, 4);
  const hours = Array.from({ length: 13 }, (_, i) => i + 6);
  const data = pickers.map(pid => hours.map(h => pickerHourly[pid]?.[h] || 0));
  if (state.charts.heatmap) { state.charts.heatmap.data.datasets[0].data = data; state.charts.heatmap.update('none'); }
  else state.charts.heatmap = new Chart(canvas, { type: 'bubble', data: { datasets: [{ label: 'Picks BY Hour', data: data.flatMap((row, yi) => row.map((val, xi) => ({ x: hours[xi], y: yi, r: val > 0 ? Math.sqrt(val) : 0 }))), backgroundColor: ['#3a80c8', '#59a2db', '#82bfcb', '#cde6d0'] }] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { min: 6, max: 18, ticks: { callback: h => h + ':00' } }, y: { ticks: (c) => c.getLabels().map((t, i) => ({ text: pickers[i], visible: true })) } } } });
}

function searchFO(value) {
  const s = document.getElementById('fo-suggestions');
  if (value.length < 2) { s.style.display = 'none'; return; }
  const matched = state.dispatchPlan.filter(fo => fo.FO && (fo.FO.includes(value) || fo.ACCOUNTNAME.toLowerCase().includes(value.toLowerCase())));
  if (matched.length > 0) { s.innerHTML = matched.map(fo => '<div class="fo-suggestion-item" onclick="selectFO(\'' + fo.FO + '\')"><strong>FO# ' + fo.FO + '</strong><br><small>' + fo.ACCOUNTNAME + ' - Qty: ' + fo.QTY.toLocaleString() + '</small></div>').join(''); s.style.display = 'block'; }
  else s.style.display = 'none';
}

async function selectFO(foNumber) {
  const fo = state.dispatchPlan.find(f => f.FO === foNumber);
  if (fo) {
    document.getElementById('fo-number').value = fo.FO;
    document.getElementById('fo-number').dataset.orderId = fo.id || '';
    document.getElementById('account-name').value = fo.ACCOUNTNAME;
    document.getElementById('party-code').value = fo.ACCOUNTNAME || fo.FO;
    document.getElementById('total-qty').value = fo.QTY;
    document.getElementById('fo-suggestions').style.display = 'none';
  }
}

function addPickerAssignment() {
  pickerCounter++;
  const container = document.getElementById('picker-assignments');
  const opts = state.pickers.map(p => '<option value="' + p.Code + '" data-name="' + p.Name + '" data-shift="' + p.Shift + '">' + p.Code + ' - ' + p.Name + '</option>').join('');
  container.innerHTML += '<div class="picker-assignment"><h4>Picker Assignment #' + pickerCounter + '</h4><div class="grid-3"><div class="form-group"><label>Select Picker/Operator *</label><select id="picker-select-' + pickerCounter + '" onchange="updatePickerInfo(' + pickerCounter + ')"><option value="">-- Select Picker --</option>' + opts + '</select><div id="picker-info-' + pickerCounter + '" class="picker-info"></div></div><div class="form-group"><label>Quantity to Pick *</label><input type="number" id="picker-qty-' + pickerCounter + '" placeholder="Qty" min="1" required></div><div class="form-group"><label>BL# (Optional)</label><input type="text" id="picker-bl-' + pickerCounter + '" placeholder="BL#"></div></div><div class="button-group"><button class="button button-success" onclick="startPicking(' + pickerCounter + ')">Start Picking</button><button class="button button-danger" onclick="removePickerAssignment(' + pickerCounter + ')">Remove</button></div></div>';
}

function updatePickerInfo(pickerId) {
  const select = document.getElementById('picker-select-' + pickerId);
  const info = document.getElementById('picker-info-' + pickerId);
  const opt = select.options[select.selectedIndex];
  if (opt.value) {
    const design = opt.dataset.designation || 'Picker';
    const shift = opt.dataset.shift || '';
    const shiftClass = shift === '1st Shift' ? 'shift-1st' : 'shift-2nd';
    const designClass = design === 'Picker' ? 'designation-picker' : 'designation-operator';
    info.innerHTML = '<span class="designation-badge ' + designClass + '">' + design + '</span>' + (shift ? '<span class="shift-badge ' + shiftClass + '">' + shift + '</span>' : '');
  } else info.innerHTML = '';
}

function removePickerAssignment(id) {
  const el = document.getElementById('picker-' + id);
  if (el) el.remove();
}

async function startPicking(pickerId) {
  const fo = document.getElementById('fo-number').value;
  const orderId = document.getElementById('fo-number').dataset.orderId || '';
  const account = document.getElementById('account-name').value;
  const staging = document.getElementById('staging-area').value;
  const select = document.getElementById('picker-select-' + pickerId);
  const picker = select.value;
  const opt = select.options[select.selectedIndex];
  const name = opt ? opt.dataset.name : '';
  const qty = document.getElementById('picker-qty-' + pickerId).value;
  const bl = opt ? (document.getElementById('picker-bl-' + pickerId) ? document.getElementById('picker-bl-' + pickerId).value : 'BL-' + Date.now()) : '';

  if (!fo || !account || !staging || !picker || !qty) {
    alert('Please fill all required fields');
    return;
  }

  const now = new Date();
  const startTime = formatLocalDateTime(now);
  const payload = { FO: fo, ACCOUNTNAME: account, BL: bl, Picker: picker, QTY: parseInt(qty), Staging: staging, Start: startTime, End: '', Duration: 0, ORDER_ID: orderId };

  try {
    await fetch(API_BASE + '/picking-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    state.completedPicking.push(payload);
    sessionStorage.setItem('pickingData', JSON.stringify(state.completedPicking));
    updateDashboard(); renderInProgress(); loadInitialData();
    removePickerAssignment(pickerId);
    alert('Picking started!');
  } catch (e) { alert('Error: ' + e.message); }
}

function renderInProgress() {
  const icons = document.getElementById('in-progress-list');
  const inProgress = state.completedPicking.filter(o => !o.End);
  if (inProgress.length === 0) { icons.innerHTML = '<div class="empty-state">No active picking orders</div>'; return; }
  icons.innerHTML = inProgress.map(o => {
    const start = parseLocalDateTime(o.Start);
    const dur = Math.floor((Date.now() - start) / 1000 / 60);
    return '<div class="in-progress-item"><h3>FO#' + o.FO + ' - ' + o.ACCOUNTNAME + '</h3><div class="grid-2"><div><p><strong>Picker:</strong> ' + o.Picker + '</p><p><strong>Qty:</strong> ' + o.QTY.toLocaleString() + '</p><p><strong>Staging:</strong> ' + o.Staging + '</p></div><div><p><strong>Started:</strong> ' + formatDisplayTime(o.Start) + '</p><p><strong>Duration:</strong> ' + dur + ' min</p><p><span class="status-badge status-in-progress">In Progress</span></p></div></div><div class="button-group"><button class="button button-success" onclick="endPicking(' + '"' + o.FO + '"' + ', ' + '"' + o.ACCOUNTNAME + '"' + ', ' + '"' + o.Picker + '"' + ', ' + '"' + o.QTY + '"' + ', ' + '"' + o.Staging + '")">End Picking</button></div></div>';
  }).join('');
}

async function endPicking(fo, account, picker, qty, staging) {
  if (!confirm('End picking for FO#' + fo + '?')) return;
  try {
    const picking = state.completedPicking.find(o => o.FO === fo);
    const now = new Date();
    const endTime = formatLocalDateTime(now);
    const startISO = parseLocalDateTime(picking.Start);
    const dur = Math.floor((now - startISO) / 1000 / 60);
    await fetch(API_BASE + '/picking-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ FO: fo, ACCOUNTNAME: account, BL: 'END-' + Date.now(), Picker: picker, QTY: parseInt(qty), Staging: staging, Start: picking.Start, End: endTime, Duration: dur }) });
    const updated = state.completedPicking.find(o => o.FO === fo);
    if (updated) { updated.End = endTime; updated.Duration = dur; }
    sessionStorage.setItem('pickingData', JSON.stringify(state.completedPicking));
    alert('Picking completed! Duration: ' + dur + ' minutes');
    switchTab('completed'); renderCharts();
  } catch (e) { alert('Error: ' + e.message); }
}

function renderCompleted() {
  const container = document.getElementById('completed-list');
  const completed = state.completedPicking.filter(o => o.End);
  if (completed.length === 0) { container.innerHTML = '<div class="empty-state">No completed orders yet</div>'; return; }
  const rows = completed.map(o => {
    const startISO = parseLocalDateTime(o.Start);
    const endISO = parseLocalDateTime(o.End);
    const dur = o.Duration || Math.floor((endISO - startISO) / 1000 / 60);
    return '<tr><td>' + o.FO + '</td><td>' + o.ACCOUNTNAME + '</td><td>' + o.Picker + '</td><td>' + o.QTY.toLocaleString() + '</td><td>' + o.Staging + '</td><td>' + formatDisplayTime(o.Start) + '</td><td>' + formatDisplayTime(o.End) + '</td><td>' + dur.toLocaleString() + ' min</td></tr>';
  });
  container.innerHTML = '<table><thead><tr><th>FO</th><th>Account</th><th>Picker</th><th>Qty</th><th>Staging</th><th>Start</th><th>End</th><th>Duration</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
}

function filterCompleted() {
  const q = document.getElementById('search-completed').value.toLowerCase();
  document.querySelectorAll('#completed-list tr').forEach(row => { row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none'; });
}

function exportToCSV() {
  const data = state.completedPicking;
  let csv = 'FO,ACCOUNTNAME,BL,Picker,QTY,Staging,Start,End,Duration\n';
  data.forEach(o => { csv += '"' + o.FO + '","' + o.ACCOUNTNAME + '","' + o.BL + '","' + o.Picker + '",' + o.QTY + ',"' + o.Staging + '","' + o.Start + '","' + o.End + '","' + o.Duration + '"\n'; });
  downloadCSV(csv, 'picking-orders.csv');
}

function exportDetailedReport() {
  const data = state.completedPicking;
  let csv = 'ID,FO,ACCOUNTNAME,BL,Picker,Start,End,Duration,Picks\n';
  data.forEach(o => { csv += o.ID || o._id || Date.now() + '",' + o.FO + '","' + o.ACCOUNTNAME + '","' + o.BL + '",' + o.Picker + '","' + o.Start + '","' + o.End + '",' + o.Duration + ',"' + o.QTY + '"\n'; });
  downloadCSV(csv, 'detailed-report.csv');
}

function exportPickerProductivity() {
  const stats = {};
  state.completedPicking.forEach(o => { const pid = o.Picker; if(!stats[pid]) stats[pid] = { orders: 0, totalQty: 0, totalDur: 0 }; stats[pid].orders++; stats[pid].totalQty += o.QTY; stats[pid].totalDur += o.Duration || 0; });
  let csv = 'Picker,Orders,TotalItems,TotalDur(hr),Items/Hr\n';
  Object.entries(stats).forEach(([pid, s]) => { csv += pid + ',' + s.orders + ',' + s.totalQty + ',' + s.totalDur + ',' + Math.floor((s.totalQty / s.totalDur) * 60) + '\n'; });
  downloadCSV(csv, 'picker-productivity.csv');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function clearForm() {
  document.getElementById('fo-number').value = ''; document.getElementById('account-name').value = ''; document.getElementById('party-code').value = ''; document.getElementById('total-qty').value = ''; document.getElementById('picker-assignments').innerHTML = ''; pickerCounter = 0;
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.getElementById(tabName).classList.add('active'); event.target.classList.add('active');
  if (tabName === 'in-progress') renderInProgress();
  else if (tabName === 'completed') renderCompleted();
}