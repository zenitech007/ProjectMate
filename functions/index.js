const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");
const cors = require("cors")({ origin: true });

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
5. CITATION RECENCY: All references, journals, and books used MUST be published within the last 5 years. Do not use outdated sources.
6. IN-TEXT CITATIONS: You MUST include frequent, accurate in-text citations (e.g., Author, Year) seamlessly woven into the paragraphs to support every academic claim, fact, and theoretical argument.`;

const sanitize = (input) =>
  typeof input === "string"
    ? input.replace(/[<>&"`;{}|\\^~\[\]]/g, "").trim().slice(0, 500)
    : "";

// 1. Generate Topics
exports.generateTopics = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required.");
  }

  const { institutionType, institutionName, faculty, department } = request.data;
  const ai = getAi();
  const prompt = `Generate 5 high-level research project topics for a student at ${sanitize(institutionName)}, Faculty of ${sanitize(faculty)}, Department of ${sanitize(department)}. Return ONLY a JSON array of objects with a "title" string property.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: PHD_SYSTEM_PROMPT,
        responseMimeType: "application/json",
      },
    });
    const text = response.text;
    return JSON.parse(text || "[]");
  } catch (error) {
    console.error("generateTopics error:", error);
    throw new HttpsError("internal", "AI generation failed");
  }
});

// 2. Generate Outline
exports.generateOutline = onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required.");
  }

  const { topic } = request.data;
  const ai = getAi();
  const prompt = `Create a rigorous University Project Table of Contents for the topic: "${sanitize(topic)}". 
  You MUST adhere exactly to this standard Nigerian University format:
  
  - PRELIMINARY PAGES: Cover/Title Page, Certification, Dedication, Acknowledgement, Abstract, Table of Contents, List of Tables/Figures.
  - CHAPTER 1 (INTRODUCTION): Background to the Study, Statement of the Problem, Aim and Objectives of the Study, Research Questions, Research Hypotheses, Scope of the Study, Significance of the Study, Operational Definition of Terms.
  - CHAPTER 2: Literature Review (Include Conceptual, Theoretical, and Empirical frameworks).
  - CHAPTER 3: Research Methodology.
  - CHAPTER 4: Data Presentation and Analysis.
  - CHAPTER 5: Summary, Conclusion, and Recommendations.
  - REFERENCES
  - APPENDICES

  Return a JSON array of objects. Each object must have a "title" (e.g. "CHAPTER 1: INTRODUCTION") and a "sections" array containing the sub-topics as strings.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: PHD_SYSTEM_PROMPT,
        responseMimeType: "application/json",
      },
    });
    const text = response.text;
    return JSON.parse(text || "[]");
  } catch (error) {
    console.error("generateOutline error:", error);
    throw new HttpsError("internal", "AI Outline generation failed");
  }
});

// 3. Generate Full Chapter Stream
exports.generateChapterStream = onRequest({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).send("Unauthorized");
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch {
      return res.status(401).send("Invalid token");
    }

    const { topic, chapterTitle, department } = req.body.data || {};
    const ai = getAi();
    const prompt = `Research Topic: "${sanitize(topic)}"\nTarget Chapter: "${sanitize(chapterTitle)}".\nTask: Write a comprehensive academic draft for this chapter (approx 2500 words) tailored to a student in the ${sanitize(department)} department. Use HTML tags (<h3>, <b>, <p>). Do not include markdown.`;

    try {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: PHD_SYSTEM_PROMPT },
      });

      for await (const chunk of stream) {
        if (chunk.text) res.write(chunk.text);
      }
      res.end();
    } catch (error) {
      console.error("generateChapterStream error:", error);
      res.status(500).send("Stream failed");
    }
  });
});

// 4. Generate Single Section Stream
exports.generateSectionStream = onRequest({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).send("Unauthorized");
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch {
      return res.status(401).send("Invalid token");
    }

    const { topic, chapterTitle, sectionTitle, department } = req.body.data || {};
    const ai = getAi();
    const prompt = `Research Topic: "${sanitize(topic)}"\nChapter: "${sanitize(chapterTitle)}"\nSpecific Section: "${sanitize(sectionTitle)}".\nTask: Write a comprehensive, highly academic draft for ONLY this specific section (approx 800 words) tailored to a student in the ${sanitize(department)} department. Use HTML tags (<h3>, <b>, <p>). Do not include markdown.`;

    try {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: PHD_SYSTEM_PROMPT },
      });

      for await (const chunk of stream) {
        if (chunk.text) res.write(chunk.text);
      }
      res.end();
    } catch (error) {
      console.error("generateSectionStream error:", error);
      res.status(500).send("Section stream failed");
    }
  });
});

// 5. Elaborate Stream
exports.elaborateStream = onRequest({ secrets: ["GEMINI_API_KEY"] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).send("Unauthorized");
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch {
      return res.status(401).send("Invalid token");
    }

    const { topic, currentText } = req.body.data || {};
    const ai = getAi();
    const prompt = `Research Topic: "${sanitize(topic)}"\nContext: The user has written the following text:\n"${sanitize(currentText)}"\nTask: Elaborate on this text, expanding the academic arguments, adding theoretical depth, and providing more detailed explanations. Maintain APA 7th edition academic tone. Use HTML tags (<b>, <p>). Do not include markdown.`;

    try {
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Transfer-Encoding", "chunked");

      const stream = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { systemInstruction: PHD_SYSTEM_PROMPT },
      });

      for await (const chunk of stream) {
        if (chunk.text) res.write(chunk.text);
      }
      res.end();
    } catch (error) {
      console.error("elaborateStream error:", error);
      res.status(500).send("Elaborate stream failed");
    }
  });
});