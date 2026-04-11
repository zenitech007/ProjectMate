const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const cors = require('cors')({ origin: true });
const crypto = require('crypto');

admin.initializeApp();

const getAi = () => {
  const apiKey = functions.config().gemini?.key || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key not configured on server.");
  return new GoogleGenAI({ apiKey });
};

// UPGRADED PROMPT: Added strict rules 5 and 6 for references
const PHD_SYSTEM_PROMPT = `You are a strict Academic Thesis Advisor specializing in the Nigerian Educational System.
Your writing style is formal, sophisticated, and highly analytical.
CRITICAL RULES:
1. Reference Standard: APA 7th Edition.
2. Context: Prioritize Nigerian scholars and local contexts.
3. Formatting: Return content as a valid HTML string using ONLY <h3> for headers, <b> for bolding, and <p> for paragraphs.
4. NO MARKDOWN: Never use # or ** in your output.
5. CITATION RECENCY: All references, journals, and books used MUST be published within the last 5 years. Do not use outdated sources.
6. IN-TEXT CITATIONS: You MUST include frequent, accurate in-text citations (e.g., Author, Year) seamlessly woven into the paragraphs to support every academic claim, fact, and theoretical argument.`;

const sanitize = (input) =>
  typeof input === 'string'
    ? input.replace(/[<>&"'`;{}|\\^~\[\]]/g, '').trim().slice(0, 500)
    : '';

// 1. Generate Topics
exports.generateTopics = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required.');

  const ai = getAi();
  const prompt = `Generate 5 high-level research project topics for a student at ${sanitize(data.institutionName)}, Faculty of ${sanitize(data.faculty)}, Department of ${sanitize(data.department)}. Return ONLY a JSON array of objects with a "title" string property.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
      config: { systemInstruction: PHD_SYSTEM_PROMPT, responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error(error);
    throw new functions.https.HttpsError('internal', 'AI generation failed');
  }
});

// 2. Generate Outline (PDF Format)
exports.generateOutline = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required.');

  const ai = getAi();
  const prompt = `Create a rigorous University Project Table of Contents for the topic: "${sanitize(data.topic)}". 
  You MUST adhere exactly to this standard Nigerian University format:
  
  - PRELIMINARY PAGES: Cover/Title Page, Certification, Dedication, Acknowledgement, Abstract, Table of Contents, List of Tables/Figures.
  - CHAPTER 1 (INTRODUCTION): Background to the Study, Statement of the Problem, Aim and Objectives of the Study, Research Questions, Research Hypotheses, Scope of the Study, Significance of the Study, Operational Definition of Terms.
  - CHAPTER 2: Literature Review (Include Conceptual, Theoretical, and Empirical frameworks).
  - CHAPTER 3: Research Methodology.
  - CHAPTER 4: Data Presentation and Analysis.
  - CHAPTER 5: Summary, Conclusion, and Recommendations.
  - REFERENCES
  - APPENDICES

  Return a JSON array of objects. Each object must have a "title" (e.g. "CHAPTER 1: INTRODUCTION") and a "sections" array containing the sub-topics as strings. Ensure preliminary pages and references are their own objects in the array.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: { systemInstruction: PHD_SYSTEM_PROMPT, responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error(error);
    throw new functions.https.HttpsError('internal', 'AI Outline generation failed');
  }
});

// 3. Generate Full Chapter
exports.generateChapterStream = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
    if (!idToken) return res.status(401).send('Unauthorized');
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      return res.status(401).send('Invalid token');
    }

    const { topic, chapterTitle, department } = req.body.data || {};
    const ai = getAi();

    const prompt = `Research Topic: "${sanitize(topic)}"\nTarget Chapter: "${sanitize(chapterTitle)}".\nTask: Write a comprehensive academic draft for this chapter (approx 2500 words) tailored to a student in the ${sanitize(department)} department. Use HTML tags (<h3>, <b>, <p>). Do not include markdown.`;

    try {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');

      const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: { systemInstruction: PHD_SYSTEM_PROMPT }
      });

      for await (const chunk of stream) {
        if (chunk.text) res.write(chunk.text);
      }
      res.end();
    } catch (error) {
      console.error(error);
      res.status(500).send("Stream failed");
    }
  });
});

// 6. Paystack Webhook
exports.paystackWebhook = functions.https.onRequest(async (req, res) => {
  const secret = functions.config().paystack.secret;
  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.rawBody)
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(400).send('Invalid signature');
  }

  const event = req.body;
  if (event.event === 'charge.success') {
    const userId = event.data.metadata?.custom_fields?.find(
      f => f.variable_name === 'user_id'
    )?.value;

    if (userId) {
      await admin.firestore().doc(`users/${userId}`).update({
        credits: admin.firestore.FieldValue.increment(2) // CREDITS_PER_PURCHASE
      });
    }
  }
  res.sendStatus(200);
});

// 4. Generate Single Section
exports.generateSectionStream = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
    if (!idToken) return res.status(401).send('Unauthorized');
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      return res.status(401).send('Invalid token');
    }

    const { topic, chapterTitle, sectionTitle, department } = req.body.data || {};
    const ai = getAi();

    const prompt = `Research Topic: "${sanitize(topic)}"\nChapter: "${sanitize(chapterTitle)}"\nSpecific Section: "${sanitize(sectionTitle)}".\nTask: Write a comprehensive, highly academic draft for ONLY this specific section (approx 800 words) tailored to a student in the ${sanitize(department)} department. Use HTML tags (<h3>, <b>, <p>). Do not include markdown.`;

    try {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');

      const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: { systemInstruction: PHD_SYSTEM_PROMPT }
      });

      for await (const chunk of stream) {
        if (chunk.text) res.write(chunk.text);
      }
      res.end();
    } catch (error) {
      console.error(error);
      res.status(500).send("Section stream failed");
    }
  });
});

// 5. Elaborate Text
exports.elaborateStream = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
    if (!idToken) return res.status(401).send('Unauthorized');
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      return res.status(401).send('Invalid token');
    }

    const { topic, currentText } = req.body.data || {};
    const ai = getAi();

    const prompt = `Research Topic: "${sanitize(topic)}"\nContext: The user has written the following text:\n"${sanitize(currentText)}"\nTask: Elaborate on this text, expanding the academic arguments, adding theoretical depth, and providing more detailed explanations. Maintain APA 7th edition academic tone. Use HTML tags (<b>, <p>). Do not include markdown.`;

    try {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');

      const stream = await ai.models.generateContentStream({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: { systemInstruction: PHD_SYSTEM_PROMPT }
      });

      for await (const chunk of stream) {
        if (chunk.text) res.write(chunk.text);
      }
      res.end();
    } catch (error) {
      console.error(error);
      res.status(500).send("Elaborate stream failed");
    }
  });
});