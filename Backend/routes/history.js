const express = require('express');
const pool = require('../db/connect');
const router = express.Router();

router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(`
      SELECT id, user_message, ai_response, bible_verses, created_at
      FROM chat_history
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error('History error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
