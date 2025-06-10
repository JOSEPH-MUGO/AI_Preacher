const axios = require('axios');

const MODEL_NAME = 'models/gemini-2.0-flash';  
const BASE_URL   = 'https://generativelanguage.googleapis.com/v1';
const ENDPOINT   = `${BASE_URL}/${MODEL_NAME}:generateContent`;

async function getGeminiReply(systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY missing in .env');
    return "API key error.";
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt}\n\n${userPrompt}`
          }
        ]
      }
    ]
  };

  try {
    const url = `${ENDPOINT}?key=${apiKey}`;
    const response = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
      family: 4 // optional, to avoid IPv6 issues
    });

    const text = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || "Sorry, I couldn’t generate a reply.";
  } catch (err) {
    console.error('Gemini API error:', err.response?.data || err.message);
    return "Sorry,I’m having trouble right now.";
  }
}

module.exports = getGeminiReply;
