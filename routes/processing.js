const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ═══════════════════════════════════════════════════════════════════════════
// PROCESSING DATA
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/processing
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { processing_status, fo } = req.query;
    let query = 'SELECT * FROM processing_data';
    const conditions = [];
    const values = [];
    let idx = 1;

    if (processing_status) {
      conditions.push(`processing_status = $${idx++}`);
      values.push(processing_status);
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
    console.error('Get processing data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/processing
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      party_code, account_name, cases, fo, size, trucker, loading_date,
      processing_status, printing_status, pending_skus, unserved,
      uploader, processor, completer, printer, helper,
      upload_timestamp, processed_date, completed_date, printed_date,
      processed_qty, unserved_qty, balance_qty
    } = req.body;

    const result = await pool.query(
      `INSERT INTO processing_data (
        party_code, account_name, cases, fo, size, trucker, loading_date,
        processing_status, printing_status, pending_skus, unserved,
        uploader, processor, completer, printer, helper,
        upload_timestamp, processed_date, completed_date, printed_date,
        processed_qty, unserved_qty, balance_qty
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
      [
        party_code, account_name, cases, fo, size, trucker, loading_date,
        processing_status, printing_status, pending_skus, unserved,
        uploader, processor, completer, printer, helper,
        upload_timestamp, processed_date, completed_date, printed_date,
        processed_qty || 0, unserved_qty || 0, balance_qty || 0
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create processing data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/processing/:id
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const columns = [
      'party_code', 'account_name', 'cases', 'fo', 'size', 'trucker', 'loading_date',
      'processing_status', 'printing_status', 'pending_skus', 'unserved',
      'uploader', 'processor', 'completer', 'printer', 'helper',
      'upload_timestamp', 'processed_date', 'completed_date', 'printed_date',
      'processed_qty', 'unserved_qty', 'balance_qty'
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
      `UPDATE processing_data SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Processing record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update processing data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/processing/:id
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM processing_data WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Processing record not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete processing data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PROCESSING SKU DATA
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/processing/skus
router.get('/skus', authenticateToken, async (req, res) => {
  try {
    const { fo, party_code } = req.query;
    let query = 'SELECT * FROM processing_sku_data';
    const conditions = [];
    const values = [];
    let idx = 1;

    if (fo) {
      conditions.push(`fo ILIKE $${idx++}`);
      values.push(`%${fo}%`);
    }
    if (party_code) {
      conditions.push(`party_code = $${idx++}`);
      values.push(party_code);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY id DESC';
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Get processing SKU data error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/processing/skus
router.post('/skus', authenticateToken, async (req, res) => {
  try {
    const {
      party_code, account_name, fo, sku, qty, status,
      bl, timestamp, sku_user, helper, processed_qty
    } = req.body;

    const result = await pool.query(
      `INSERT INTO processing_sku_data (
        party_code, account_name, fo, sku, qty, status,
        bl, timestamp, sku_user, helper, processed_qty
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [party_code, account_name, fo, sku, qty, status,
       bl, timestamp, sku_user, helper, processed_qty || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create processing SKU error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/processing/skus/:id
router.put('/skus/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const columns = [
      'party_code', 'account_name', 'fo', 'sku', 'qty', 'status',
      'bl', 'timestamp', 'sku_user', 'helper', 'processed_qty'
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
      `UPDATE processing_sku_data SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SKU record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update processing SKU error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/processing/skus/:id
router.delete('/skus/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM processing_sku_data WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SKU record not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete processing SKU error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
