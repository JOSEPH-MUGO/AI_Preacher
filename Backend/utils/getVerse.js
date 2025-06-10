const fs = require('fs');
const path = require('path');

function formatBookName(bookName) {
  return bookName.replace(/\s+/g, '_');
}

async function getVerse(book, chapter, verse) {
  try {
    const bookFile = formatBookName(book);
    const filePath = path.join(__dirname, `../Bible/${bookFile}.json`);

    if (!fs.existsSync(filePath)) {
      return { error: 'Book not found' };
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Find the chapter object
    const chapterObj = data.chapters.find(c => c.chapter === chapter.toString());
    if (!chapterObj) {
      return { error: 'Chapter not found' };
    }

    // Find the verse object
    const verseObj = chapterObj.verses.find(v => v.verse === verse.toString());
    if (!verseObj) {
      return { error: 'Verse not found' };
    }

    return {
      book: data.book,
      chapter,
      verse,
      text: verseObj.text
    };
  } catch (err) {
    console.error(err);
    return { error: 'Unexpected error' };
  }
}

module.exports = getVerse;
