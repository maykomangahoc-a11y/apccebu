const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// PICKING DATA (completed picks)
// ═══════════════════════════════════════════════════════════════════════════

// The frontend (outbound.html / dispatch-plan.html / outbound-checking.html) speaks
// camelCase field names that don't match the picking_data columns 1:1 (e.g. foNumber
// vs fo, pickerQty vs qty, blNumber vs bl). These aliases keep the DB schema stable
// while making every response come back with the exact keys the frontend reads.
const SELECT_COLUMNS = `
  id, fo AS fo_number, account_name, bl AS bl_number, picker_code,
  qty AS picker_qty, staging_area, start_time, start_time_formatted,
  end_time, end_time_formatted, duration, start_user, end_user,
  party_code, total_order_qty, order_id, status
`;

// GET /api/picking
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { order_id, fo } = req.query;
    let query = `SELECT ${SELECT_COLUMNS} FROM picking_data`;
    const conditions = [];
    const values = [];
    let idx = 1;

    if (order_id) {
      conditions.push(`order_id = $${idx++}`);
      values.push(order_id);
    }
    if (fo) {
      conditions.push(`fo ILIKE $${idx++}`);
      values.push(`%${fo}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY id DESC';
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Get picking data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/picking
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      foNumber, accountName, blNumber, pickerCode, pickerQty, stagingArea,
      startTime, startTimeFormatted, endTime, endTimeFormatted, duration,
      partyCode, totalOrderQty, orderId, status
    } = req.body;

    const resolvedStatus = status || 'in-progress';
    const startUser = req.user.username;
    const endUser = resolvedStatus === 'completed' ? req.user.username : null;

    const result = await pool.query(
      `INSERT INTO picking_data (
        fo, account_name, bl, picker_code, qty, staging_area,
        start_time, start_time_formatted, end_time, end_time_formatted, duration,
        start_user, end_user, party_code, total_order_qty, order_id, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING ${SELECT_COLUMNS}`,
      [foNumber, accountName, blNumber, pickerCode, pickerQty || 0, stagingArea,
       startTime, startTimeFormatted, endTime, endTimeFormatted, duration,
       startUser, endUser, partyCode, totalOrderQty || 0, orderId, resolvedStatus]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create picking data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/picking-orders/update-staging — reassign staging area for an active order
router.post('/update-staging', authenticateToken, async (req, res) => {
  try {
    const { foNumber, partyCode, stagingArea } = req.body;
    if (!foNumber || !stagingArea) {
      return res.status(400).json({ error: 'foNumber and stagingArea are required' });
    }

    const result = await pool.query(
      `UPDATE picking_data SET staging_area = $1
       WHERE fo = $2 AND party_code = $3 AND status = 'in-progress'
       RETURNING id`,
      [stagingArea, foNumber, partyCode || '']
    );

    res.json({
      success: true,
      updated: result.rowCount,
      message: `Staging area updated for ${result.rowCount} record(s).`
    });
  } catch (error) {
    console.error('Update staging area error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/picking-orders/backfill-system-ids — fill in missing order_id links
// on historical picking_data rows by matching FO + party code against dispatch orders.
router.post('/backfill-system-ids', authenticateToken, async (req, res) => {
  try {
    const missing = await pool.query(
      `SELECT id, fo, party_code, start_time FROM picking_data WHERE order_id IS NULL OR order_id = ''`
    );

    let total = 0;
    let today = 0;
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const row of missing.rows) {
      let match = (await pool.query(
        'SELECT id FROM dispatch_orders WHERE fo = $1 AND party_code = $2 LIMIT 1',
        [row.fo, row.party_code]
      )).rows[0];

      if (!match) {
        match = (await pool.query(
          'SELECT id FROM dispatch_archive WHERE fo = $1 AND party_code = $2 LIMIT 1',
          [row.fo, row.party_code]
        )).rows[0];
      }

      if (match) {
        await pool.query('UPDATE picking_data SET order_id = $1 WHERE id = $2', [match.id, row.id]);
        total++;
        if (row.start_time && row.start_time.slice(0, 10) === todayStr) {
          today++;
        }
      }
    }

    res.json({ success: true, total, today });
  } catch (error) {
    console.error('Backfill picking order IDs error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/picking/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const fieldMap = {
      foNumber: 'fo', accountName: 'account_name', blNumber: 'bl',
      pickerCode: 'picker_code', pickerQty: 'qty', stagingArea: 'staging_area',
      startTime: 'start_time', startTimeFormatted: 'start_time_formatted',
      endTime: 'end_time', endTimeFormatted: 'end_time_formatted', duration: 'duration',
      partyCode: 'party_code', totalOrderQty: 'total_order_qty', orderId: 'order_id',
      status: 'status'
    };

    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, col] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(body[key]);
      }
    }

    if (body.status === 'completed' && body.endUser === undefined) {
      fields.push(`end_user = $${idx++}`);
      values.push(req.user.username);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE picking_data SET ${fields.join(', ')} WHERE id = $${idx} RETURNING ${SELECT_COLUMNS}`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Picking record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update picking data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/picking/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM picking_data WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Picking record not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete picking data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PENDING PICKS (drafts / assignments)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/picking/pending
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pending_picks ORDER BY timestamp DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get pending picks error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/picking/pending
router.post('/pending', authenticateToken, async (req, res) => {
  try {
    const {
      id, fo, account_name, bl, picker_code, qty,
      staging_area, assigned_user, timestamp, party_code, total_order_qty
    } = req.body;

    const pickId = id || `PP-${Date.now()}`;

    const result = await pool.query(
      `INSERT INTO pending_picks (
        id, fo, account_name, bl, picker_code, qty,
        staging_area, assigned_user, timestamp, party_code, total_order_qty
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET
        fo = EXCLUDED.fo, account_name = EXCLUDED.account_name,
        bl = EXCLUDED.bl, picker_code = EXCLUDED.picker_code,
        qty = EXCLUDED.qty, staging_area = EXCLUDED.staging_area,
        assigned_user = EXCLUDED.assigned_user, timestamp = EXCLUDED.timestamp,
        party_code = EXCLUDED.party_code, total_order_qty = EXCLUDED.total_order_qty
      RETURNING *`,
      [pickId, fo, account_name, bl, picker_code, qty || 0,
       staging_area, assigned_user, timestamp, party_code, total_order_qty || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create pending pick error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/picking/pending/:id
router.delete('/pending/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM pending_picks WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending pick not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete pending pick error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/picking/pending/:id/complete — move pending pick to completed
router.post('/pending/:id/complete', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { end_time, duration, end_user, order_id } = req.body;

    await client.query('BEGIN');

    const pendingResult = await client.query('SELECT * FROM pending_picks WHERE id = $1', [id]);
    if (pendingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending pick not found' });
    }

    const pp = pendingResult.rows[0];

    const pickResult = await client.query(
      `INSERT INTO picking_data (
        fo, account_name, bl, picker_code, qty, staging_area,
        start_time, end_time, duration, start_user, end_user,
        party_code, total_order_qty, order_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [pp.fo, pp.account_name, pp.bl, pp.picker_code, pp.qty, pp.staging_area,
       pp.timestamp, end_time, duration, pp.assigned_user, end_user || req.user.username,
       pp.party_code, pp.total_order_qty, order_id || '']
    );

    await client.query('DELETE FROM pending_picks WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json(pickResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Complete pending pick error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
