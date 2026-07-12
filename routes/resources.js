const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// PICKERS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/resources/pickers
router.get('/pickers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pickers ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Get pickers error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/resources/pickers
router.post('/pickers', authenticateToken, async (req, res) => {
  try {
    const { code, name, designation, shift } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }

    const result = await pool.query(
      'INSERT INTO pickers (code, name, designation, shift) VALUES ($1, $2, $3, $4) RETURNING *',
      [code, name, designation || 'Picker', shift || '1st Shift']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Picker code already exists' });
    }
    console.error('Create picker error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/resources/pickers/:id
router.put('/pickers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, designation, shift } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (code !== undefined) { fields.push(`code = $${idx++}`); values.push(code); }
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (designation !== undefined) { fields.push(`designation = $${idx++}`); values.push(designation); }
    if (shift !== undefined) { fields.push(`shift = $${idx++}`); values.push(shift); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE pickers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Picker not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update picker error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/resources/pickers/:id
router.delete('/pickers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM pickers WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Picker not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete picker error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CHECKERS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/resources/checkers
router.get('/checkers', authenticateToken, async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM checkers';
    const params = [];

    if (type) {
      query += ' WHERE type = $1';
      params.push(type);
    }

    query += ' ORDER BY name';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get checkers error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/resources/checkers
router.post('/checkers', authenticateToken, async (req, res) => {
  try {
    const { code, name, shift, type } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Code and name are required' });
    }

    const result = await pool.query(
      'INSERT INTO checkers (code, name, shift, type) VALUES ($1, $2, $3, $4) RETURNING *',
      [code, name, shift || '1st Shift', type || 'Outbound']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Checker code already exists' });
    }
    console.error('Create checker error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/resources/checkers/:id
router.put('/checkers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, shift, type } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (code !== undefined) { fields.push(`code = $${idx++}`); values.push(code); }
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (shift !== undefined) { fields.push(`shift = $${idx++}`); values.push(shift); }
    if (type !== undefined) { fields.push(`type = $${idx++}`); values.push(type); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE checkers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checker not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update checker error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/resources/checkers/:id
router.delete('/checkers/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM checkers WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checker not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete checker error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// STAGING AREAS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/resources/staging-areas
router.get('/staging-areas', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM staging_areas ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Get staging areas error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/resources/staging-areas
router.post('/staging-areas', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      'INSERT INTO staging_areas (name) VALUES ($1) RETURNING *',
      [name]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Staging area already exists' });
    }
    console.error('Create staging area error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/resources/staging-areas/:id
router.put('/staging-areas/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const result = await pool.query(
      'UPDATE staging_areas SET name = $1 WHERE id = $2 RETURNING *',
      [name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Staging area not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update staging area error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/resources/staging-areas/:id
router.delete('/staging-areas/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM staging_areas WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Staging area not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete staging area error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
