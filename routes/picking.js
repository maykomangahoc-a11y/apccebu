const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// PICKING DATA (completed picks)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/picking
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { order_id, fo } = req.query;
    let query = 'SELECT * FROM picking_data';
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
      fo, account_name, bl, picker_code, qty, staging_area,
      start_time, end_time, duration, start_user, end_user,
      party_code, total_order_qty, order_id
    } = req.body;

    const result = await pool.query(
      `INSERT INTO picking_data (
        fo, account_name, bl, picker_code, qty, staging_area,
        start_time, end_time, duration, start_user, end_user,
        party_code, total_order_qty, order_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [fo, account_name, bl, picker_code, qty || 0, staging_area,
       start_time, end_time, duration, start_user, end_user,
       party_code, total_order_qty || 0, order_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create picking data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/picking/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const columns = [
      'fo', 'account_name', 'bl', 'picker_code', 'qty', 'staging_area',
      'start_time', 'end_time', 'duration', 'start_user', 'end_user',
      'party_code', 'total_order_qty', 'order_id'
    ];

    const fields = [];
    const values = [];
    let idx = 1;

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
      `UPDATE picking_data SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
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
