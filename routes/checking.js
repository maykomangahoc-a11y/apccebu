const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// CHECKING DATA
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/checking
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { order_id, fo } = req.query;
    let query = 'SELECT * FROM checking_data';
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
    console.error('Get checking data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/checking
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { timestamp, order_id, fo, party_code, account_name, qty, checker, checked_qty, log_user } = req.body;

    const result = await pool.query(
      `INSERT INTO checking_data (
        timestamp, order_id, fo, party_code, account_name, qty, checker, checked_qty, log_user
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [timestamp || new Date().toISOString(), order_id, fo, party_code, account_name,
       qty, checker, checked_qty, log_user || req.user.username]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create checking data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/checking/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const columns = ['timestamp', 'order_id', 'fo', 'party_code', 'account_name', 'qty', 'checker', 'checked_qty', 'log_user'];

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
      `UPDATE checking_data SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checking record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update checking data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/checking/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM checking_data WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checking record not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete checking data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCHING DATA
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/checking/dispatching
router.get('/dispatching', authenticateToken, async (req, res) => {
  try {
    const { order_id, fo } = req.query;
    let query = 'SELECT * FROM dispatching_data';
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
    console.error('Get dispatching data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/checking/dispatching
router.post('/dispatching', authenticateToken, async (req, res) => {
  try {
    const { timestamp, order_id, fo, party_code, account_name, qty, dispatcher, log_user } = req.body;

    const result = await pool.query(
      `INSERT INTO dispatching_data (
        timestamp, order_id, fo, party_code, account_name, qty, dispatcher, log_user
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [timestamp || new Date().toISOString(), order_id, fo, party_code, account_name,
       qty, dispatcher, log_user || req.user.username]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create dispatching data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/checking/dispatching/:id
router.put('/dispatching/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const columns = ['timestamp', 'order_id', 'fo', 'party_code', 'account_name', 'qty', 'dispatcher', 'log_user'];

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
      `UPDATE dispatching_data SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispatching record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update dispatching data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/checking/dispatching/:id
router.delete('/dispatching/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM dispatching_data WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispatching record not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete dispatching data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
