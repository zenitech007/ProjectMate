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

const PHD_SYSTEM_PROMPT = `You are a strict Academic Thesis Advisor specializing in the Nigerian Educational System.
Your writing style is formal, sophisticated, and highly analytical.
CRITICAL RULES:
1. Reference Standard: APA 7th Edition.
2. Context: Prioritize Nigerian scholars and local contexts.
3. Formatting: Return content as a valid HTML string using ONLY <h3> for headers, <b> for bolding, and <p> for paragraphs.
4. NO MARKDOWN: Never use # or ** in your output.
5. CITATION RECENCY: All references, journals, and books used MUST be published within the last 5 years.
6. IN-TEXT CITATIONS: You MUST include frequent, accurate in-text citations (e.g., Author, Year) woven into paragraphs.`;

const sanitize = (input) =>
  typeof input === "string"
    ? input.replace(/[<>&"`;{}|\\^~\[\]]/g, "").trim().slice(0, 500)
    : "";

// ─────────────────────────────────────────────────────────────────────────────
// PAYSTACK WEBHOOK
// This is the ONLY place credits are added. The webhook is called by Paystack
// after a successful payment, verified with HMAC-SHA512 signature.
//
// SETUP STEPS:
//   1. firebase functions:secrets:set PAYSTACK_SECRET_KEY  (your sk_live_... key)
//   2. firebase deploy --only functions
//   3. In Paystack Dashboard → Settings → API Keys & Webhooks, add:
//      https://us-central1-projectmate-485110.cloudfunctions.net/paystackWebhook
// ─────────────────────────────────────────────────────────────────────────────
exports.paystackWebhook = onRequest(
  { secrets: ["PAYSTACK_SECRET_KEY"] },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    // 1. Verify the request is genuinely from Paystack
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      console.error("paystackWebhook: Invalid signature — possible spoofed request");
      return res.status(400).send("Invalid signature");
    }

    const event = req.body;
    console.log("paystackWebhook: event received:", event.event);

    // 2. Only act on successful charges
    if (event.event !== "charge.success") {
      return res.status(200).send("OK");
    }

    const amountPaidKobo = event.data?.amount; // Paystack always sends kobo
    const reference = event.data?.reference;
    const userId = event.data?.metadata?.custom_fields?.find(
      (f) => f.variable_name === "user_id"
    )?.value;

    if (!userId) {
      console.error("paystackWebhook: No user_id in metadata. Reference:", reference);
      return res.status(200).send("OK"); // Always 200 so Paystack stops retrying
    }

    // 3. Idempotency — check if this reference was already processed
    const paymentRef = admin.firestore()
      .collection(`users/${userId}/paymentHistory`)
      .doc(reference);

    const existing = await paymentRef.get();
    if (existing.exists) {
      console.log("paystackWebhook: Already processed reference:", reference);
      return res.status(200).send("OK");
    }

    // 4. Calculate credits: ₦10,000 = 1 credit (1,000,000 kobo)
    const KOBO_PER_CREDIT = 1000000;
    const creditsToAdd = Math.floor(amountPaidKobo / KOBO_PER_CREDIT);

    if (creditsToAdd < 1) {
      console.error("paystackWebhook: Amount too small:", amountPaidKobo, "kobo");
      return res.status(200).send("OK");
    }

    try {
      const userRef = admin.firestore().doc(`users/${userId}`);

      // 5. Atomic write: increment credits + record payment history
      await admin.firestore().runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error(`User not found: ${userId}`);

        tx.update(userRef, {
          credits: admin.firestore.FieldValue.increment(creditsToAdd),
        });
        tx.set(paymentRef, {
          reference,
          amountKobo: amountPaidKobo,
          creditsAdded: creditsToAdd,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log(
        `paystackWebhook: ✅ Added ${creditsToAdd} credit(s) to user ${userId}. Ref: ${reference}`
      );
    } catch (err) {
      console.error("paystackWebhook: Failed to update credits:", err);
      // Return 200 anyway — Paystack will retry on non-200, causing duplicate credits
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
  const prompt = `Generate 5 high-level research project topics for a student at ${sanitize(institutionName)}, Faculty of ${sanitize(faculty)}, Department of ${sanitize(department)}. Return ONLY a JSON array of objects with a "title" string property.`;

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
  const prompt = `Create a rigorous University Project Table of Contents for the topic: "${sanitize(topic)}". 
  Use this exact Nigerian University format:
  - CHAPTER 1 (INTRODUCTION): Background to the Study, Statement of the Problem, Aim and Objectives, Research Questions, Hypotheses, Scope, Significance, Operational Definition of Terms.
  - CHAPTER 2: Literature Review (Conceptual, Theoretical, and Empirical frameworks).
  - CHAPTER 3: Research Methodology.(Research Design, Population, Sample Size and Sampling Technique, Instrumentation, Data Collection Procedure, Data Analysis Plan).
  - CHAPTER 4: Data Presentation and Analysis.
  - CHAPTER 5: Summary, Conclusion, and Recommendations.
  - REFERENCES
  - APPENDICES
  Return a JSON array of objects. Each object must have "title" (string) and "sections" (array of strings).`;

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
// Helper: verify Bearer token for onRequest functions
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
// ─────────────────────────────────────────────────────────────────────────────
exports.generateChapterStream = onRequest({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!await verifyToken(req, res)) return;

    const { topic, chapterTitle, department } = req.body.data || {};
    const ai = getAi();

    let extraInstructions = "";
    if (/chapter\s*1|chapter\s*one/i.test(chapterTitle || "")) {
      extraInstructions = "\nCRITICAL: You MUST include a formal Academic Cover/Title Page at the very beginning before the chapter content begins.";
    }
    const prompt = `Research Topic: "${sanitize(topic)}"\nTarget Chapter: "${sanitize(chapterTitle)}".${extraInstructions}\nTask: Write a comprehensive academic draft (approx 2500 words) for this chapter, tailored to a student in the ${sanitize(department)} department. Use HTML tags (<h3>, <b>, <p>). No markdown.`;

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

    const { topic, chapterTitle, sectionTitle, department } = req.body.data || {};
    const ai = getAi();

    let extraInstructions = "";
    if (/chapter\s*1|chapter\s*one/i.test(chapterTitle || "") && /background|introduction/i.test(sectionTitle || "")) {
      extraInstructions = "\nCRITICAL: You MUST include a formal Academic Cover/Title Page at the very beginning before the section content begins.";
    }
    const prompt = `Research Topic: "${sanitize(topic)}"\nChapter: "${sanitize(chapterTitle)}"\nSection: "${sanitize(sectionTitle)}".${extraInstructions}\nTask: Write a comprehensive academic draft (approx 800 words) for ONLY this section, tailored to a student in the ${sanitize(department)} department. Use HTML tags (<h3>, <b>, <p>). No markdown.`;

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
    const prompt = `Research Topic: "${sanitize(topic)}"\nExisting text:\n"${sanitize(currentText)}"\nTask: Elaborate on this text — expand academic arguments, add theoretical depth, deepen explanations. Maintain APA 7th tone. Use HTML tags (<b>, <p>). No markdown.`;

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