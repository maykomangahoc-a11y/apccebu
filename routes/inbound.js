const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// INBOUND MONITORING (active)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/inbound/monitoring
router.get('/monitoring', authenticateToken, async (req, res) => {
  try {
    const { status, type } = req.query;
    let query = 'SELECT * FROM inbound_monitoring';
    const conditions = [];
    const values = [];
    let idx = 1;

    if (status) {
      conditions.push(`status = $${idx++}`);
      values.push(status);
    }
    if (type) {
      conditions.push(`type = $${idx++}`);
      values.push(type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY id DESC';
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Get inbound monitoring error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/inbound/monitoring
router.post('/monitoring', authenticateToken, async (req, res) => {
  try {
    const {
      type, day, trucker, source, identifier, arrival,
      start_time, end_unload, dwell_time, status, release,
      dock_in, docs_receive, jib, checker
    } = req.body;

    const result = await pool.query(
      `INSERT INTO inbound_monitoring (
        type, day, trucker, source, identifier, arrival,
        start_time, end_unload, dwell_time, status, release,
        dock_in, docs_receive, jib, checker
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [type, day, trucker, source, identifier, arrival,
       start_time, end_unload, dwell_time, status, release,
       dock_in, docs_receive, jib, checker]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create inbound monitoring error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/inbound/monitoring/:id
router.put('/monitoring/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const columns = [
      'type', 'day', 'trucker', 'source', 'identifier', 'arrival',
      'start_time', 'end_unload', 'dwell_time', 'status', 'release',
      'dock_in', 'docs_receive', 'jib', 'checker'
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
      `UPDATE inbound_monitoring SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Monitoring record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update inbound monitoring error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/inbound/monitoring/:id
router.delete('/monitoring/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM inbound_monitoring WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Monitoring record not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete inbound monitoring error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/inbound/monitoring/:id/status — quick status change
router.put('/monitoring/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await pool.query(
      'UPDATE inbound_monitoring SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Monitoring record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update monitoring status error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INBOUND MONITORING RECORDS (archive)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/inbound/monitoring/records
router.get('/monitoring/records', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM inbound_monitoring_records ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get monitoring records error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/inbound/monitoring/:id/archive — archive a monitoring entry
router.post('/monitoring/:id/archive', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query('BEGIN');

    const monResult = await client.query('SELECT * FROM inbound_monitoring WHERE id = $1', [id]);
    if (monResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Monitoring record not found' });
    }

    const m = monResult.rows[0];

    await client.query(
      `INSERT INTO inbound_monitoring_records (
        type, day, trucker, source, identifier, arrival,
        start_time, end_unload, dwell_time, status, release,
        dock_in, docs_receive, jib, checker, archived_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [m.type, m.day, m.trucker, m.source, m.identifier, m.arrival,
       m.start_time, m.end_unload, m.dwell_time, m.status, m.release,
       m.dock_in, m.docs_receive, m.jib, m.checker, new Date().toISOString()]
    );

    await client.query('DELETE FROM inbound_monitoring WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.json({ success: true, message: 'Monitoring record archived' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Archive monitoring error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INBOUND DATA
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/inbound/data
router.get('/data', authenticateToken, async (req, res) => {
  try {
    const { month, shift } = req.query;
    let query = 'SELECT * FROM inbound_data';
    const conditions = [];
    const values = [];
    let idx = 1;

    if (month) {
      conditions.push(`month = $${idx++}`);
      values.push(month);
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
    console.error('Get inbound data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/inbound/data
router.post('/data', authenticateToken, async (req, res) => {
  try {
    const {
      gr_date, jib, checking_date, shift, operator, qty, pallets,
      start_putaway, end_putaway, duration, date, time_slot, month
    } = req.body;

    const result = await pool.query(
      `INSERT INTO inbound_data (
        gr_date, jib, checking_date, shift, operator, qty, pallets,
        start_putaway, end_putaway, duration, date, time_slot, month
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [gr_date, jib, checking_date, shift, operator, qty, pallets,
       start_putaway, end_putaway, duration, date, time_slot, month]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create inbound data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/inbound/data/:id
router.put('/data/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const columns = [
      'gr_date', 'jib', 'checking_date', 'shift', 'operator', 'qty', 'pallets',
      'start_putaway', 'end_putaway', 'duration', 'date', 'time_slot', 'month'
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
      `UPDATE inbound_data SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inbound data record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update inbound data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/inbound/data/:id
router.delete('/data/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM inbound_data WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inbound data record not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete inbound data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INBOUND PUTAWAY (separate from main putaway)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/inbound/putaway
router.get('/putaway', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM inbound_putaway ORDER BY id DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get inbound putaway error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/inbound/putaway
router.post('/putaway', authenticateToken, async (req, res) => {
  try {
    const {
      gr_date, jib, checking_date, shift, operator, qty, pallets,
      start_putaway, end_putaway, duration, date, time_slot, month
    } = req.body;

    const result = await pool.query(
      `INSERT INTO inbound_putaway (
        gr_date, jib, checking_date, shift, operator, qty, pallets,
        start_putaway, end_putaway, duration, date, time_slot, month
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [gr_date, jib, checking_date, shift, operator, qty, pallets,
       start_putaway, end_putaway, duration, date, time_slot, month]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create inbound putaway error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
