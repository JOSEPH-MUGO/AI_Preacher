const express = require('express');
const pool = require('../db/connect');
const getGeminiReply = require('../ai/gemini');
const router = express.Router();

router.post('/', async (req, res) => {
  const { userId, message } = req.body;

  try {
    // Fetch user info (name, denomination, mood)
    const userRes = await pool.query(`
      SELECT users.name, mood, denominations.name AS denomination
      FROM users
      JOIN denominations ON users.denomination_id = denominations.id
      WHERE users.id = $1
    `, [userId]);

    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = userRes.rows[0];

    // Build prompt
    const systemPrompt = `
You are a comforting AI preacher. The user ${user.name} belongs to the ${user.denomination} denomination and is feeling ${user.mood}.
They asked: "${message}"
Respond with:
1. Empathy and encouragement
2. A related Bible verse (include book, chapter, verse)
3. A brief interpretation
4. A closing prayer
    `;

    const aiResponse = await getGeminiReply(systemPrompt);

    // Extract verses (rough method for now)
    const verseMatches = aiResponse.match(/[A-Z][a-z]+ \d+:\d+/g); // e.g., John 3:16
    const verses = verseMatches ? JSON.stringify(verseMatches) : null;

    // Save chat to DB
    await pool.query(`
      INSERT INTO chat_history (user_id, user_message, ai_response, bible_verses)
      VALUES ($1, $2, $3, $4)
    `, [userId, message, aiResponse, verses]);

    res.json({ reply: aiResponse });

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
