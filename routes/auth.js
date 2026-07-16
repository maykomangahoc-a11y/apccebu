const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, pin } = req.body;
    if (!username || !pin) {
      return res.status(400).json({ error: 'Username and PIN are required' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND pin = $2 AND active = TRUE',
      [username, pin]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'apc-cebu-default-secret-123',
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
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
      'INSERT INTO users (username, pin, role) VALUES ($1, $2, $3) RETURNING *',
      [username, pin, role || 'viewer']
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'apc-cebu-default-secret-123',
      { expiresIn: '24h' }
    );

    res.status(201).json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    console.error('Register error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, active, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Auth me error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
