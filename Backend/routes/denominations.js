const express = require('express');
const pool = require('../db/connect');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM denominations ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching denominations:', err.message);
    res.status(500).json({ error: 'Could not laod denominations' });
  }
});

module.exports = router;
