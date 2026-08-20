const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ─── GET ALL DISPATCH ORDERS ────────────────────────────────────────────────
// GET /api/dispatch
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { archive_status } = req.query;
    let query = 'SELECT * FROM dispatch_orders';
    const params = [];

    if (archive_status) {
      query += ' WHERE archive_status = $1';
      params.push(archive_status);
    } else {
      query += " WHERE (archive_status IS NULL OR LOWER(archive_status) != 'archived')";
    }

    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get dispatch orders error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET SINGLE DISPATCH ORDER ──────────────────────────────────────────────
// GET /api/dispatch/:id
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM dispatch_orders WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get dispatch order error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── CREATE DISPATCH ORDER ──────────────────────────────────────────────────
// POST /api/dispatch
router.post('/', authenticateToken, async (req, res) => {
  try {
    const fields = [
      'status', 'order_received', 'party_code', 'account_name', 'type',
      'qty', 'cbm', 'weight', 'invoiced_value', 'order_status', 'fo',
      'truck_size', 'trucker', 'loading_time', 'linechecker', 'dispatcher',
      'checked_qty', 'column_q', 'plate_no', 'time_arrival', 'start_loading',
      'loading_end', 'preparation', 'truck_arrival', 'est_amount',
      'start_line_check', 'end_line_check', 'staging_area', 'delivery_date',
      'dispatch_date', 'loading_date', 'rtd_date', 'line_check_date',
      'picking_date', 'done_pick_date', 'ready_for_dispatch', 'w_truck',
      'ongoing', 'loaded_date', 'truck_status'
    ];

    const provided = [];
    const placeholders = [];
    const values = [];
    let idx = 1;

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        provided.push(field);
        placeholders.push(`$${idx++}`);
        values.push(req.body[field]);
      }
    }

    let query;
    if (provided.length > 0) {
      query = `INSERT INTO dispatch_orders (${provided.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    } else {
      query = 'INSERT INTO dispatch_orders DEFAULT VALUES RETURNING *';
    }

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create dispatch order error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── UPDATE DISPATCH ORDER ──────────────────────────────────────────────────
// PUT /api/dispatch/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    // All updatable columns
    const columns = [
      'status', 'order_received', 'party_code', 'account_name', 'type',
      'qty', 'cbm', 'weight', 'invoiced_value', 'order_status', 'fo',
      'truck_size', 'trucker', 'loading_time', 'linechecker', 'dispatcher',
      'checked_qty', 'column_q', 'plate_no', 'time_arrival', 'start_loading',
      'loading_end', 'preparation', 'truck_arrival', 'est_amount',
      'start_line_check', 'end_line_check', 'archive_status', 'staging_area',
      'invoiced_value_user', 'invoiced_value_ts', 'delivery_date',
      'dispatch_date', 'loading_date', 'rtd_date', 'line_check_date',
      'picking_date', 'done_pick_date', 'ready_for_dispatch', 'w_truck',
      'ongoing', 'loaded_date', 'truck_status'
    ];

    for (const col of columns) {
      if (body[col] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(body[col]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE dispatch_orders SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update dispatch order error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE DISPATCH ORDER ──────────────────────────────────────────────────
// DELETE /api/dispatch/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const result = await client.query('DELETE FROM dispatch_orders WHERE id = $1 RETURNING id, fo, party_code', [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const { fo, party_code } = result.rows[0];

    // Deleting the dispatch entry should also stop any picking session still
    // running against it, otherwise it keeps showing as ON-GOING in the picking list.
    if (fo) {
      await client.query(
        `DELETE FROM picking_data WHERE fo = $1 AND party_code = $2 AND status = 'in-progress'`,
        [fo, party_code || '']
      );
      await client.query(
        'DELETE FROM pending_picks WHERE fo = $1 AND party_code = $2',
        [fo, party_code || '']
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete dispatch order error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── TRUCK FIELD UPDATES WITH AUDIT ─────────────────────────────────────────
// PUT /api/dispatch/:id/truck
router.put('/:id/truck', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const user = req.user.username;
    const ts = new Date().toISOString();

    const fields = [];
    const values = [];
    let idx = 1;

    // Map of truck field -> audit timestamp/user column names
    const truckFields = {
      loading_time: ['truck_loading_time_ts', 'truck_loading_time_user'],
      linechecker: ['truck_linechecker_ts', 'truck_linechecker_user'],
      dispatcher: ['truck_dispatcher_ts', 'truck_dispatcher_user'],
      time_arrival: ['truck_time_arrival_ts', 'truck_time_arrival_user'],
      start_loading: ['truck_start_loading_ts', 'truck_start_loading_user'],
      loading_end: ['truck_loading_end_ts', 'truck_loading_end_user'],
      trucker: ['truck_trucker_ts', 'truck_trucker_user'],
      plate_no: ['truck_plate_no_ts', 'truck_plate_no_user'],
    };

    for (const [field, [tsCol, userCol]] of Object.entries(truckFields)) {
      if (body[field] !== undefined) {
        fields.push(`${field} = $${idx++}`);
        values.push(body[field]);
        fields.push(`${tsCol} = $${idx++}`);
        values.push(ts);
        fields.push(`${userCol} = $${idx++}`);
        values.push(user);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No truck fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE dispatch_orders SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update truck fields error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PLAN STATUS UPDATES WITH AUDIT ─────────────────────────────────────────
// PUT /api/dispatch/:id/plan
router.put('/:id/plan', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { plan } = req.body; // e.g. 'today', 'pending', 'additional', 'grand', 'tomorrow'
    const user = req.user.username;
    const ts = new Date().toISOString();

    if (!plan) {
      return res.status(400).json({ error: 'Plan type is required' });
    }

    const validPlans = ['today', 'pending', 'additional', 'grand', 'tomorrow'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ error: `Invalid plan type. Must be one of: ${validPlans.join(', ')}` });
    }

    const tsCol = `plan_${plan}_ts`;
    const userCol = `plan_${plan}_user`;

    const result = await pool.query(
      `UPDATE dispatch_orders SET ${tsCol} = $1, ${userCol} = $2 WHERE id = $3 RETURNING *`,
      [ts, user, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update plan status error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── ORDER STATUS UPDATES WITH AUDIT ────────────────────────────────────────
// PUT /api/dispatch/:id/status
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { order_status } = req.body;
    const user = req.user.username;
    const ts = new Date().toISOString();

    if (!order_status) {
      return res.status(400).json({ error: 'order_status is required' });
    }

    const validStatuses = ['rtd', 'sorting', 'sorted', 'picking', 'picked', 'loading', 'loaded', 'dispatched', 'checking'];
    const statusKey = order_status.toLowerCase().replace(/\s+/g, '_');

    const fields = [`order_status = $1`];
    const values = [order_status];
    let idx = 2;

    if (validStatuses.includes(statusKey)) {
      fields.push(`status_${statusKey}_ts = $${idx++}`);
      values.push(ts);
      fields.push(`status_${statusKey}_user = $${idx++}`);
      values.push(user);
    }

    if (statusKey === 'dispatched') {
      fields.push(`truck_status = $${idx++}`);
      values.push('Dispatched');
      fields.push(`truck_status_ts = $${idx++}`);
      values.push(ts);
      fields.push(`truck_status_user = $${idx++}`);
      values.push(user);
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE dispatch_orders SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update order status error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── ARCHIVE DISPATCH ORDER ────────────────────────────────────────────────
// POST /api/dispatch/:id/archive
router.post('/:id/archive', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    // Get the order
    const orderResult = await client.query('SELECT * FROM dispatch_orders WHERE id = $1', [id]);
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Insert into archive
    await client.query(
      `INSERT INTO dispatch_archive (
        id, status, order_received, party_code, account_name, type, qty, cbm, weight,
        invoiced_value, order_status, fo, truck_size, trucker, loading_time, linechecker,
        dispatcher, checked_qty, plate_no, time_arrival, start_loading, loading_end,
        preparation, est_amount, start_line_check, end_line_check,
        invoiced_value_user, dispatch_date, done_pick_date, delivery_date, truck_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [
        order.id, order.status, order.order_received, order.party_code, order.account_name,
        order.type, order.qty, order.cbm, order.weight, order.invoiced_value, order.order_status,
        order.fo, order.truck_size, order.trucker, order.loading_time, order.linechecker,
        order.dispatcher, order.checked_qty, order.plate_no, order.time_arrival,
        order.start_loading, order.loading_end, order.preparation, order.est_amount,
        order.start_line_check, order.end_line_check, order.invoiced_value_user,
        order.dispatch_date, order.done_pick_date, order.delivery_date, order.truck_status
      ]
    );

    // Update archive status
    await client.query(
      "UPDATE dispatch_orders SET archive_status = 'Archived' WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Order archived successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Archive order error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── BULK ARCHIVE ───────────────────────────────────────────────────────────
// POST /api/dispatch/bulk-archive
router.post('/bulk-archive', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of order IDs required' });
    }

    await client.query('BEGIN');

    for (const id of ids) {
      const orderResult = await client.query('SELECT * FROM dispatch_orders WHERE id = $1', [id]);
      if (orderResult.rows.length === 0) continue;

      const order = orderResult.rows[0];

      await client.query(
        `INSERT INTO dispatch_archive (
          id, status, order_received, party_code, account_name, type, qty, cbm, weight,
          invoiced_value, order_status, fo, truck_size, trucker, loading_time, linechecker,
          dispatcher, checked_qty, plate_no, time_arrival, start_loading, loading_end,
          preparation, est_amount, start_line_check, end_line_check,
          invoiced_value_user, dispatch_date, done_pick_date, truck_status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
        ON CONFLICT (id) DO NOTHING`,
        [
          order.id, order.status, order.order_received, order.party_code, order.account_name,
          order.type, order.qty, order.cbm, order.weight, order.invoiced_value, order.order_status,
          order.fo, order.truck_size, order.trucker, order.loading_time, order.linechecker,
          order.dispatcher, order.checked_qty, order.plate_no, order.time_arrival,
          order.start_loading, order.loading_end, order.preparation, order.est_amount,
          order.start_line_check, order.end_line_check, order.invoiced_value_user,
          order.dispatch_date, order.done_pick_date, order.truck_status
        ]
      );

      await client.query(
        "UPDATE dispatch_orders SET archive_status = 'Archived' WHERE id = $1",
        [id]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, archived: ids.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Bulk archive error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── GET ARCHIVED ORDERS ────────────────────────────────────────────────────
// GET /api/dispatch/archived
router.get('/archived', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM dispatch_archive ORDER BY archived_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get archived orders error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── ARCHIVE COMPLETED ORDERS FROM YESTERDAY & BEYOND ──────────────────────
// POST /api/dispatch/archive-completed-yesterday
// Archives all active orders whose order_status indicates completion
// (dispatched, Picking Completed, Loaded, Checked, Archive Order) AND whose
// best-available date (dispatch_date, done_pick_date, loading_date,
// delivery_date, order_received, or created_at) is before today (Manila TZ).
router.post('/archive-completed-yesterday', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Today's date boundary in Manila timezone (midnight)
    const todayMNL = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })
    );
    todayMNL.setHours(0, 0, 0, 0);
    const todayISO = todayMNL.toISOString().slice(0, 10); // YYYY-MM-DD

    // Fetch all active (non-archived) orders
    const activeResult = await client.query(
      "SELECT * FROM dispatch_orders WHERE archive_status IS NULL OR LOWER(archive_status) != 'archived'"
    );

    const COMPLETED_STATUSES = new Set([
      'dispatched', 'picking completed', 'loaded', 'checked', 'checking',
      'archive order', 'archived order', 'complete', 'completed'
    ]);

    // Month name lookup for dd-MMM-yy parsing
    const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
                     jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

    // Parse various date formats into YYYY-MM-DD or null
    function bestISO(raw) {
      if (!raw) return null;
      const s = String(raw).trim();
      if (!s) return null;

      // ISO / pg timestamp: 2026-07-31...
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

      // dd-Mon-yy  e.g. 31-Jul-26
      const m1 = s.match(/^(\d{1,2})-(\w{3})-(\d{2,4})$/i);
      if (m1) {
        const day = m1[1].padStart(2, '0');
        const mon = MONTHS[(m1[2]).toLowerCase()];
        if (mon === undefined) return null;
        let yr = parseInt(m1[3]);
        if (yr < 100) yr += 2000;
        return `${yr}-${String(mon + 1).padStart(2, '0')}-${day}`;
      }

      // M/D/YYYY  or  M/D/YY
      const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (m2) {
        let yr = parseInt(m2[3]);
        if (yr < 100) yr += 2000;
        return `${yr}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
      }

      return null;
    }

    // Determine the best date for an order (prefer the most meaningful)
    function orderDate(row) {
      return bestISO(row.dispatch_date)
          || bestISO(row.done_pick_date)
          || bestISO(row.loading_date)
          || bestISO(row.delivery_date)
          || bestISO(row.order_received)
          || (row.created_at ? row.created_at.toISOString().slice(0, 10) : null);
    }

    let archivedCount = 0;

    for (const order of activeResult.rows) {
      const statusKey = (order.order_status || '').toLowerCase().trim();
      const planKey = (order.status || '').toLowerCase().trim();

      // Must be in a completed-like state
      if (!COMPLETED_STATUSES.has(statusKey) && !COMPLETED_STATUSES.has(planKey)) continue;

      // Must have a date that is before today
      const iso = orderDate(order);
      if (!iso || iso >= todayISO) continue;

      // Insert into archive (ON CONFLICT skip if already there)
      await client.query(
        `INSERT INTO dispatch_archive (
          id, status, order_received, party_code, account_name, type, qty, cbm, weight,
          invoiced_value, order_status, fo, truck_size, trucker, loading_time, linechecker,
          dispatcher, checked_qty, plate_no, time_arrival, start_loading, loading_end,
          preparation, est_amount, start_line_check, end_line_check,
          invoiced_value_user, dispatch_date, done_pick_date, delivery_date, truck_status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
        ON CONFLICT (id) DO NOTHING`,
        [
          order.id, order.status, order.order_received, order.party_code, order.account_name,
          order.type, order.qty, order.cbm, order.weight, order.invoiced_value, order.order_status,
          order.fo, order.truck_size, order.trucker, order.loading_time, order.linechecker,
          order.dispatcher, order.checked_qty, order.plate_no, order.time_arrival,
          order.start_loading, order.loading_end, order.preparation, order.est_amount,
          order.start_line_check, order.end_line_check, order.invoiced_value_user,
          order.dispatch_date, order.done_pick_date, order.delivery_date, order.truck_status
        ]
      );

      await client.query(
        "UPDATE dispatch_orders SET archive_status = 'Archived' WHERE id = $1",
        [order.id]
      );

      archivedCount++;
    }

    await client.query('COMMIT');
    res.json({ success: true, archived: archivedCount });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Archive completed yesterday error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── SEARCH BY FO ───────────────────────────────────────────────────────────
// GET /api/dispatch/search
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { fo, party_code, account_name } = req.query;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (fo) {
      conditions.push(`fo ILIKE $${idx++}`);
      values.push(`%${fo}%`);
    }
    if (party_code) {
      conditions.push(`party_code ILIKE $${idx++}`);
      values.push(`%${party_code}%`);
    }
    if (account_name) {
      conditions.push(`account_name ILIKE $${idx++}`);
      values.push(`%${account_name}%`);
    }

    if (conditions.length === 0) {
      return res.status(400).json({ error: 'At least one search parameter required' });
    }

    const result = await pool.query(
      `SELECT * FROM dispatch_orders WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      values
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Search dispatch error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── ORDER BALANCE ──────────────────────────────────────────────────────────
// GET /api/dispatch/:id/balance
router.get('/:id/balance', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const orderResult = await pool.query('SELECT id, fo, qty, checked_qty FROM dispatch_orders WHERE id = $1', [id]);

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const totalQty = parseInt(order.qty) || 0;
    const checkedQty = parseInt(order.checked_qty) || 0;
    const balance = totalQty - checkedQty;

    res.json({ id: order.id, fo: order.fo, qty: totalQty, checked_qty: checkedQty, balance });
  } catch (error) {
    console.error('Order balance error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── UPLOAD PASTED ORDERS ─────────────────────────────────────────────────────
// POST /api/dispatch/upload
router.post('/upload', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { orders } = req.body;
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ error: 'Array of orders required' });
    }

    await client.query('BEGIN');

    const fields = [
      'dispatch_date', 'fo', 'account_name', 'type', 'qty', 
      'invoiced_value', 'order_received', 'status', 'order_status', 'delivery_date'
    ];

    let insertedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      // Check if FO already exists in archived orders to avoid bringing back deleted/shipped orders
      const archiveCheck = await client.query('SELECT * FROM dispatch_archive WHERE fo = $1', [order.fo]);
      if (archiveCheck.rows.length > 0) {
          // It's in the archive. The user wants to update it (e.g., they provided the real STO# or delivery date)
          const matchedArchived = archiveCheck.rows[0];
          const updateFields = [];
          const updateValues = [];
          let updateIdx = 1;
          
          for (const field of fields) {
            // Preserve the current status/order_status
            if (field === 'fo' || field === 'status' || field === 'order_status') continue;
            
            if (order[field] !== undefined) {
              updateFields.push(`${field} = $${updateIdx++}`);
              updateValues.push(order[field]);
            }
          }

          if (updateFields.length > 0) {
            updateValues.push(matchedArchived.id);
            await client.query(`UPDATE dispatch_archive SET ${updateFields.join(', ')} WHERE id = $${updateIdx}`, updateValues);
          }
          
          skippedCount++; // Technically skipped from the active board
          continue; // Skip active insertion
      }

      // Check if it exists in active orders
      let matchedOrder = null;
      const isTempIncoming = !order.fo || order.fo.startsWith('TEMP-');

      // 1. Try to match by FO (if it's a real FO)
      if (!isTempIncoming) {
          const activeCheck = await client.query('SELECT * FROM dispatch_orders WHERE fo = $1', [order.fo]);
          if (activeCheck.rows.length > 0) {
              matchedOrder = activeCheck.rows[0];
          }
      }

      // 2. If no exact match by FO, try to match by Customer Name + Qty (heuristics)
      // This allows updating orders that were previously uploaded without an STO#
      if (!matchedOrder && order.account_name && order.qty !== undefined) {
          const similarCheck = await client.query(
              'SELECT * FROM dispatch_orders WHERE account_name = $1 AND qty = $2', 
              [order.account_name, order.qty]
          );
          if (similarCheck.rows.length === 1) {
              matchedOrder = similarCheck.rows[0];
          } else if (similarCheck.rows.length > 1) {
              // Try to narrow down by dispatch_date
              const dateMatches = similarCheck.rows.filter(r => r.dispatch_date === order.dispatch_date);
              if (dateMatches.length === 1) {
                  matchedOrder = dateMatches[0];
              }
          }
      }

      if (matchedOrder) {
          // UPDATE existing order
          const updateFields = [];
          const updateValues = [];
          let updateIdx = 1;
          
          for (const field of fields) {
            // Do not update the FO if the incoming is a TEMP FO, otherwise update it (e.g. they provided the real FO)
            if (field === 'fo' && isTempIncoming) continue;
            // Always preserve the current active order_status (e.g. picking/loading)
            if (field === 'order_status') continue;
            
            if (order[field] !== undefined) {
              updateFields.push(`${field} = $${updateIdx++}`);
              updateValues.push(order[field]);
            }
          }

          if (updateFields.length > 0) {
            updateValues.push(matchedOrder.id);
            await client.query(`UPDATE dispatch_orders SET ${updateFields.join(', ')} WHERE id = $${updateIdx}`, updateValues);
            insertedCount++; // Treat as successfully processed
          }
          continue;
      }

      // INSERT new order
      const provided = [];
      const placeholders = [];
      const values = [];
      let idx = 1;

      for (const field of fields) {
        if (order[field] !== undefined) {
          provided.push(field);
          placeholders.push(`$${idx++}`);
          values.push(order[field]);
        }
      }

      if (provided.length > 0) {
        await client.query(`INSERT INTO dispatch_orders (${provided.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
        insertedCount++;
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, uploaded: insertedCount, skipped: skippedCount, total: orders.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Upload orders error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── CLEANUP: Delete orders with date-like FO values (parser bug) ───────────
// POST /api/dispatch/cleanup-bad-fo
router.post('/cleanup-bad-fo', authenticateToken, async (req, res) => {
  try {
    // First count them
    const countResult = await pool.query(`
      SELECT COUNT(*) as cnt FROM dispatch_orders 
      WHERE fo ~ '^\\d{1,2}-[A-Za-z]{3}-\\d{2,4}$'
         OR fo ~ '^[A-Za-z]{3}-\\d{1,2}-\\d{2,4}$'
         OR fo ~ '^\\d{4}-\\d{2}-\\d{2}'
         OR fo ~ '^\\d{1,2}/\\d{1,2}/\\d{2,4}$'
         OR fo ~ '^\\d{5}$'
    `);
    
    const badCount = parseInt(countResult.rows[0].cnt);
    
    if (badCount === 0) {
      return res.json({ success: true, deleted: 0, message: 'No bad records found' });
    }

    // Delete them
    const deleteResult = await pool.query(`
      DELETE FROM dispatch_orders 
      WHERE fo ~ '^\\d{1,2}-[A-Za-z]{3}-\\d{2,4}$'
         OR fo ~ '^[A-Za-z]{3}-\\d{1,2}-\\d{2,4}$'
         OR fo ~ '^\\d{4}-\\d{2}-\\d{2}'
         OR fo ~ '^\\d{1,2}/\\d{1,2}/\\d{2,4}$'
         OR fo ~ '^\\d{5}$'
    `);

    res.json({ success: true, deleted: deleteResult.rowCount, message: `Cleaned up ${deleteResult.rowCount} orders with date-like FO values` });
  } catch (error) {
    console.error('Cleanup bad FO error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE ALL ACTIVE ORDERS ───────────────────────────────────────────────
// POST /api/dispatch/delete-all
router.post('/delete-all', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const activeFilter = "archive_status IS NULL OR LOWER(archive_status) != 'archived'";

    // Stop any picking sessions still running against the orders about to be wiped out,
    // otherwise they keep showing as ON-GOING in the picking list.
    await client.query(
      `DELETE FROM picking_data WHERE status = 'in-progress' AND (fo, party_code) IN (
         SELECT fo, party_code FROM dispatch_orders WHERE ${activeFilter}
       )`
    );
    await client.query(
      `DELETE FROM pending_picks WHERE (fo, party_code) IN (
         SELECT fo, party_code FROM dispatch_orders WHERE ${activeFilter}
       )`
    );

    const result = await client.query(`DELETE FROM dispatch_orders WHERE ${activeFilter}`);

    await client.query('COMMIT');
    res.json({ success: true, deleted: result.rowCount, message: `Deleted ${result.rowCount} active orders` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete all orders error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ─── SINGLE TRUCK FIELD UPDATE (used by Dispatch Plan & Outbound Checking) ──
// POST /api/dispatch-plan/truck-field/:id   body: { field, value }
// Updates one editable dispatch field (camelCase) plus its audit ts/user, and
// returns { ...order, timestamp, username } so the UI can show who saved it.
const TRUCK_FIELD_MAP = {
  linechecker:    { col: 'linechecker',     tsCol: 'truck_linechecker_ts',   userCol: 'truck_linechecker_user' },
  dispatcher:     { col: 'dispatcher',      tsCol: 'truck_dispatcher_ts',    userCol: 'truck_dispatcher_user' },
  trucker:        { col: 'trucker',         tsCol: 'truck_trucker_ts',       userCol: 'truck_trucker_user' },
  plateNo:        { col: 'plate_no',        tsCol: 'truck_plate_no_ts',      userCol: 'truck_plate_no_user' },
  loadingTime:    { col: 'loading_time',    tsCol: 'truck_loading_time_ts',  userCol: 'truck_loading_time_user' },
  timeArrival:    { col: 'time_arrival',    tsCol: 'truck_time_arrival_ts',  userCol: 'truck_time_arrival_user' },
  startLoading:   { col: 'start_loading',   tsCol: 'truck_start_loading_ts', userCol: 'truck_start_loading_user' },
  loadingEnd:     { col: 'loading_end',     tsCol: 'truck_loading_end_ts',   userCol: 'truck_loading_end_user' },
  checkedQty:     { col: 'checked_qty' },
  startLineCheck: { col: 'start_line_check' },
  endLineCheck:   { col: 'end_line_check' },
  stagingArea:    { col: 'staging_area' },
  orderStatus:    { col: 'order_status' },
  truckStatus:    { col: 'truck_status', tsCol: 'truck_status_ts', userCol: 'truck_status_user' },
};

router.post('/truck-field/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { field, value } = req.body;

    const map = TRUCK_FIELD_MAP[field];
    if (!map) {
      return res.status(400).json({ error: `Invalid field: ${field}` });
    }

    const username = req.user.username;
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });

    const setParts = [`${map.col} = $1`];
    const values = [value != null ? value : ''];
    let idx = 2;
    if (map.tsCol)   { setParts.push(`${map.tsCol} = $${idx++}`);   values.push(timestamp); }
    if (map.userCol) { setParts.push(`${map.userCol} = $${idx++}`); values.push(username); }
    values.push(id);

    const result = await pool.query(
      `UPDATE dispatch_orders SET ${setParts.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ ...result.rows[0], timestamp, username });
  } catch (error) {
    console.error('Truck field update error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── LOG A LINE-CHECK ASSIGNMENT ────────────────────────────────────────────
// POST /api/dispatch-plan/check-log
router.post('/check-log', authenticateToken, async (req, res) => {
  try {
    const { id, fo, partyCode, accountName, qty, checker, checkedQty, duration } = req.body;
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });

    const result = await pool.query(
      `INSERT INTO checking_data (
        timestamp, order_id, fo, party_code, account_name, qty, checker, checked_qty, duration, log_user
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [timestamp, id || '', fo || '', partyCode || '', accountName || '',
       qty || '', checker || '', checkedQty || '', duration || '', req.user.username]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Check log error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── LOG A DISPATCH ASSIGNMENT ──────────────────────────────────────────────
// POST /api/dispatch-plan/dispatch-log
router.post('/dispatch-log', authenticateToken, async (req, res) => {
  try {
    const { id, fo, partyCode, accountName, qty, dispatcher } = req.body;
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });

    const result = await pool.query(
      `INSERT INTO dispatching_data (
        timestamp, order_id, fo, party_code, account_name, qty, dispatcher, log_user
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [timestamp, id || '', fo || '', partyCode || '', accountName || '',
       qty || '', dispatcher || '', req.user.username]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Dispatch log error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
