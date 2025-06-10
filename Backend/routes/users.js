const express = require('express');
const pool = require('../db/connect');
const router = express.Router();


router.post('/', async (req, res) => {
  const { name, email, mood, denomination_id } = req.body;

  try {
    // 1. Check if any user already has this email
    const userCheck = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (userCheck.rows.length > 0) {
      const existingUser = userCheck.rows[0];

      // 2a. If same name matches, allow updating denomination + mood
      if (existingUser.name === name) {
        const updates = [];
        const params = [];

        // Only update denomination_id if different
        if (existingUser.denomination_id !== denomination_id) {
          updates.push(`denomination_id = $${updates.length + 1}`);
          params.push(denomination_id);
        }
        // Only update mood if different
        if (existingUser.mood !== mood) {
          updates.push(`mood = $${updates.length + 1}`);
          params.push(mood);
        }

        if (updates.length > 0) {
          // Append email as the last param
          params.push(email);
          const queryText = `
            UPDATE users
            SET ${updates.join(', ')}
            WHERE email = $${params.length}
            RETURNING id, name, email, mood, denomination_id
          `;
          const updateRes = await pool.query(queryText, params);
          return res.json(updateRes.rows[0]);
        }

        // No changes needed; just return the existing user record
        return res.json({
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          mood: existingUser.mood,
          denomination_id: existingUser.denomination_id
        });
      }

      // 2b. Email belongs to a different name → reject
      return res
        .status(400)
        .json({ error: 'Email already exists with another user.' });
    }

    // 3. No user with this email → insert a brand‐new record
    const insertRes = await pool.query(
      `
      INSERT INTO users (name, email, mood, denomination_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, mood, denomination_id
      `,
      [name, email, mood, denomination_id]
    );

    return res.json(insertRes.rows[0]);
  } catch (err) {
    console.error('Error in POST /api/users:', err.message);
    return res.status(500).json({ error: 'User creation failed' });
  }
});

/**
 * POST /api/users/login
 * Log in a user by email.
 * If found, return { id, name, email, mood, denomination_id }.
 * If not found, return 404.
 */
router.post('/login', async (req, res) => {
  const { email } = req.body;

  try {
    const userRes = await pool.query(
      `SELECT id, name, email, mood, denomination_id
       FROM users
       WHERE email = $1`,
      [email]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(userRes.rows[0]);
  } catch (err) {
    console.error('Error in POST /api/users/login:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * PUT /api/users/:id/mood
 * Update the mood for user with given id.
 * Request body: { mood: 'new mood' }
 */
router.put('/:id/mood', async (req, res) => {
  const { id } = req.params;
  const { mood } = req.body;

  try {
    const updateRes = await pool.query(
      `UPDATE users
       SET mood = $1
       WHERE id = $2
       RETURNING id, name, email, mood, denomination_id`,
      [mood, id]
    );
    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(updateRes.rows[0]);
  } catch (err) {
    console.error('Error in PUT /api/users/:id/mood:', err.message);
    return res.status(500).json({ error: 'Mood update failed' });
  }
});

/**
 * PUT /api/users/:id/denomination
 * Update the denomination_id for user with given id.
 * Request body: { denomination_id: 3 }
 */
router.put('/:id/denomination', async (req, res) => {
  const { id } = req.params;
  const { denomination_id } = req.body;

  try {
    const updateRes = await pool.query(
      `UPDATE users
       SET denomination_id = $1
       WHERE id = $2
       RETURNING id, name, email, mood, denomination_id`,
      [denomination_id, id]
    );
    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(updateRes.rows[0]);
  } catch (err) {
    console.error('Error in PUT /api/users/:id/denomination:', err.message);
    return res.status(500).json({ error: 'Denomination update failed' });
  }
});

module.exports = router;
