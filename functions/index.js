const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const cors = require("cors")({ origin: true });
const crypto = require("crypto");

admin.initializeApp();

const getAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key not configured on server.");
  return new GoogleGenAI({ apiKey });
};

// ── System prompt ─────────────────────────────────────────────────────────────
// NOTE: We use <p> and <b> only — NO heading tags.
// The chapter title (h1) and section headings (h2) are injected by the frontend
// to prevent duplication. The AI must only produce body paragraphs.
const PHD_SYSTEM_PROMPT = `You are a strict Academic Thesis Advisor specializing in the Nigerian Educational System.
Your writing style is formal, sophisticated, and highly analytical.
ABSOLUTE RULES — violating any rule makes the output unusable:
1. APA 7th Edition referencing standard.
2. Prioritize Nigerian scholars, journals, and local contexts.
3. HTML ONLY: Return ONLY valid HTML using <b> for bold and <p> for paragraphs. Nothing else.
4. NO HEADINGS: Never output <h1>, <h2>, <h3>, or any heading tags. The heading is added separately by the system.
5. NO MARKDOWN: Never use #, ##, **, *, or backticks.
6. NO TABLE OF CONTENTS: Never generate a table of contents, chapter list, or document outline.
7. NO CHAPTER TITLES: Never repeat the chapter name or section name at the start of your output. Begin directly with the body text.
8. CITATIONS: Include frequent APA in-text citations (Author, Year) in every paragraph.
9. RECENCY: All cited works must be published within the last 5 years.`;

const sanitize = (input) =>
  typeof input === "string"
    ? input.replace(/[<>&"`;{}|\\^~\[\]]/g, "").trim().slice(0, 500)
    : "";

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
      console.log(`paystackWebhook: ✅ Added ${creditsToAdd} credit(s) to ${userId}. Ref: ${reference}`);
    } catch (err) {
      console.error("paystackWebhook: Transaction failed:", err);
    }

    return res.status(200).send("OK");
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Generate Topics
// ─────────────────────────────────────────────────────────────────────────────
exports.generateTopics = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");

  const { institutionName, faculty, department } = request.data;
  const ai = getAi();
  const prompt = `Generate 5 high-level research project topics for a student at ${sanitize(institutionName)}, Faculty of ${sanitize(faculty)}, Department of ${sanitize(department)}. Return ONLY a JSON array of objects with a "title" string property. No other text.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction: PHD_SYSTEM_PROMPT, responseMimeType: "application/json" },
    });
    return JSON.parse(response.text || "[]");
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

  const { topic } = request.data;
  const ai = getAi();
  const prompt = `Create a Nigerian University Project Table of Contents for: "${sanitize(topic)}".
  Use EXACTLY this structure — no extra items:
  - CHAPTER 1: INTRODUCTION — sections: Background to the Study, Statement of the Problem, Aim and Objectives, Research Questions, Research Hypotheses, Scope of the Study, Significance of the Study, Operational Definition of Terms
  - CHAPTER 2: LITERATURE REVIEW — sections: Conceptual Framework, Theoretical Framework, Empirical Review, Gap in Literature
  - CHAPTER 3: RESEARCH METHODOLOGY — sections: Research Design, Population of Study, Sample and Sampling Technique, Instrument for Data Collection, Validity and Reliability, Method of Data Analysis
  - CHAPTER 4: DATA PRESENTATION AND ANALYSIS — sections: Data Presentation, Data Analysis, Discussion of Findings
  - CHAPTER 5: SUMMARY, CONCLUSION AND RECOMMENDATIONS — sections: Summary, Conclusion, Recommendations, Limitations of the Study, Suggestions for Further Research
  - REFERENCES — sections: []
  - APPENDICES — sections: []
  Return ONLY a JSON array. Each object: "title" (string) and "sections" (array of strings). No extra commentary.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction: PHD_SYSTEM_PROMPT, responseMimeType: "application/json" },
    });
    return JSON.parse(response.text || "[]");
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
    return await admin.auth().verifyIdToken(idToken);
  } catch {
    res.status(401).send("Invalid token");
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Generate Full Chapter Stream
// KEY FIX: Prompt explicitly forbids TOC, chapter title repetition, and headings.
// The frontend adds the chapter title as <h1> — AI must start with body text only.
// ─────────────────────────────────────────────────────────────────────────────
exports.generateChapterStream = onRequest({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!await verifyToken(req, res)) return;

    const { topic, chapterTitle, department } = req.body.data || {};
    const ai = getAi();

    // The chapter title is shown in the UI — do not repeat it.
    // Do not generate a table of contents or introduction to the document.
    // Start immediately with the first body paragraph of this chapter's content.
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
- Do NOT use markdown.`;

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
// KEY FIX: Prompt forbids repeating the section title — frontend adds it as <h2>.
// ─────────────────────────────────────────────────────────────────────────────
exports.generateSectionStream = onRequest({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!await verifyToken(req, res)) return;

    const { topic, chapterTitle, sectionTitle, department } = req.body.data || {};
    const ai = getAi();

    // The section heading is shown in the UI — do not repeat it.
    // Start immediately with the body text of this section.
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
- Do NOT use markdown.`;

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

    const { topic, currentText } = req.body.data || {};
    const ai = getAi();
    const prompt = `Research Topic: "${sanitize(topic)}"
Existing text: "${sanitize(currentText)}"

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