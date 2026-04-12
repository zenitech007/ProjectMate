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
- Specific Objectives: write each objective as its own <p> — one objective per paragraph, no bullet symbols.
- Hypotheses: format as <p><b>H₀₁:</b> There is no statistically significant association between … </p> — one per <p>.
- Scope / Definitions: use <p><b>Term:</b> Definition text.</p> pattern — one item per <p>.

CHAPTER 2 — LITERATURE REVIEW:
- Sub-sections (2.1.1, 2.1.2, etc.) under Conceptual Review: begin with one sharp topic sentence that defines the concept, then one substantive paragraph unpacking it and linking it to the study.
- Theoretical Review (2.2): first paragraph explains the theory fully; second paragraph maps each layer of the theory to the study's exact variables.
- Empirical Review (2.3): cite recent Nigerian studies in flowing prose; group thematically — prevalence findings first, then determinants, then feeding/morbidity evidence.

CHAPTER 3 — METHODOLOGY:
- Every section must explain both WHAT was done AND WHY it was chosen (e.g., "This design was chosen because…").
- Questionnaire sections, inclusion/exclusion criteria, formula variables: write as individual <p> blocks with a <b>label:</b> lead — never use bullet symbols or unicode characters.
- Formulas: describe the formula in words, then explain each variable in its own <p> with a <b>symbol:</b> lead.

UNIVERSAL:
- Use lists (individual <p> blocks) ONLY when content is genuinely enumerable.
- Otherwise write in continuous, well-developed prose paragraphs.
- Explain context and rationale WHEN NEEDED — do not pad, but never skip the "why".
- NEVER use bullet characters (•, –, -, ✓) or any unicode list markers anywhere.`;

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
    //
    // Chapter-specific structure guide (mirrors the reference document):
    //   Chapter 1 — INTRODUCTION:
    //     Write all standard sections (1.1 Background → 1.6 Scope) in sequence.
    //     Each section: open with direct context, then expand.
    //     Objectives → one <p> per objective. Hypotheses → <p><b>H₀₁:</b> …</p>.
    //     Definitions/Scope items → <p><b>Term:</b> …</p>.
    //
    //   Chapter 2 — LITERATURE REVIEW:
    //     2.1 Conceptual Review must contain sub-sections (2.1.1 … 2.1.7 or more).
    //     Each sub-section: one defining topic sentence + one deep explanatory paragraph.
    //     2.2 Theoretical Review: two paragraphs — theory description, then variable mapping.
    //     2.3 Empirical Review: flowing prose grouped by theme (prevalence → determinants → feeding/morbidity).
    //
    //   Chapter 3 — METHODOLOGY:
    //     Every section explains WHAT was done AND WHY.
    //     Formula variables → one <p><b>symbol:</b> meaning</p> per variable.
    //     Questionnaire sections / criteria → one <p><b>Section X / Label:</b> …</p> per item.
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
- Do NOT use bullet characters (•, –, -, ✓) anywhere.

STRUCTURE — apply based on which chapter you are writing:

If writing CHAPTER 1 (INTRODUCTION):
  - Cover all standard sections in sequence (Background, Statement of Problem, Objectives, Research Questions, Hypotheses, Scope, Significance, Definitions).
  - Each section: 1–2 direct opening sentences, then full explanation paragraphs.
  - List each specific objective as its own <p> — no bullets.
  - Each hypothesis: <p><b>H₀₁:</b> There is no statistically significant association between … and … </p>
  - Scope/Definitions: <p><b>Term:</b> definition.</p> — one item per <p>.

If writing CHAPTER 2 (LITERATURE REVIEW):
  - Under Conceptual Review, write sub-sections covering every key concept in the study.
  - Each sub-section: one sharp defining sentence + one deep paragraph linking the concept to the study.
  - Theoretical Review: paragraph 1 explains the theory fully; paragraph 2 maps each layer to the study's variables.
  - Empirical Review: flowing prose, cite recent Nigerian studies, grouped thematically.

If writing CHAPTER 3 (METHODOLOGY):
  - Every section must state WHAT was done AND WHY it was chosen.
  - Formula variables: <p><b>symbol</b> represents …</p> — one per <p>.
  - Questionnaire sections and criteria: <p><b>Section A / Inclusion / Exclusion:</b> explanation.</p> — one per <p>.`;

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
    //
    // Section-specific structure (mirrors the reference document exactly):
    //
    //  Chapter 1 sections:
    //    Background / Statement of Problem / Significance → prose paragraphs, explain and justify.
    //    Specific Objectives → one <p> per objective, no bullet symbols.
    //    Research Questions → one <p> per question, no bullet symbols.
    //    Hypotheses → <p><b>H₀₁:</b> statement.</p> one per <p>.
    //    Scope → variables, location, population each as <p><b>Label:</b> text.</p>
    //    Definitions → <p><b>Term:</b> definition.</p>
    //
    //  Chapter 2 sections:
    //    Conceptual Review (2.1) — AI should write sub-sections for every key concept:
    //      opening topic sentence + one deep explanatory paragraph each.
    //    Theoretical Review (2.2) — describe theory fully, then map to study variables.
    //    Empirical Review (2.3) — thematic prose: prevalence findings, then determinants,
    //      then feeding/morbidity evidence.
    //
    //  Chapter 3 sections:
    //    Always explain WHAT and WHY.
    //    Formula variables → <p><b>symbol</b> represents …</p> one per variable.
    //    Questionnaire sections / criteria → <p><b>Label:</b> explanation.</p> one per item.
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
- Do NOT use bullet characters (•, –, -, ✓) anywhere.

STRUCTURE — apply based on which section you are writing:

CHAPTER 1 sections:
  - Background / Statement of Problem / Significance: open with 1–2 direct context sentences, then develop in full explanation paragraphs.
  - Specific Objectives: write a brief intro sentence, then each objective as its own <p> — no bullet symbols.
  - Research Questions: one <p> per question.
  - Hypotheses: <p><b>H₀₁:</b> There is no statistically significant association between … </p> — one per <p>.
  - Scope of Study: <p><b>Variables:</b> …</p> <p><b>Location:</b> …</p> <p><b>Population:</b> …</p>
  - Operational Definitions: <p><b>Term:</b> definition.</p> — one term per <p>.

CHAPTER 2 sections:
  - Conceptual Review: for EVERY key concept in the topic, write a sub-section — one sharp defining sentence followed by one deep explanatory paragraph that connects the concept to this study.
  - Theoretical Review: paragraph 1 describes the theory in full; paragraph 2 maps each causal layer of the theory to the study's specific variables.
  - Empirical Review: flowing prose citing recent Nigerian studies, organized thematically (prevalence first, then socioeconomic/maternal determinants, then feeding practices/morbidity).

CHAPTER 3 sections:
  - Each section: explain WHAT was done, then WHY that choice was made.
  - Sample size formula: describe the formula, then one <p><b>symbol</b> represents meaning</p> per variable.
  - Questionnaire sections: <p><b>Section A:</b> covers … because …</p> — one per section.
  - Inclusion/Exclusion criteria: <p><b>Inclusion:</b> …</p> and <p><b>Exclusion:</b> …</p> blocks.`;

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