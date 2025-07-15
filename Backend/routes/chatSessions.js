// AiPreacher/Backend/routes/chatSessions.js

const express = require("express");
const pool = require("../db/connect");
const router = express.Router();


router.get("/", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId parameter" });
  }
  try {
    const query = `
      SELECT session_id::text, title, created_at, updated_at
      FROM chat_sessions
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `;
    const result = await pool.query(query, [userId]);
    return res.json(result.rows);
  } catch (err) {
    console.error("Error fetching chat sessions:", err);
    return res.status(500).json({ error: "Failed to fetch chat sessions" });
  }
});

router.post("/", async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId in body" });
  }
  try {
    const insertQuery = `
      INSERT INTO chat_sessions (user_id)
      VALUES ($1)
      RETURNING session_id::text, title, created_at, updated_at
    `;
    const result = await pool.query(insertQuery, [userId]);
    const session = result.rows[0];
    return res.status(201).json(session);
  } catch (err) {
    console.error("Error creating new chat session:", err);
    return res.status(500).json({ error: "Failed to create chat session" });
  }
});


router.patch("/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId;
  const { title } = req.body;
  if (!title || typeof title !== "string") {
    return res.status(400).json({ error: "Missing or invalid title" });
  }
  try {
    const updateQuery = `
      UPDATE chat_sessions
      SET title = $1, updated_at = now()
      WHERE session_id = $2
      RETURNING session_id::text, title, created_at, updated_at
    `;
    const result = await pool.query(updateQuery, [title.trim(), sessionId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("Error renaming chat session:", err);
    return res.status(500).json({ error: "Failed to rename session" });
  }
});


router.delete("/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId;
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId parameter" });
  }
  try {

    const checkQuery = `
      SELECT 1 FROM chat_sessions WHERE session_id = $1 AND user_id = $2
    `;
    const checkRes = await pool.query(checkQuery, [sessionId, userId]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: "Session not found for this user" });
    }

    await pool.query(
      `DELETE FROM chat_history WHERE session_id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
   
    await pool.query(`DELETE FROM chat_sessions WHERE session_id = $1`, [
      sessionId,
    ]);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting chat session:", err);
    return res.status(500).json({ error: "Failed to delete session" });
  }
});

module.exports = router;
