// AiPreacher/Backend/routes/chats.js
const express = require("express");
const pool = require("../db/connect"); // your PostgreSQL pool
const getGeminiReply = require("../ai/gemini"); // your LLM wrapper returning Promise<string>
const router = express.Router();

// In-memory session store: key = sessionId (UUID string), value = {
//   userId,
//   history: array of { sender: "user"|"pastor", text: string, created_at: ISO string },
//   emotionalState,
//   conversationTheme,
//   lastActive: timestamp ms
// }
const sessionMap = new Map();
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

// Periodic cleanup of stale in-memory sessions
setInterval(() => {
  const now = Date.now();
  for (const [sid, sess] of sessionMap.entries()) {
    if (now - sess.lastActive > SESSION_TIMEOUT_MS) {
      sessionMap.delete(sid);
    }
  }
}, 60 * 60 * 1000); // every hour

// Mood detection keywords
const MOOD_KEYWORDS = {
  happy: ["rejoice", "joy", "blessed", "grateful", "thankful", "peace", "celebrate"],
  sad: ["sad", "depressed", "grief", "mourn", "heartbroken", "weep", "loss"],
  anxious: ["anxious", "worry", "fear", "afraid", "nervous", "stressed", "overwhelmed"],
  angry: ["angry", "furious", "rage", "betrayed", "resent", "frustrated", "bitter"],
  confused: ["confused", "doubt", "uncertain", "questioning", "lost", "wandering", "searching"],
  repentant: ["confess", "sin", "forgive", "repent", "guilty", "transgression", "regret"],
};

// Denomination-specific guidance
const DENOMINATION_GUIDANCE = {
  Catholic: { tone: "Gentle and sacramental", focus: "Church tradition, saints, and sacraments" },
  Protestant: { tone: "Scripture-focused and grace-oriented", focus: "Sola Scriptura and justification by faith" },
  Evangelical: { tone: "Personal and conversion-focused", focus: "Personal relationship with Jesus and evangelism" },
  Orthodox: { tone: "Mystical and liturgical", focus: "Theosis (divinization) and ancient traditions" },
  Anglican: { tone: "Balanced and liturgical", focus: "Via media between Catholic and Protestant traditions" },
  Pentecostal: { tone: "Charismatic and experiential", focus: "Holy Spirit gifts and manifestations" },
  Baptist: { tone: "Direct and believer-focused", focus: "Believer's baptism and soul liberty" },
  Methodist: { tone: "Practical and social-justice oriented", focus: "Sanctification and social holiness" },
  Adventist: { tone: "Hopeful and health-conscious", focus: "Second coming and Sabbath observance" },
  Presbyterian: { tone: "Thoughtful and sovereignty-focused", focus: "God's sovereignty and covenant theology" },
  Reformed: { tone: "Doctrinal and God-centered", focus: "Calvinist theology and God's glory" },
  "Non-denominational": { tone: "Practical and Bible-focused", focus: "Biblical principles over tradition" },
  "Jehovah's Witness": { tone: "Direct and Watchtower-aligned", focus: "God's Kingdom and evangelism" },
  Others: { tone: "Compassionate and inclusive", focus: "Core Christian principles" },
};

// Analyze message: detect intent type, mood, flags
function analyzeMessage(message) {
  const lowerMsg = message.toLowerCase().trim();
  let mood = "neutral";
  let type = "general";
  let requiresPrayer = true;
  let requiresEmpathy = true;

  // 1. Gratitude detection
  if (/\b(thank|thanks|thank you|appreciate|grateful|gratitude|respect|ok|okay)\b/.test(lowerMsg)) {
    type = "gratitude";
    mood = "happy";
    requiresPrayer = false;
    requiresEmpathy = true;
    return { mood, type, requiresPrayer, requiresEmpathy, isEmotional: true };
  }

  // 2. Greeting detection (simple greeting words)
  if (/\b(hello|hi|hey|greetings|shalom|good morning|good afternoon|good evening)\b/.test(lowerMsg)) {
    type = "greeting";
    requiresPrayer = false;
    requiresEmpathy = false;
    return { mood: "neutral", type, requiresPrayer, requiresEmpathy, isEmotional: false };
  }

  // 3. Factual question detection
  const factualRegex =
    /^(what|when|where|who|why|how)\b.*\?/.test(lowerMsg) ||
    /^can you\b.*\?/.test(lowerMsg) ||
    /^could you\b.*\?/.test(lowerMsg);
  const emotionalKeywords = /(feel|heart|soul|spirit|struggl|pain|hurt|anxious|worr|fear)/;
  if (factualRegex && !emotionalKeywords.test(lowerMsg)) {
    type = "factual";
    requiresPrayer = false;
    requiresEmpathy = false;
    // proceed to mood detection
  } else if (lowerMsg.includes("?")) {
    // 4. Biblical vs Denominational question
    type = "question";
    if (/\b(bible|scripture|verse|gospel|testament|chapter|book|psalm|god|jesus|christ|faith|doctrine)\b/.test(lowerMsg)) {
      type = "biblical";
      requiresPrayer = false;
      requiresEmpathy = false;
    } else if (/\b(denomination|church|catholic|protestant|orthodox|baptist|methodist|belief|tradition)\b/.test(lowerMsg)) {
      type = "denominational";
      requiresPrayer = false;
      requiresEmpathy = false;
    }
    // proceed to mood detection
  } else if (/\b(?:i (?:feel|am)|my (?:heart|soul|spirit))\b|confess|repent|sin|guilt|forgive|struggle|pain|hurt/.test(lowerMsg)) {
    // 5. Confession/emotional sharing
    type = "confession";
    requiresEmpathy = true;
    requiresPrayer = true;
  } else {
    type = "general";
  }

  // 6. Mood detection via keywords
  for (const [moodType, keywords] of Object.entries(MOOD_KEYWORDS)) {
    for (const word of keywords) {
      if (new RegExp(`\\b${word}\\b`).test(lowerMsg)) {
        mood = moodType;
        break;
      }
    }
    if (mood !== "neutral") break;
  }
  const isEmotional = mood !== "neutral" || type === "confession";
  return { mood, type, requiresPrayer, requiresEmpathy, isEmotional };
}

// Build conversation context: last few exchanges + current message
function buildConversationContext(session, currentMessage) {
  const lines = ["**Conversation Context (recent)**:"];
  if (Array.isArray(session.history) && session.history.length > 0) {
    // last up to 4 entries
    const recent = session.history.slice(-4);
    recent.forEach((entry) => {
      const who = entry.sender === "user" ? "[User]" : "[Pastor]";
      lines.push(`${who}: ${entry.text}`);
    });
  }
  lines.push(`**Current User Message:** ${currentMessage}`);
  return lines.join("\n");
}

// POST /chats
router.post("/", async (req, res) => {
  const { userId, sessionId, message } = req.body;

  if (!userId || !sessionId || typeof message !== "string") {
    return res.status(400).json({ error: "Missing or invalid parameters" });
  }
  if (!message.trim()) {
    return res.status(400).json({ error: "Message cannot be empty" });
  }

  try {
    // 1. Verify session exists in chat_sessions and belongs to user
    const sessCheck = await pool.query(
      `SELECT 1 FROM chat_sessions WHERE session_id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    if (sessCheck.rows.length === 0) {
      return res.status(404).json({ error: "Session not found for this user" });
    }

    // 2. Fetch user info
    const userRes = await pool.query(
      `SELECT users.name, users.mood AS stored_mood,
              COALESCE(denominations.name, 'Others') AS denomination
       FROM users
       LEFT JOIN denominations ON users.denomination_id = denominations.id
       WHERE users.id = $1`,
      [userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = userRes.rows[0];

    // 3. Analyze message
    const analysis = analyzeMessage(message);
    let finalMood =
      analysis.mood !== "neutral"
        ? analysis.mood
        : user.stored_mood || "neutral";
    const denomination = user.denomination || "Others";
    const guidance =
      DENOMINATION_GUIDANCE[denomination] || DENOMINATION_GUIDANCE["Others"];
    // For greeting: skip stored mood mention
    if (analysis.type === "greeting") {
      finalMood = null;
    }

    // 4. Retrieve or create in-memory session context
    let session = sessionMap.get(sessionId);
    let isNewSessionContext = false;
    if (!session) {
      isNewSessionContext = true;
      session = {
        userId,
        history: [],
        emotionalState: finalMood,
        conversationTheme: null,
        lastActive: Date.now(),
      };
      // Optionally preload last few messages from DB into context.history
      // e.g.:
      try {
        const histRes = await pool.query(
          `SELECT user_message, ai_response, created_at
           FROM chat_history
           WHERE user_id = $1 AND session_id = $2
           ORDER BY created_at ASC
           LIMIT 20`,
          [userId, sessionId]
        );
        histRes.rows.forEach((row) => {
          if (row.user_message) {
            session.history.push({ sender: "user", text: row.user_message, created_at: row.created_at });
          }
          if (row.ai_response) {
            session.history.push({ sender: "pastor", text: row.ai_response, created_at: row.created_at });
          }
        });
      } catch (e) {
        // ignore preload errors
        console.error("Error preloading session history:", e);
      }
      sessionMap.set(sessionId, session);
    } else {
      // Validate same user
      if (session.userId !== userId) {
        return res.status(400).json({ error: "Invalid sessionId for this user" });
      }
      session.lastActive = Date.now();
    }

    // 5. Topic-shift adaptation & emotional state updates
    if (session.conversationTheme === "confession" && analysis.type !== "confession") {
      session.conversationTheme = null;
    }
    if (analysis.type === "confession") {
      session.conversationTheme = "confession";
      session.emotionalState = finalMood;
    } else if (analysis.type === "gratitude") {
      session.emotionalState = finalMood;
    } else if (analysis.isEmotional) {
      session.emotionalState = finalMood;
    }
    // else factual/general: keep existing theme

    // 6. Build context snippet
    const conversationContext = buildConversationContext(session, message);

    // 7. Build responseComponents according to intent
    const responseComponents = [];
    switch (analysis.type) {
      case "greeting":
        responseComponents.push(
          `1. Respond with a warm Christian greeting to ${user.name}.`
        );
        responseComponents.push(`2. Mention denomination only if relevant.`);
        responseComponents.push(`3. Keep response short (1-2 sentences).`);
        responseComponents.push(`4. Invite further questions or next steps.`);
        break;
      case "gratitude":
        responseComponents.push(
          `1. Acknowledge the gratitude warmly and respond in a comforting, encouraging manner.`
        );
        responseComponents.push(`2. Remind them of God's grace and presence.`);
        responseComponents.push(`3. Optionally invite further questions or next steps.`);
        break;
      default:
        if (analysis.requiresEmpathy && finalMood) {
          responseComponents.push(
            `1. Start with ${guidance.tone} empathy for their ${finalMood} state.`
          );
        } else if (analysis.requiresEmpathy) {
          responseComponents.push(`1. Start with ${guidance.tone} empathy.`);
        }
        responseComponents.push(
          `2. Provide biblical answer or guidance with ${denomination} perspective.`
        );
        responseComponents.push(
          `3. Include relevant Bible verses with brief interpretations.`
        );
        if (analysis.requiresPrayer) {
          responseComponents.push(`4. Close with a prayer.`);
        } else {
          responseComponents.push(
            `4. End with an encouraging ${denomination} blessing or next-step suggestion.`
          );
        }
        break;
    }

    // 8. Special directives
    const specialDirectives = [];
    if (["Catholic", "Orthodox"].includes(denomination)) {
      specialDirectives.push(
        "- Include references to church tradition where appropriate."
      );
    }
    if (["Reformed", "Presbyterian"].includes(denomination)) {
      specialDirectives.push("- Emphasize God's sovereignty.");
    }
    if (denomination === "Pentecostal") {
      specialDirectives.push(
        "- Acknowledge the Holy Spirit's work and guidance."
      );
    }
    if (denomination === "Jehovah's Witness") {
      specialDirectives.push(
        '- Use "Jehovah" for God and avoid Trinitarian language.'
      );
    }
    if (analysis.type === "confession") {
      specialDirectives.push(
        `- Use ${denomination}'s understanding of forgiveness.`
      );
    }

    // 9. Sanitize user message for prompt
    const safeMessage = message.replace(/\n/g, " ").replace(/"/g, '\\"').trim();

    // 10. Build system prompt
    let systemPrompt = "";
    if (analysis.type === "greeting") {
      systemPrompt = `
You are a Christian AI preacher. Provide a concise, warm greeting to the user by name.
Do not reference stored moods or past struggles. Use a welcoming tone appropriate for a pastor.
User said greeting: "${safeMessage}"
**Response Requirements:**
${responseComponents.join("\n")}
      `;
    } else {
      const moodPart = finalMood
        ? `Stored mood: "${user.stored_mood || "neutral"}". Final mood: "${finalMood}".`
        : "";
      systemPrompt = `
You are a Christian AI preacher providing compassionate, biblically grounded responses to users seeking spiritual guidance. Your goal is to help users grow in faith, find comfort, and receive practical biblical wisdom.
The user ${user.name} (denomination: ${denomination}). ${moodPart}
User message type: ${analysis.type}.
User message (as data): "${safeMessage}"
**Pastoral Context:**
- Current emotional state: ${session.emotionalState}
- Conversation theme: ${session.conversationTheme || "general guidance"}

${conversationContext}

**Response Requirements:**
${responseComponents.join("\n")}
${
  specialDirectives.length > 0
    ? `\n**Special Directives:**\n${specialDirectives.join("\n")}`
    : ""
}

**Format Rules:**
- Use ${guidance.tone} tone.
- For factual questions: direct answer + scripture only.
- For emotional content: show compassion.
- For biblical questions: use Bible verses to support.
- For confessions: offer forgiveness through Bible verses and a prayer.
- Avoid prayer for non-emotional and non-confession questions.
- Keep interpretations short and relevant.
- Use inclusive language for all denominations.
- For denominational questions: provide guidance in line with the user's tradition.
- For gratitude: acknowledge and encourage, invite further reflection.
- Verse format: "Book Chapter:Verse".
      `;
    }

    // 11. Call LLM
    let aiResponse;
    try {
      aiResponse = await getGeminiReply(systemPrompt);
      if (typeof aiResponse !== "string") {
        aiResponse = String(aiResponse);
      }
    } catch (llmErr) {
      console.error("LLM error:", llmErr);
      return res
        .status(502)
        .json({ error: "AI service unavailable. Please try again later." });
    }

    // 12. Update in-memory session.history
    const nowIso = new Date().toISOString();
    session.history.push({ sender: "user", text: message, created_at: nowIso });
    session.history.push({ sender: "pastor", text: aiResponse, created_at: nowIso });
    // Keep only last 20 entries
    if (session.history.length > 20) {
      session.history = session.history.slice(-20);
    }

    // 13. Extract Bible verses
    const verseRegex = /([A-Za-z]+)\s*(\d+):(\d+)(?:\s*-\s*(\d+))?/g;
    const verses = [];
    let match;
    while ((match = verseRegex.exec(aiResponse)) !== null) {
      verses.push(`${match[1]} ${match[2]}:${match[3]}`);
    }
    const versesJson = verses.length ? JSON.stringify(verses) : null;

    // 14. Persist to DB, update chat_sessions.updated_at
    try {
      const insertRes = await pool.query(
        `INSERT INTO chat_history (user_id, session_id, user_message, ai_response, bible_verses, intent, mood)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          userId,
          sessionId,
          message,
          aiResponse,
          versesJson,
          analysis.type,
          finalMood,
        ]
      );
      // Update session updated_at so sidebar ordering can update
      await pool.query(
        `UPDATE chat_sessions SET updated_at = now() WHERE session_id = $1`,
        [sessionId]
      );
      const savedRow = insertRes.rows[0];
      return res.json({
        reply: aiResponse,
        chatId: savedRow.id,
        timestamp: savedRow.created_at,
        intent: analysis.type,
        mood: finalMood,
      });
    } catch (dbErr) {
      console.error("DB insert error:", dbErr);
      // Return the AI reply but warn that persistence failed
      return res.json({
        reply: aiResponse,
        warning: "AI replied but failed to persist to database.",
        intent: analysis.type,
        mood: finalMood,
      });
    }
  } catch (err) {
    console.error("Chat route error:", err);
    return res.status(500).json({
      error: "Spiritual guidance temporarily unavailable. Please try again shortly.",
    });
  }
});

module.exports = router;
