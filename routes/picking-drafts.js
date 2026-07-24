const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// GET /api/picking-drafts — all in-flight assignment drafts, across all FOs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM picking_drafts ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get picking drafts error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/picking-drafts — upsert one or more picker assignment drafts for an FO
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { foNumber, assignments } = req.body;
    if (!foNumber || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'foNumber and assignments are required' });
    }

    const saved = [];
    for (const a of assignments) {
      if (a.id) {
        const updateResult = await pool.query(
          `UPDATE picking_drafts SET
            fo_number = $1, account_name = $2, party_code = $3, total_order_qty = $4,
            bl_number = $5, picker_code = $6, picker_qty = $7, staging_area = $8
           WHERE id = $9 RETURNING *`,
          [foNumber, a.accountName, a.partyCode, a.totalOrderQty || 0,
           a.blNumber, a.pickerCode, a.pickerQty || 0, a.stagingArea, a.id]
        );
        if (updateResult.rows.length > 0) {
          saved.push(updateResult.rows[0]);
          continue;
        }
      }

      const newId = `DRAFT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const insertResult = await pool.query(
        `INSERT INTO picking_drafts (
          id, fo_number, account_name, party_code, total_order_qty,
          bl_number, picker_code, picker_qty, staging_area
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [newId, foNumber, a.accountName, a.partyCode, a.totalOrderQty || 0,
         a.blNumber, a.pickerCode, a.pickerQty || 0, a.stagingArea]
      );
      saved.push(insertResult.rows[0]);
    }

    res.status(201).json(saved);
  } catch (error) {
    console.error('Save picking draft error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/picking-drafts/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM picking_drafts WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete picking draft error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
