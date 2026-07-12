const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/outbound-bl
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { fo, account } = req.query;
    let query = 'SELECT * FROM outbound_bl_data';
    const conditions = [];
    const values = [];
    let idx = 1;

    if (fo) {
      conditions.push(`fo ILIKE $${idx++}`);
      values.push(`%${fo}%`);
    }
    if (account) {
      conditions.push(`account ILIKE $${idx++}`);
      values.push(`%${account}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY id DESC';
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Get outbound BL data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/outbound-bl
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { bl, date, account, fo, po, operator_qty, picker_qty, synced_at } = req.body;

    const result = await pool.query(
      `INSERT INTO outbound_bl_data (bl, date, account, fo, po, operator_qty, picker_qty, synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [bl, date, account, fo, po, operator_qty || 0, picker_qty || 0, synced_at]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create outbound BL error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/outbound-bl/bulk — bulk upsert BL data
router.post('/bulk', authenticateToken, async (req, res) => {
  try {
    const { records } = req.body;
    if (!records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Array of records required' });
    }

    const inserted = [];
    for (const rec of records) {
      const result = await pool.query(
        `INSERT INTO outbound_bl_data (bl, date, account, fo, po, operator_qty, picker_qty, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [rec.bl, rec.date, rec.account, rec.fo, rec.po,
         rec.operator_qty || 0, rec.picker_qty || 0, rec.synced_at || new Date().toISOString()]
      );
      inserted.push(result.rows[0]);
    }

    res.status(201).json({ success: true, count: inserted.length, records: inserted });
  } catch (error) {
    console.error('Bulk create outbound BL error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/outbound-bl/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const columns = ['bl', 'date', 'account', 'fo', 'po', 'operator_qty', 'picker_qty', 'synced_at'];

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
      `UPDATE outbound_bl_data SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'BL record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update outbound BL error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/outbound-bl/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM outbound_bl_data WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'BL record not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete outbound BL error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
