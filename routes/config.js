const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/config
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM config');
    const config = {};
    result.rows.forEach(row => { config[row.key] = row.value; });
    res.json(config);
  } catch (error) {
    console.error('Get config error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/config/:key
router.get('/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const result = await pool.query('SELECT * FROM config WHERE key = $1', [key]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Config key not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get config key error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/config/:key
router.put('/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const result = await pool.query(
      'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2 RETURNING *',
      [key, JSON.stringify(value)]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update config error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
