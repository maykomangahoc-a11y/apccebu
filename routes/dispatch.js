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
      query += " WHERE archive_status = 'Active'";
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
      'start_line_check', 'end_line_check', 'staging_area',
      'dispatch_date', 'loading_date', 'rtd_date', 'line_check_date',
      'picking_date', 'done_pick_date', 'ready_for_dispatch', 'w_truck',
      'ongoing', 'loaded_date'
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
      'invoiced_value_user', 'invoiced_value_ts',
      'dispatch_date', 'loading_date', 'rtd_date', 'line_check_date',
      'picking_date', 'done_pick_date', 'ready_for_dispatch', 'w_truck',
      'ongoing', 'loaded_date'
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
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM dispatch_orders WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete dispatch order error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
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
        invoiced_value_user, dispatch_date, done_pick_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)`,
      [
        order.id, order.status, order.order_received, order.party_code, order.account_name,
        order.type, order.qty, order.cbm, order.weight, order.invoiced_value, order.order_status,
        order.fo, order.truck_size, order.trucker, order.loading_time, order.linechecker,
        order.dispatcher, order.checked_qty, order.plate_no, order.time_arrival,
        order.start_loading, order.loading_end, order.preparation, order.est_amount,
        order.start_line_check, order.end_line_check, order.invoiced_value_user,
        order.dispatch_date, order.done_pick_date
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
          invoiced_value_user, dispatch_date, done_pick_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
        ON CONFLICT (id) DO NOTHING`,
        [
          order.id, order.status, order.order_received, order.party_code, order.account_name,
          order.type, order.qty, order.cbm, order.weight, order.invoiced_value, order.order_status,
          order.fo, order.truck_size, order.trucker, order.loading_time, order.linechecker,
          order.dispatcher, order.checked_qty, order.plate_no, order.time_arrival,
          order.start_loading, order.loading_end, order.preparation, order.est_amount,
          order.start_line_check, order.end_line_check, order.invoiced_value_user,
          order.dispatch_date, order.done_pick_date
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
      'invoiced_value', 'order_received', 'status', 'order_status'
    ];

    let insertedCount = 0;
    let skippedCount = 0;

    for (const order of orders) {
      // Check if FO already exists to avoid duplicates
      const checkRes = await client.query('SELECT id FROM dispatch_orders WHERE fo = $1', [order.fo]);
      if (checkRes.rows.length > 0) {
          skippedCount++;
          continue; // Skip existing FOs
      }

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

module.exports = router;
