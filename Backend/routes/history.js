// AiPreacher/Backend/routes/history.js
const express = require("express");
const pool = require("../db/connect");
const router = express.Router();


router.get("/", async (req, res) => {
  const userId = req.query.userId;
  const sessionId = req.query.sessionId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }
  try {
    let histRes;
    if (sessionId) {
      histRes = await pool.query(
        `SELECT id, session_id, user_message, ai_response, bible_verses, intent, mood, created_at
         FROM chat_history
         WHERE user_id = $1 AND session_id = $2
         ORDER BY created_at ASC`,
        [userId, sessionId]
      );
      if (histRes.rows.length > 0) {
        return res.json(histRes.rows);
      }

    }
    
    histRes = await pool.query(
      `SELECT id, session_id, user_message, ai_response, bible_verses, intent, mood, created_at
       FROM chat_history
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId]
    );
    return res.json(histRes.rows);
  } catch (err) {
    console.error("History fetch error:", err);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});

module.exports = router;
