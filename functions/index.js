const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
// Restrict CORS to your domains — add your production domain here
const allowedOrigins = [
  "https://projectmate-485110.web.app",
  "https://projectmate-485110.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:5173",
];
const cors = require("cors")({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
});
const crypto = require("crypto");

admin.initializeApp();

const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key not configured on server.");
  return new GoogleGenAI({ apiKey });
};

// ── Simple in-memory rate limiter ──────────────────────────────────────────
// Limits each user to a fixed number of requests per time window.
// For production at scale, replace with Firebase Extensions or Redis.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;  // max 10 requests per minute per user

const checkRateLimit = (userId) => {
  const now = Date.now();
  const key = userId;
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { windowStart: now, count: 1 });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
};

// Periodically clean stale entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 300_000);

// ── System prompt ─────────────────────────────────────────────────────────────
// NOTE: We use <p> and <b> only — NO heading tags.
// The chapter title (h1) and section headings (h2/h3) are injected by the frontend
// to prevent duplication. The AI must only produce body paragraphs.
//
// WRITING STYLE — modelled after the reference document (Chapters 1–3):
//
//  CHAPTER 1 (INTRODUCTION):
//    • Each section (1.1, 1.2 … 1.6) opens with 1–2 direct context sentences,
//      then expands in explanation paragraphs.
//    • Specific Objectives (1.3) are written as individual <p> items — one
//      objective per paragraph — NOT bullet points.
//    • Hypotheses (1.4) use a bold label (<b>H₀₁:</b>) followed by the
//      hypothesis text inside the same <p>.
//    • Scope of Study (1.6) and Operational Definitions list items as
//      individual <p> blocks with a <b>Term:</b> lead.
//
//  CHAPTER 2 (LITERATURE REVIEW):
//    • 2.1 Conceptual Review has sub-sections (2.1.1, 2.1.2 … 2.1.7).
//      Each sub-section: one sharp topic sentence that defines the concept,
//      then ONE substantive explanatory paragraph that unpacks it and links
//      it back to the study.
//    • 2.2 Theoretical Review: dense prose explaining the chosen theory,
//      then a second paragraph mapping each layer of the theory to the
//      study's variables.
//    • 2.3 Empirical Review: cite recent studies in flowing prose; group
//      findings thematically across paragraphs (prevalence → determinants
//      → feeding/morbidity).
//
//  CHAPTER 3 (METHODOLOGY):
//    • Every section explains both WHAT was done AND WHY it was chosen.
//    • Where items must be listed (e.g., questionnaire sections, inclusion/
//      exclusion criteria), embed them in prose — one <p> per item with a
//      <b>label</b> lead — never use bullet symbols or unicode characters.
//    • Formulas are described in words; variables are explained in
//      individual <p> blocks with a <b>symbol:</b> lead.
//
//  UNIVERSAL RULES (all chapters):
//    • Lists ONLY when content is genuinely enumerable; otherwise prose.
//    • Explain WHEN NEEDED — do not pad; do not skip rationale.
//    • Never use bullet characters (•, -, *, ✓) or unicode list markers.
const PHD_SYSTEM_PROMPT = `You are a strict Academic Thesis Advisor specializing in the Nigerian Educational System.
Your writing style is formal, sophisticated, and highly analytical — modelled on a high-quality Nigerian university project.

ABSOLUTE RULES — violating any rule makes the output unusable:
1. APA 7th Edition referencing standard.
2. Prioritize Nigerian scholars, journals, and local contexts.
3. HTML ONLY: Return ONLY valid HTML using <b> for bold and <p> for paragraphs. Nothing else.
4. NO HEADINGS: Never output <h1>, <h2>, <h3>, or any heading tags. The heading is added separately by the system.
5. NO MARKDOWN: Never use #, ##, **, *, or backticks.
6. NO TABLE OF CONTENTS: Never generate a table of contents, chapter list, or document outline.
7. NO CHAPTER TITLES: Never repeat the chapter name or section name at the start of your output. Begin directly with the body text.
8. CITATIONS: Include frequent APA in-text citations (Author, Year) in every paragraph.
9. RECENCY: All cited works must be published within the last 5 years.

STRUCTURE RULES — match the reference writing style exactly:

CHAPTER 1 — INTRODUCTION:
- Open each section with 1–2 direct context sentences, then expand with explanation paragraphs.
- Section 1.3 OBJECTIVES: Write EXACTLY 1 general objective as a single <p> sentence. Then write a brief intro sentence, followed by EXACTLY 5 specific objectives — each as its own <p>, with numbers.
- Section 1.4 RESEARCH QUESTIONS: Write EXACTLY 6 research questions — one per <p>.
- Section 1.5 RESEARCH HYPOTHESES: Write EXACTLY 4 null hypotheses formatted as <p><b>H₀₁:</b> There is no statistically significant association between … and … </p> — one per <p>.
- Section 1.6 SCOPE: use <p><b>Variables:</b> …</p> <p><b>Location:</b> …</p> <p><b>Population:</b> …</p> — one item per <p>.
- Operational Definitions: use <p><b>Term:</b> Definition text.</p> pattern — exactly 5 defined terms, one per <p>.

CHAPTER 2 — LITERATURE REVIEW:
- 2.1 Conceptual Review must contain sub-sections covering every key concept variable in the study. Each sub-section: one sharp topic sentence that defines the concept, then ONE substantive paragraph unpacking it and linking it to the study.
- 2.2 Theoretical Review: exactly two paragraphs — first paragraph explains the chosen theory fully; second paragraph maps each causal layer of the theory to the study's exact variables.
- 2.3 Empirical Review: exactly three flowing prose paragraphs citing recent Nigerian studies, grouped thematically — prevalence findings first paragraph, socioeconomic/maternal determinants second paragraph, feeding practices/morbidity third paragraph.

CHAPTER 3 — METHODOLOGY:
- Every section must explain both WHAT was done AND WHY it was chosen (e.g., "This design was chosen because…").
- Questionnaire sections, inclusion/exclusion criteria, formula variables: write as individual <p> blocks with a <b>label:</b> lead — never use bullet symbols or unicode characters.
- Sample size section must include the Taro Yamane formula described in words, show the full mathematical working step-by-step each in its own <p>, then add 10% attrition to the final sample size.
- Formula variables: one <p><b>symbol:</b> meaning</p> per variable.
- Data analysis section must mention SPSS, descriptive statistics (frequencies, percentages, mean, standard deviation), Chi-square test of independence, and p-value threshold of less than 0.05.

UNIVERSAL:
- Use lists (individual <p> blocks) ONLY when content is genuinely enumerable.
- Otherwise write in continuous, well-developed prose paragraphs (5–8 sentences each).
- Explain context and rationale WHEN NEEDED — do not pad, but never skip the "why".
- NEVER use bullet characters (•, –, -, ✓) or any unicode list markers anywhere.
- Background sections must flow: Global context → African/Continental context → Nigerian national context → Local study site context.`;

/** Sanitize short user input (topics, titles, department names) — max 500 chars */
const sanitize = (input) =>
  typeof input === "string"
    ? input.replace(/[<>&"`;{}|\\^~\[\]]/g, "").trim().slice(0, 500)
    : "";

/** Sanitize longer content (existing chapter text for elaboration) — max 15000 chars */
const sanitizeLong = (input) =>
  typeof input === "string"
    ? input.replace(/[`;{}|\\^~]/g, "").trim().slice(0, 15000)
    : "";

/** Extract JSON from AI response that may be wrapped in markdown code fences */
const extractJSON = (text) => {
  if (!text) return "[]";
  let cleaned = text.trim();
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return cleaned || "[]";
};

// ─────────────────────────────────────────────────────────────────────────────
// PAYSTACK WEBHOOK
// ₦10,000 = 1 credit (1,000,000 kobo)
// Register URL in Paystack Dashboard → Settings → Webhooks:
// https://us-central1-projectmate-485110.cloudfunctions.net/paystackWebhook
// ─────────────────────────────────────────────────────────────────────────────
exports.paystackWebhook = onRequest(
  { secrets: ["PAYSTACK_SECRET_KEY"] },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      console.error("paystackWebhook: Invalid signature");
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;
    if (event.event !== "charge.success") return res.status(200).send("OK");

    const amountPaidKobo = event.data?.amount;
    const reference = event.data?.reference;
    const userId = event.data?.metadata?.custom_fields?.find(
      (f) => f.variable_name === "user_id"
    )?.value;

    if (!reference || !amountPaidKobo) {
      console.error("paystackWebhook: Missing reference or amount");
      return res.status(200).send("OK");
    }

    if (!userId) {
      console.error("paystackWebhook: No user_id in metadata. Ref:", reference);
      return res.status(200).send("OK");
    }

    const paymentRef = admin.firestore()
      .collection(`users/${userId}/paymentHistory`)
      .doc(reference);
    const existing = await paymentRef.get();
    if (existing.exists) {
      console.log("paystackWebhook: Already processed:", reference);
      return res.status(200).send("OK");
    }

    const KOBO_PER_CREDIT = 1000000;
    const creditsToAdd = Math.floor(amountPaidKobo / KOBO_PER_CREDIT);

    if (creditsToAdd < 1) {
      console.error("paystackWebhook: Amount too small:", amountPaidKobo);
      return res.status(200).send("OK");
    }

    try {
      const userRef = admin.firestore().doc(`users/${userId}`);
      await admin.firestore().runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error(`User not found: ${userId}`);
        tx.update(userRef, { credits: admin.firestore.FieldValue.increment(creditsToAdd) });
        tx.set(paymentRef, {
          reference,
          amountKobo: amountPaidKobo,
          creditsAdded: creditsToAdd,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      console.log(`paystackWebhook: Added ${creditsToAdd} credit(s) to ${userId}. Ref: ${reference}`);
    } catch (err) {
      console.error("paystackWebhook: Transaction failed:", err);
      return res.status(500).send("Transaction failed");
    }

    return res.status(200).send("OK");
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Generate Topics
// ─────────────────────────────────────────────────────────────────────────────
exports.generateTopics = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  if (!checkRateLimit(request.auth.uid)) throw new HttpsError("resource-exhausted", "Too many requests. Please wait a moment.");

  const { institutionName, faculty, department } = request.data;
  const ai = getAi();
  const prompt = `Generate 5 high-level research project topics for a student at ${sanitize(institutionName)}, Faculty of ${sanitize(faculty)}, Department of ${sanitize(department)}. Return ONLY a JSON array of objects with a "title" string property. No other text.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction: PHD_SYSTEM_PROMPT, responseMimeType: "application/json" },
    });
    return JSON.parse(extractJSON(response.text));
  } catch (error) {
    console.error("generateTopics error:", error);
    throw new HttpsError("internal", "AI generation failed");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Generate Outline
// ─────────────────────────────────────────────────────────────────────────────
exports.generateOutline = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
  if (!checkRateLimit(request.auth.uid)) throw new HttpsError("resource-exhausted", "Too many requests. Please wait a moment.");

  const { topic } = request.data;
  const ai = getAi();
  const prompt = `Create a Nigerian University Project Table of Contents for: "${sanitize(topic)}".
  Use EXACTLY this structure — no extra items, no renamed sections:
  - CHAPTER 1: INTRODUCTION — sections: ["Background of the Study", "Statement of the Problem", "Objectives of the Study", "Research Questions", "Research Hypotheses", "Significance of the Study", "Scope of Study", "Operational Definition of Terms"]
  - CHAPTER 2: LITERATURE REVIEW — sections: ["Conceptual Review", "Theoretical Review", "Empirical Review"]
  - CHAPTER 3: METHODOLOGY — sections: ["Research Design", "Research Setting", "Target Population", "Sample Size and Formula", "Sampling Technique", "Instrument for Data Collection", "Validity of Instrument", "Reliability of Instrument", "Method of Data Collection", "Method of Data Analysis", "Ethical Consideration"]
  - CHAPTER 4: DATA PRESENTATION AND ANALYSIS — sections: ["Data Presentation", "Data Analysis", "Discussion of Findings"]
  - CHAPTER 5: SUMMARY, CONCLUSION AND RECOMMENDATIONS — sections: ["Summary", "Conclusion", "Recommendations", "Limitations of the Study", "Suggestions for Further Research"]
  - REFERENCES — sections: []
  - APPENDICES — sections: []
  Return ONLY a JSON array. Each object: "title" (string) and "sections" (array of strings). No extra commentary.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction: PHD_SYSTEM_PROMPT, responseMimeType: "application/json" },
    });
    return JSON.parse(extractJSON(response.text));
  } catch (error) {
    console.error("generateOutline error:", error);
    throw new HttpsError("internal", "AI Outline generation failed");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: verify Bearer token
// ─────────────────────────────────────────────────────────────────────────────
const verifyToken = async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) { res.status(401).send("Unauthorized"); return null; }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    // Rate limit check for streaming endpoints
    if (!checkRateLimit(decoded.uid)) {
      res.status(429).send("Too many requests. Please wait a moment.");
      return null;
    }
    return decoded;
  } catch {
    res.status(401).send("Invalid token");
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Generate Full Chapter Stream
// ─────────────────────────────────────────────────────────────────────────────
exports.generateChapterStream = onRequest({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!await verifyToken(req, res)) return;

    const { topic, chapterTitle, department } = (req.body && req.body.data) || {};
    if (!topic || !chapterTitle) return res.status(400).send("Missing required fields: topic, chapterTitle");
    const ai = getAi();

    const prompt = `Research Topic: "${sanitize(topic)}"
Chapter to write: "${sanitize(chapterTitle)}"
Student department: ${sanitize(department)}

TASK: Write approximately 2500 words of academic body text for this chapter.

STRICT OUTPUT RULES:
- Start your output IMMEDIATELY with the first <p> tag. No title, no heading, no preamble.
- Use ONLY <p> and <b> tags. No h1/h2/h3 tags whatsoever.
- Do NOT write a table of contents, document outline, or chapter list.
- Do NOT repeat the chapter name at the top.
- Write continuous academic prose with APA 7th in-text citations in every paragraph.
- Do NOT use markdown.
- Do NOT use bullet characters anywhere.

STRUCTURE — apply based on which chapter you are writing:

If writing CHAPTER 1 (INTRODUCTION):
  - Cover ALL sections in this exact order: Background of the Study, Statement of the Problem, Objectives of the Study, Research Questions, Research Hypotheses, Significance of the Study, Scope of Study, Operational Definition of Terms.
  - Background: flow from Global to African/Continental to Nigerian national to Local study site context.
  - Objectives: EXACTLY 1 general objective as a single <p>. Then a brief intro sentence, followed by EXACTLY 5 specific objectives — each as its own <p>, with numbers.
  - Research Questions: EXACTLY 6 questions — one per <p>. 
  - Research Hypotheses: EXACTLY 4 null hypotheses: <p><b>H01:</b> There is no statistically significant association between ... and ... </p>.
  - Significance of the Study: EXACTLY 5 paragraphs — one per stakeholder group
  - Scope: <p><b>Variables:</b> ...</p> <p><b>Location:</b> ...</p> <p><b>Population:</b> ...</p>
  - Definitions: EXACTLY 5 terms — <p><b>Term:</b> definition.</p> — one per <p>.

If writing CHAPTER 2 (LITERATURE REVIEW):
  - 2.1 Conceptual Review must contain sub-sections covering EVERY key concept variable in the study. Each sub-section: one sharp defining sentence + one deep paragraph linking the concept to the study.
  - 2.2 Theoretical Review: EXACTLY 2 paragraphs — paragraph 1 explains the chosen theory fully; paragraph 2 maps each layer of the theory to the study's exact variables.
  - 2.3 Empirical Review: EXACTLY 3 flowing prose paragraphs — prevalence findings first, socioeconomic/maternal determinants second, feeding practices/morbidity third. Cite named Nigerian authors with years.

If writing CHAPTER 3 (METHODOLOGY):
  - Write all 11 sections in order: Research Design, Research Setting, Target Population, Sample Size and Formula, Sampling Technique, Instrument for Data Collection, Validity of Instrument, Reliability of Instrument, Method of Data Collection, Method of Data Analysis, Ethical Consideration.
  - Every section explains both WHAT was done AND WHY it was chosen.
  - Sample Size: describe Taro Yamane formula in words, show full step-by-step mathematical working each step in its own <p>, then add 10% attrition to get the final sample.
  - Formula variables: <p><b>symbol:</b> meaning</p> — one per variable.
  - Questionnaire sections / criteria: <p><b>Section A / Inclusion / Exclusion:</b> explanation.</p> — one per item.
  - Data Analysis section: must mention SPSS, descriptive statistics (frequencies, percentages, mean, standard deviation), Chi-square test of independence, and p-value threshold of less than 0.05.`;

    try {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");
      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: PHD_SYSTEM_PROMPT },
      });
      for await (const chunk of stream) { if (chunk.text) res.write(chunk.text); }
      res.end();
    } catch (error) {
      console.error("generateChapterStream error:", error);
      if (!res.headersSent) res.status(500).send("Stream failed");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Generate Single Section Stream
// ─────────────────────────────────────────────────────────────────────────────
exports.generateSectionStream = onRequest({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!await verifyToken(req, res)) return;

    const { topic, chapterTitle, sectionTitle, department } = (req.body && req.body.data) || {};
    if (!topic || !chapterTitle || !sectionTitle) return res.status(400).send("Missing required fields: topic, chapterTitle, sectionTitle");
    const ai = getAi();

    const prompt = `Research Topic: "${sanitize(topic)}"
Chapter: "${sanitize(chapterTitle)}"
Section to write: "${sanitize(sectionTitle)}"
Student department: ${sanitize(department)}

TASK: Write approximately 600-800 words of academic body text for this section ONLY.

STRICT OUTPUT RULES:
- Start your output IMMEDIATELY with the first <p> tag. No heading, no title, no preamble.
- Use ONLY <p> and <b> tags. No h1/h2/h3 tags whatsoever.
- Do NOT repeat the section name or chapter name at the top.
- Write continuous academic prose with APA 7th in-text citations.
- Do NOT use markdown.
- Do NOT use bullet characters anywhere.

STRUCTURE — apply based on which section you are writing:

CHAPTER 1 sections:
  - Background of the Study: flow from Global to African/Continental to Nigerian national to Local study site. 5-6 full prose paragraphs.
  - Statement of the Problem: 4 paragraphs using problem-funnel style (national evidence to local gap to why investigation is needed).
  - Objectives of the Study: EXACTLY 1 general objective as a single <p>. Then a brief intro sentence, then EXACTLY 5 specific objectives — each as its own <p>, with numbers.
  - Research Questions: EXACTLY 6 research questions — one per <p>.
  - Research Hypotheses: EXACTLY 4 null hypotheses: <p><b>H01:</b> There is no statistically significant association between ... and ... </p>.
  - Significance of the Study: 5 paragraphs — one per stakeholder group (nursing profession, health care providers, PHC system, policy makers, society/caregivers).
  - Scope of Study: <p><b>Variables:</b> ...</p> <p><b>Location:</b> ...</p> <p><b>Population:</b> ...</p> — one item per <p>.
  - Operational Definition of Terms: EXACTLY 5 terms — <p><b>Term:</b> definition.</p> — one per <p>.

CHAPTER 2 sections:
  - Conceptual Review: for EVERY key concept variable in the topic, write a sub-section — one sharp defining sentence followed by one deep explanatory paragraph that connects the concept to this study. Cover all major variable categories (the condition being studied, each associated factor category).
  - Theoretical Review: EXACTLY 2 paragraphs — paragraph 1 describes the chosen theoretical framework in full; paragraph 2 maps each causal layer of the framework to the study's specific variables.
  - Empirical Review: EXACTLY 3 flowing prose paragraphs citing named Nigerian authors with years — prevalence studies first paragraph, socioeconomic/maternal determinants second paragraph, feeding practices/morbidity third paragraph.

CHAPTER 3 sections:
  - Every section: explain WHAT was done, then WHY that choice was made.
  - Sample Size and Formula: describe Taro Yamane formula in words, then show full step-by-step mathematical working each step in its own <p>, then add 10% attrition to final sample.
  - Formula variables: <p><b>symbol:</b> meaning</p> — one per variable.
  - Instrument for Data Collection: describe questionnaire sections as <p><b>Section A:</b> covers ... because ...</p> — one per section.
  - Sampling Technique: include <p><b>Inclusion criteria:</b> ...</p> and <p><b>Exclusion criteria:</b> ...</p> blocks embedded in the section prose.
  - Method of Data Analysis: must mention SPSS, descriptive statistics (frequencies, percentages, mean, standard deviation), Chi-square test of independence, and p-value threshold of less than 0.05.`;

    try {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");
      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: PHD_SYSTEM_PROMPT },
      });
      for await (const chunk of stream) { if (chunk.text) res.write(chunk.text); }
      res.end();
    } catch (error) {
      console.error("generateSectionStream error:", error);
      if (!res.headersSent) res.status(500).send("Section stream failed");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Elaborate Stream
// ─────────────────────────────────────────────────────────────────────────────
exports.elaborateStream = onRequest({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!await verifyToken(req, res)) return;

    const { topic, currentText } = (req.body && req.body.data) || {};
    if (!topic) return res.status(400).send("Missing required field: topic");
    const ai = getAi();
    const prompt = `Research Topic: "${sanitize(topic)}"
Existing text: "${sanitizeLong(currentText)}"

TASK: Elaborate on this text — expand arguments, add depth, strengthen citations.

STRICT OUTPUT RULES:
- Use ONLY <p> and <b> tags. No headings.
- Do NOT repeat the existing text — only write the elaboration/extension.
- Maintain APA 7th tone and in-text citations.
- No markdown.`;

    try {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");
      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: PHD_SYSTEM_PROMPT },
      });
      for await (const chunk of stream) { if (chunk.text) res.write(chunk.text); }
      res.end();
    } catch (error) {
      console.error("elaborateStream error:", error);
      if (!res.headersSent) res.status(500).send("Elaborate stream failed");
    }
  });
});
