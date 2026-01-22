
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_PROMPT = `You are a strict Nigerian University Project Supervisor. 
You write in formal academic English. 
You strictly follow APA 7th referencing. 
You focus on local Nigerian context (names, cities, currency in Naira). 
All content must be high-quality, research-oriented, and suitable for a final year undergraduate project in Nigeria.
Use academic headings and double line spacing logic in your output structure.`;

export const generateTopics = async (institutionType: string, institutionName: string, faculty: string, department: string) => {
  try {
    const prompt = `Generate 5 trending, researchable final year project topics for a student at ${institutionName} (${institutionType}), in the Faculty of ${faculty}, Department of ${department}. 
    The topics should be highly relevant to the current Nigerian landscape. Provide title and a one-sentence objective.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              brief: { type: Type.STRING }
            },
            required: ["title", "brief"]
          }
        }
      }
    });

    // response.text is a property, not a method
    return JSON.parse(response.text?.trim() || '[]');
  } catch (error) {
    console.error("Topic generation failed:", error);
    return [];
  }
};

export const generateOutline = async (topic: string) => {
  try {
    const prompt = `Create a standard Nigerian University Project Table of Contents for: "${topic}". Include Preliminary pages and Chapters 1 to 5.`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              sections: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["title", "sections"]
          }
        }
      }
    });
    // response.text is a property, not a method
    return JSON.parse(response.text?.trim() || '[]');
  } catch (error) {
    console.error("Outline generation failed:", error);
    return [];
  }
};

export const generateSectionContentStream = async (
  topic: string, 
  chapterTitle: string, 
  sectionTitle: string, 
  department: string, 
  onChunk: (text: string) => void
) => {
  try {
    const prompt = `Topic: "${topic}"
    Department: ${department}
    Academic Task: Write the content for section "${sectionTitle}" in "${chapterTitle}".
    Requirements: Formal academic tone, Nigerian context, APA 7th citations. 500-800 words.`;

    const stream = await ai.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { systemInstruction: SYSTEM_PROMPT }
    });

    let fullText = "";
    for await (const chunk of stream) {
      // chunk.text is a property on GenerateContentResponse
      if (chunk.text) {
        fullText += chunk.text;
        onChunk(fullText);
      }
    }
    return fullText;
  } catch (error) {
    console.error("Stream generation failed:", error);
    throw error;
  }
};

// Added missing generateChapterContentStream export for Chapter-level generation
export const generateChapterContentStream = async (
  topic: string, 
  chapterTitle: string, 
  department: string, 
  onChunk: (text: string) => void
) => {
  try {
    const prompt = `Topic: "${topic}"
    Department: ${department}
    Academic Task: Write the complete content for "${chapterTitle}".
    Requirements: Formal academic tone, Nigerian context, APA 7th citations. 2000-3000 words. Include all necessary sections based on standard Nigerian University formats.`;

    const stream = await ai.models.generateContentStream({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { systemInstruction: SYSTEM_PROMPT }
    });

    let fullText = "";
    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        onChunk(fullText);
      }
    }
    return fullText;
  } catch (error) {
    console.error("Chapter generation failed:", error);
    throw error;
  }
};
