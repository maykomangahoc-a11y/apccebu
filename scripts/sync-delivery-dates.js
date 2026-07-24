// Backfills dispatch_orders.delivery_date from the "Dispatched Monitoring" Excel report.
// Usage: node scripts/sync-delivery-dates.js "C:\path\to\Dispatched Monitoring 2026_xx.xlsx" [--apply]
//
// Without --apply it only prints a preview of what would change.
// Only fills in orders whose delivery_date is currently blank; existing values are never overwritten.
// Orders with no matching STO# in the monitoring file are left untouched (manual entry, e.g. pending from customer).

require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');

const filePath = process.argv[2];
const apply = process.argv.includes('--apply');

if (!filePath) {
  console.error('Usage: node scripts/sync-delivery-dates.js <path-to-xlsx> [--apply]');
  process.exit(1);
}

const SHEETS_TO_SCAN = [
  'JULY DISPATCH PLAN',
  'MSG DISPATCH PLAN',
  'Summary 2026',
  'DISPATCH PLAN 2025 (2)',
  'APRIL TO JUNE',
];

function excelDateToStr(v) {
  if (typeof v !== 'number') return null;
  const d = XLSX.SSF.parse_date_code(v);
  if (!d || !d.y) return null;
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
}

function buildDeliveryMap(wb) {
  const map = new Map();
  for (const sheetName of SHEETS_TO_SCAN) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    let headerRowIdx = -1, stoIdx = -1, delIdx = -1;
    for (let i = 0; i < Math.min(12, rows.length); i++) {
      const idx = rows[i].findIndex(h => String(h).toLowerCase().trim().startsWith('sto'));
      if (idx !== -1) {
        headerRowIdx = i;
        stoIdx = idx;
        delIdx = rows[i].findIndex(h => String(h).toLowerCase().includes('delivery'));
        break;
      }
    }
    if (headerRowIdx === -1 || delIdx === -1) continue;

    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const sto = String(row[stoIdx] || '').trim();
      if (!sto || !/^\d+/.test(sto)) continue;
      const dateStr = excelDateToStr(row[delIdx]);
      if (!dateStr) continue;
      if (!map.has(sto)) map.set(sto, dateStr);
    }
  }
  return map;
}

async function syncTable(client, table, deliveryMap, apply) {
  const res = await client.query(`SELECT id, fo, account_name, delivery_date FROM ${table}`);
  const toUpdate = [];

  for (const row of res.rows) {
    const currentDeliveryDate = (row.delivery_date || '').trim();
    if (currentDeliveryDate) continue;

    const foParts = String(row.fo || '').split(',').map(s => s.trim()).filter(Boolean);
    const matchedDate = foParts.map(p => deliveryMap.get(p)).find(Boolean);
    if (!matchedDate) continue;

    toUpdate.push({ id: row.id, fo: row.fo, account_name: row.account_name, newDate: matchedDate });
  }

  console.log(`\n=== ${table}: ${toUpdate.length} order(s) to fill in ===`);
  toUpdate.forEach(r => console.log(`  ${r.fo}\t${r.account_name}\t-> ${r.newDate}`));

  if (apply && toUpdate.length) {
    for (const r of toUpdate) {
      await client.query(`UPDATE ${table} SET delivery_date = $1 WHERE id = $2`, [r.newDate, r.id]);
    }
    console.log(`Applied ${toUpdate.length} update(s) to ${table}.`);
  }

  return toUpdate.length;
}

(async () => {
  const wb = XLSX.readFile(path.resolve(filePath));
  const deliveryMap = buildDeliveryMap(wb);
  console.log(`Parsed ${deliveryMap.size} STO# -> delivery date pairs from ${path.basename(filePath)}`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });
  const client = await pool.connect();
  try {
    const ordersCount = await syncTable(client, 'dispatch_orders', deliveryMap, apply);
    const archiveCount = await syncTable(client, 'dispatch_archive', deliveryMap, apply);

    if (!apply && (ordersCount || archiveCount)) {
      console.log('\nDry run only. Re-run with --apply to write these changes.');
    }
  } finally {
    client.release();
    await pool.end();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
