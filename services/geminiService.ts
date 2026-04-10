
import { GoogleGenAI, Type } from "@google/genai";
import { cleanHTML } from "./htmlCleaner";

const ai = new GoogleGenAI({apiKey: import.meta.env.VITE_GEMINI_API_KEY || ''});

const PHD_SYSTEM_PROMPT = `You are a PhD-level Academic Thesis Writer specializing in the Nigerian Educational System.
Your writing style is formal, sophisticated, and analytical.
CRITICAL RULES:
1. Reference Standard: APA 7th Edition.
2. Content Volume: Be extremely verbose. Generate 600-800 words per sub-section.
3. Nigerian Context: Always prioritize Nigerian scholars (e.g., Adewale, 2019; Okonkwo, 2022; Balogun, 2023).
4. Formatting: Return content as a valid HTML string using ONLY <h3> for headers, <b> for bolding, and <p> for paragraphs.
5. NO MARKDOWN: Never use # or ** in your output.
6. Tone: PhD level. Use advanced vocabulary and transition words (e.g., "Furthermore," "Conversely," "In the light of the foregoing").
7. Bibliography: When generating references, ensure they are alphabetically ordered and follow strict APA 7th Edition hanging indent style (simulated with HTML margins).`;

export const generateTopics = async (institutionType: string, institutionName: string, faculty: string, department: string) => {
  try {
    const prompt = `Generate 5 high-level research project topics for a student at ${institutionName}, Faculty of ${faculty}, Department of ${department}. 
    Ensure topics are suitable for final-year thesis and have strong local Nigerian relevance.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        systemInstruction: PHD_SYSTEM_PROMPT,
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

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Topic generation failed:", error);
    return [];
  }
};

export const generateOutline = async (topic: string) => {
  try {
    const prompt = `Create a standard Nigerian University Project Table of Contents for: "${topic}". 
    Include CHAPTER ONE: INTRODUCTION, CHAPTER TWO: LITERATURE REVIEW, CHAPTER THREE: METHODOLOGY, CHAPTER FOUR: RESULTS AND DISCUSSION, CHAPTER FIVE: SUMMARY, CONCLUSION AND RECOMMENDATIONS, and a final chapter titled REFERENCES. 
    Ensure at least 5 sub-sections per chapter. For REFERENCES, include sections for Primary Sources and Secondary Sources.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: prompt,
      config: {
        systemInstruction: PHD_SYSTEM_PROMPT,
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
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Outline generation failed:", error);
    return [];
  }
};

export const generateChapterContentStream = async (
  topic: string, 
  chapterTitle: string, 
  department: string, 
  onChunk: (text: string) => void
) => {
  try {
    const isReferences = chapterTitle.toUpperCase().includes('REFERENCES');
    const prompt = isReferences 
      ? `Research Topic: "${topic}"
         Department: ${department}
         Task: Generate a comprehensive bibliography of academic sources in APA 7th Edition format. 
         Ensure all sources are highly relevant to the topic and include at least 15-20 credible sources, including Nigerian authors.
         Format as HTML list of paragraphs.`
      : `Research Topic: "${topic}"
         Department: ${department}
         Target Chapter: "${chapterTitle}".
         Task: Write a comprehensive PhD-level academic analysis for the entire chapter (approx 2500-3000 words).
         Requirement: Include local Nigerian citations and use HTML tags (<h3>, <b>, <p>).`;

    const stream = await ai.models.generateContentStream({
      model: 'gemini-1.5-pro',
      contents: prompt,
      config: { systemInstruction: PHD_SYSTEM_PROMPT }
    });

    let fullText = "";
    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        onChunk(cleanHTML(fullText));
      }
    }
    return cleanHTML(fullText);
  } catch (error) {
    console.error("Chapter generation failed:", error);
    throw error;
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
    const isReferences = chapterTitle.toUpperCase().includes('REFERENCES');
    const prompt = isReferences
      ? `Research Topic: "${topic}"
         Task: Generate a list of academic references in APA 7th Edition format for the section "${sectionTitle}".
         Ensure sources are scholarly and specifically related to ${topic}. 
         Use HTML tags (<p>, <b>).`
      : `Research Topic: "${topic}"
         Department: ${department}
         Target Section: "${sectionTitle}" in "${chapterTitle}".
         Task: Write a detailed PhD-level academic analysis (600-800 words).
         Requirement: Include local Nigerian citations and use HTML tags (<h3>, <b>, <p>).`;

    const stream = await ai.models.generateContentStream({
      model: 'gemini-1.5-pro',
      contents: prompt,
      config: { systemInstruction: PHD_SYSTEM_PROMPT }
    });

    let fullText = "";
    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        onChunk(cleanHTML(fullText));
      }
    }
    return cleanHTML(fullText);
  } catch (error) {
    console.error("Stream generation failed:", error);
    throw error;
  }
};

export const elaborateContentStream = async (
  topic: string,
  currentText: string,
  onChunk: (text: string) => void
) => {
  try {
    const prompt = `Research Topic: "${topic}"
    Current Progress: "${currentText.slice(-1000)}"
    Task: Elaborate on the point above and continue the academic discussion. 
    Provide 2-3 additional sophisticated paragraphs that flow naturally from the existing text.
    Requirement: Maintain PhD-level tone and use HTML tags (<p>, <b>).`;

    const stream = await ai.models.generateContentStream({
      model: 'gemini-1.5-pro',
      contents: prompt,
      config: { systemInstruction: PHD_SYSTEM_PROMPT }
    });

    let fullText = "";
    for await (const chunk of stream) {
      if (chunk.text) {
        fullText += chunk.text;
        onChunk(cleanHTML(fullText));
      }
    }
    return cleanHTML(fullText);
  } catch (error) {
    console.error("Elaboration failed:", error);
    throw error;
  }
};
