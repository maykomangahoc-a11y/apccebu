const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/users
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, active, created_at FROM users ORDER BY username'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { username, pin, role } = req.body;
    if (!username || !pin) {
      return res.status(400).json({ error: 'Username and PIN are required' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const result = await pool.query(
      'INSERT INTO users (username, pin, role) VALUES ($1, $2, $3) RETURNING id, username, role, active, created_at',
      [username, pin, role || 'viewer']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/:id
router.put('/:username', authenticateToken, async (req, res) => {
  try {
    const { username: targetUsername } = req.params;
    const { username, pin, role, active } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (username !== undefined) { fields.push(`username = $${idx++}`); values.push(username); }
    if (pin !== undefined) { fields.push(`pin = $${idx++}`); values.push(pin); }
    if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(role); }
    if (active !== undefined) { fields.push(`active = $${idx++}`); values.push(active); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(targetUsername);
    const result = await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE username = $${idx} RETURNING id, username, role, active, created_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:username
router.delete('/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const result = await pool.query('DELETE FROM users WHERE username = $1 RETURNING id', [username]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
