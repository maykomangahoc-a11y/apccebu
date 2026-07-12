const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// PUTAWAY DATA (completed)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/putaway
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { jib, shift } = req.query;
    let query = 'SELECT * FROM putaway_data';
    const conditions = [];
    const values = [];
    let idx = 1;

    if (jib) {
      conditions.push(`jib ILIKE $${idx++}`);
      values.push(`%${jib}%`);
    }
    if (shift) {
      conditions.push(`shift = $${idx++}`);
      values.push(shift);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY id DESC';
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Get putaway data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/putaway
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      jib, gr_date, date_duty, shift, operator, qty, pallets,
      start_time, end_time, duration, start_user, end_user, remarks
    } = req.body;

    const result = await pool.query(
      `INSERT INTO putaway_data (
        jib, gr_date, date_duty, shift, operator, qty, pallets,
        start_time, end_time, duration, start_user, end_user, remarks
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [jib, gr_date, date_duty, shift, operator, qty, pallets,
       start_time, end_time, duration, start_user, end_user, remarks]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create putaway data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/putaway/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const columns = [
      'jib', 'gr_date', 'date_duty', 'shift', 'operator', 'qty', 'pallets',
      'start_time', 'end_time', 'duration', 'start_user', 'end_user', 'remarks'
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
      `UPDATE putaway_data SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Putaway record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update putaway data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/putaway/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM putaway_data WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Putaway record not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete putaway data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PENDING PUTAWAY (drafts / assignments)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/putaway/pending
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pending_putaway ORDER BY timestamp DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get pending putaway error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/putaway/pending
router.post('/pending', authenticateToken, async (req, res) => {
  try {
    const { id, jib, gr_date, operator, qty, pallets, assigned_user, timestamp } = req.body;

    const putawayId = id || `PA-${Date.now()}`;

    const result = await pool.query(
      `INSERT INTO pending_putaway (id, jib, gr_date, operator, qty, pallets, assigned_user, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET
         jib = EXCLUDED.jib, gr_date = EXCLUDED.gr_date,
         operator = EXCLUDED.operator, qty = EXCLUDED.qty,
         pallets = EXCLUDED.pallets, assigned_user = EXCLUDED.assigned_user,
         timestamp = EXCLUDED.timestamp
       RETURNING *`,
      [putawayId, jib, gr_date, operator, qty, pallets,
       assigned_user || req.user.username, timestamp || new Date().toISOString()]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create pending putaway error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/putaway/pending/:id
router.delete('/pending/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM pending_putaway WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending putaway not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete pending putaway error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/putaway/pending/:id/complete — move pending to completed
router.post('/pending/:id/complete', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { end_time, duration, end_user, date_duty, shift, remarks } = req.body;

    await client.query('BEGIN');

    const pendingResult = await client.query('SELECT * FROM pending_putaway WHERE id = $1', [id]);
    if (pendingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending putaway not found' });
    }

    const pp = pendingResult.rows[0];

    const putResult = await client.query(
      `INSERT INTO putaway_data (
        jib, gr_date, date_duty, shift, operator, qty, pallets,
        start_time, end_time, duration, start_user, end_user, remarks
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [pp.jib, pp.gr_date, date_duty || '', shift || '', pp.operator, pp.qty, pp.pallets,
       pp.timestamp, end_time, duration, pp.assigned_user, end_user || req.user.username, remarks || '']
    );

    await client.query('DELETE FROM pending_putaway WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json(putResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Complete pending putaway error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
