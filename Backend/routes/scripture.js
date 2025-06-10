const express = require('express');
const getVerse = require('../utils/getVerse');
const router = express.Router();

router.get('/:book/:chapter/:verse', async (req, res) => {
  const { book, chapter, verse } = req.params;
  const result = await getVerse(book, chapter, verse);
  if (result.error) {
    res.status(404).json({ message: result.error });
  } else {
    res.json(result);
  }
});

module.exports = router;
