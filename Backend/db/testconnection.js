const pool = require('../db/connect');

async function createUser() {
  try {
    const res = await pool.query(
      `INSERT INTO users (name, email, mood, denomination_id) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      ['Joseph Mugo', 'josephithanwa@gmail.com', 'Anxious', 5] 
    );
    console.log('User created:', res.rows[0]);
  } catch (err) {
    console.error('Error inserting user:', err.message);
  } finally {
    pool.end(); // always close the connection pool
  }
}

createUser();
