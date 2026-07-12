const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/items
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { search } = req.query;
    let query = 'SELECT * FROM item_database';
    const params = [];

    if (search) {
      query += ' WHERE sku ILIKE $1 OR material_description ILIKE $1';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY sku';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get items error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/items
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { sku, material_description, palletizing } = req.body;
    if (!sku) {
      return res.status(400).json({ error: 'SKU is required' });
    }

    const result = await pool.query(
      'INSERT INTO item_database (sku, material_description, palletizing) VALUES ($1, $2, $3) RETURNING *',
      [sku, material_description || '', palletizing || '']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'SKU already exists' });
    }
    console.error('Create item error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/items/bulk
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Array of items required' });
    }

    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      try {
        await pool.query(
          'INSERT INTO item_database (sku, material_description, palletizing) VALUES ($1, $2, $3) ON CONFLICT (sku) DO UPDATE SET material_description = EXCLUDED.material_description, palletizing = EXCLUDED.palletizing',
          [item.sku, item.material_description || '', item.palletizing || '']
        );
        inserted++;
      } catch (e) {
        skipped++;
      }
    }

    res.json({ success: true, inserted, skipped });
  } catch (error) {
    console.error('Bulk items error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/items/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { sku, material_description, palletizing } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (sku !== undefined) { fields.push(`sku = $${idx++}`); values.push(sku); }
    if (material_description !== undefined) { fields.push(`material_description = $${idx++}`); values.push(material_description); }
    if (palletizing !== undefined) { fields.push(`palletizing = $${idx++}`); values.push(palletizing); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE item_database SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update item error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/items/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM item_database WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete item error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
