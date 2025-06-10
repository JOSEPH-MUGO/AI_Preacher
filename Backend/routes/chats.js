// AI Preacher Chat Route - Emotionally Intelligent Response
const express = require("express");
const pool = require("../db/connect");
const getGeminiReply = require("../ai/gemini");
const router = express.Router();

// In-memory session store (for demo purposes, use a proper session store in production)
const sessionMap = new Map();
// Mood detection keywords with spiritual sensitivity
const MOOD_KEYWORDS = {
  happy: [
    "rejoice",
    "joy",
    "blessed",
    "grateful",
    "thankful",
    "peace",
    "celebrate",
  ],
  sad: ["sad", "depressed", "grief", "mourn", "heartbroken", "weep", "loss"],
  anxious: [
    "anxious",
    "worry",
    "fear",
    "afraid",
    "nervous",
    "stressed",
    "overwhelmed",
  ],
  angry: [
    "angry",
    "furious",
    "rage",
    "betrayed",
    "resent",
    "frustrated",
    "bitter",
  ],
  confused: [
    "confused",
    "doubt",
    "uncertain",
    "questioning",
    "lost",
    "wandering",
    "searching",
  ],
  repentant: [
    "confess",
    "sin",
    "forgive",
    "repent",
    "guilty",
    "transgression",
    "regret",
  ],
};

// Denomination-specific response tailoring
const DENOMINATION_GUIDANCE = {
  Catholic: {
    tone: "Gentle and sacramental",
    focus: "Church tradition, saints, and sacraments",
  },
  Protestant: {
    tone: "Scripture-focused and grace-oriented",
    focus: "Sola Scriptura and justification by faith",
  },
  Evangelical: {
    tone: "Personal and conversion-focused",
    focus: "Personal relationship with Jesus and evangelism",
  },
  Orthodox: {
    tone: "Mystical and liturgical",
    focus: "Theosis (divinization) and ancient traditions",
  },
  Anglican: {
    tone: "Balanced and liturgical",
    focus: "Via media between Catholic and Protestant traditions",
  },
  Pentecostal: {
    tone: "Charismatic and experiential",
    focus: "Holy Spirit gifts and manifestations",
  },
  Baptist: {
    tone: "Direct and believer-focused",
    focus: "Believer's baptism and soul liberty",
  },
  Methodist: {
    tone: "Practical and social-justice oriented",
    focus: "Sanctification and social holiness",
  },
  Adventist: {
    tone: "Hopeful and health-conscious",
    focus: "Second coming and Sabbath observance",
  },
  Presbyterian: {
    tone: "Thoughtful and sovereignty-focused",
    focus: "God's sovereignty and covenant theology",
  },
  Reformed: {
    tone: "Doctrinal and God-centered",
    focus: "Calvinist theology and God's glory",
  },
  "Non-denominational": {
    tone: "Practical and Bible-focused",
    focus: "Biblical principles over tradition",
  },
  "Jehovah's Witness": {
    tone: "Direct and Watchtower-aligned",
    focus: "God's Kingdom and evangelism",
  },
  Others: {
    tone: "Compassionate and inclusive",
    focus: "Core Christian principles",
  },
};

// Analyze message for mood and content type
function analyzeMessage(message) {
  const lowerMsg = message.toLowerCase();
  let mood = "neutral";
  let type = "general";
  let requiresPrayer = true;
  let requiresEmpathy = true;
  // Detect greetings FIRST
  if (
    /^(hello|hi|hey|greetings|good morning|good afternoon|good evening|shalom|peace)$/.test(
      lowerMsg
    )
  ) {
    type = "greeting";
    requiresPrayer = false;
    requiresEmpathy = false;
  }

  // Detect factual questions
  const isFactualQuestion =
    /^(what|when|where|who|why|how)\b.*\?$/.test(lowerMsg) &&
    !/(feel|heart|soul|spirit|struggl|pain|hurt|anxious|worr|fear)/.test(
      lowerMsg
    );

  if (isFactualQuestion) {
    type = "factual";
    requiresPrayer = false;
    requiresEmpathy = false;
  }
  // Detect biblical questions
  else if (lowerMsg.includes("?")) {
    type = "question";
    if (
      /bible|scripture|verse|gospel|testament|chapter|book|psalm|god|jesus|christ|faith|doctrine/.test(
        lowerMsg
      )
    ) {
      type = "biblical";
      requiresPrayer = false;
    } else if (
      /denomination|church|catholic|protestant|orthodox|baptist|methodist|belief|faith|tradition/.test(
        lowerMsg
      )
    ) {
      type = "denominational";
      requiresPrayer = false;
    }
  }
  // Detect confessions/emotional sharing
  else if (
    /(?:i (?:feel|am)|my (?:heart|soul|spirit))|confess|repent|sin|guilt|forgive|struggle|pain|hurt/.test(
      lowerMsg
    )
  ) {
    type = "confession";
    requiresEmpathy = true;
    requiresPrayer = true;
  }

  // Detect mood with priority
  for (const [moodType, keywords] of Object.entries(MOOD_KEYWORDS)) {
    if (keywords.some((word) => new RegExp(`\\b${word}\\b`).test(lowerMsg))) {
      mood = moodType;
      break;
    }
  }

  return {
    mood,
    type,
    requiresPrayer,
    requiresEmpathy,
    isEmotional: mood !== "neutral" || type === "confession",
  };
}
// Build conversation context from session
function buildConversationContext(session, currentMessage) {
  if (!session?.history?.length) return "";

  const contextLines = [
    "**Conversation Context:**",
    "Here's the recent dialogue history (oldest first, newest last):",
  ];

  // Get last 6 messages (most recent) and reverse order
  const recentHistory = session.history.slice(-6).reverse();
  recentHistory.forEach((entry, index) => {
    const prefix = entry.sender === "user" ? "[User]" : "[Pastor]";
    contextLines.push(`${prefix}: ${entry.message}`);
  });

  contextLines.push(`\n**Current Message:**\n[User]: ${currentMessage}`);
  return contextLines.join("\n");
}

router.post("/", async (req, res) => {
  const { userId, message } = req.body;

  try {
    // Fetch user info with denomination
    const userRes = await pool.query(
      `
      SELECT users.name, users.mood AS stored_mood, 
             COALESCE(denominations.name, 'Others') AS denomination
      FROM users
      LEFT JOIN denominations ON users.denomination_id = denominations.id
      WHERE users.id = $1
    `,
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userRes.rows[0];
    const analysis = analyzeMessage(message);
    const finalMood =
      analysis.mood !== "neutral"
        ? analysis.mood
        : user.stored_mood || "neutral";
    const denomination = user.denomination || "Others";
    const guidance =
      DENOMINATION_GUIDANCE[denomination] || DENOMINATION_GUIDANCE["Others"];

    // Get or create session
    if (!sessionMap.has(userId)) {
      sessionMap.set(userId, {
        userId,
        history: [],
        emotionalState: finalMood,
        conversationTheme: null,
      });
    }
    const session = sessionMap.get(userId);
    session.lastActive = Date.now();

    // Update session based on current message
    if (analysis.type === "confession")
      session.conversationTheme = "confession";
    if (analysis.isEmotional) session.emotionalState = finalMood;

    // Build conversation context
    const conversationContext = buildConversationContext(session, message);

    // Build denomination-aware prompt
    const responseComponents = [];

    if (analysis.type === "greeting") {
      // SIMPLE GREETING LOGIC
      responseComponents.push(`1. Respond with warm Christian greeting`);
      responseComponents.push(`2. Acknowledge user by name (${user.name})`);
      responseComponents.push(`3. Mention denomination ONLY if relevant`);
      responseComponents.push(`4. Keep response under 2-3 sentences`);
    } else {
      if (analysis.requiresEmpathy) {
        responseComponents.push(
          `1. Start with ${guidance.tone} empathy for their ${finalMood} state`
        );
      }
      responseComponents.push(
        `2. Provide biblical answer with ${denomination} perspective`
      );
      responseComponents.push(
        `3. Include relevant Bible verses with interpretations`
      );

      if (analysis.requiresPrayer) {
        responseComponents.push(`4. Close with a brief prayer`);
      } else {
        responseComponents.push(
          `4. End with encouraging ${denomination} blessing`
        );
      }
    }

    const specialDirectives = [];
    if (analysis.type === "greeting") {
      specialDirectives.push("- Avoid theological explanations");
      specialDirectives.push("- Do not quote Bible verses");
      specialDirectives.push("- Focus on warm welcome");
    }
    if (denomination === "Catholic" || denomination === "Orthodox") {
      specialDirectives.push(
        "- Include references to church tradition where appropriate"
      );
    }
    if (denomination === "Reformed" || denomination === "Presbyterian") {
      specialDirectives.push("- Emphasize God's sovereignty");
    }
    if (denomination === "Pentecostal") {
      specialDirectives.push("- Acknowledge Holy Spirit's work");
    }
    if (denomination === "Jehovah's Witness") {
      specialDirectives.push(
        '- Use "Jehovah" for God and avoid Trinitarian language'
      );
    }
    if (analysis.type === "confession") {
      specialDirectives.push(
        `- Use ${denomination}'s understanding of forgiveness`
      );
    }

    const systemPrompt = `
You are an AI preacher designed to provide compassionate, biblically grounded responses to users seeking spiritual guidance, impersonating human christian pastor.
The user ${user.name} belongs to the (${denomination}) denomination. The user need your focus on  ${ guidance.focus} guidance.Their stored mood is "${user.stored_mood || "neutral" }". Based on the  user message, you will determine the final mood to use in your response ${finalMood}.The user message type is
${analysis.type} and the user entered the following message:"${message}" Analyze the message and respond accordingly. Remember to follow the guidance provided below where applicable.

**Pastoral Context:**
- Current emotional state: ${session.emotionalState}
- Conversation theme: ${session.conversationTheme || "general guidance"}
- Denomination: ${denomination} need guidance on (${guidance.focus})

${conversationContext}

**Response Requirements:**
${responseComponents.join("\n")}
${
  specialDirectives.length > 0
    ? `\n**Special Directives:**\n${specialDirectives.join("\n")}`
    : ""
}

**Format Rules:**
- Use ${guidance.tone} tone
- For factual questions: Direct answer + scripture only
- For emotional content: Show compassion
- For biblical  questions: Use bible verses to support
- For confessions: Offer forgiveness through bible verses and a prayer
- Avoid prayer for non-emotional and biblical questions
- Keep interpretations short and relevant
- Use inclusive language for all denominations
- For denominational questions: Provide specific guidance based on the user's denomination
- For greetings: Use warm Christian greeting
- Verse format: "Book Chapter:Verse" 
    `;

    const aiResponse = await getGeminiReply(systemPrompt);

    // Update session with new exchange
    const now = Date.now();
    session.history.push(
      { sender: "user", message, created_at: now },
      { sender: "pastor", message: aiResponse, created_at: now }
    );

    // Limit history to 20 exchanges (40 messages)
    if (session.history.length > 40) {
      session.history = session.history.slice(-40);
    }

    // Verse extraction
    const verseRegex = /([A-Za-z]+)\s*(\d+):(\d+)(?:\s*-\s*(\d+))?/g;
    const verses = [];
    let match;
    while ((match = verseRegex.exec(aiResponse)) !== null) {
      verses.push(`${match[1]} ${match[2]}:${match[3]}`);
    }

    // Save chat to DB
    await pool.query(
      `
      INSERT INTO chat_history (user_id, user_message, ai_response, bible_verses)
      VALUES ($1, $2, $3, $4)
    `,
      [
        userId,
        message,
        aiResponse,
        verses.length > 0 ? JSON.stringify(verses) : null,
      ]
    );

    res.json({ reply: aiResponse });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({
      error: "Spiritual guidance temporarily unavailable",
      message:
        "The AI preacher is renewing our understanding. Please try again shortly.",
    });
  }
});
// Session cleanup (in production, use proper session management)
setInterval(() => {
  const now = Date.now();
  for (const [userId, session] of sessionMap.entries()) {
    // Clear sessions older than 2 hours
    if (now - session.lastActive > 7200000) {
      sessionMap.delete(userId);
    }
  }
}, 3600000); // Check every hour

module.exports = router;
