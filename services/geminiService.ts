import { auth, app } from '../firebase';
import { cleanHTML } from "./htmlCleaner";
import { getFunctions, httpsCallable } from 'firebase/functions';

const BASE_URL = import.meta.env.VITE_FIREBASE_STREAM_URL;

const functions = getFunctions(app, 'us-central1');

// Helper to force-refresh and grab the secure token
const getAuthHeaders = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Authentication required. Please log in again.");

  // The 'true' parameter forces Firebase to fetch a completely fresh token
  const token = await user.getIdToken(true);

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

export const generateTopics = async (institutionType: string, institutionName: string, faculty: string, department: string) => {
  try {
    const fn = httpsCallable(functions, 'generateTopics');
    const result = await fn({ institutionType, institutionName, faculty, department });
    return result.data as { title: string }[];
  } catch (error) {
    console.error("Topic generation failed:", error);
    throw error;
  }
};

export const generateOutline = async (topic: string) => {
  try {
    const fn = httpsCallable(functions, 'generateOutline');
    const result = await fn({ topic });
    return result.data as any[];
  } catch (error) {
    console.error("Outline generation failed:", error);
    throw error;
  }
};

export const generateChapterContentStream = async (
  topic: string,
  chapterTitle: string,
  department: string,
  onChunk: (text: string) => void
) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BASE_URL}/generateChapterStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { topic, chapterTitle, department } })
    });

    if (!response.ok || !response.body) throw new Error("Stream connection failed");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      onChunk(cleanHTML(fullText));
    }
    return cleanHTML(fullText);
  } catch (error) {
    console.error("Chapter generation failed:", error);
    throw new Error("Connection lost during generation. Please try again.");
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
    const headers = await getAuthHeaders();
    const response = await fetch(`${BASE_URL}/generateSectionStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { topic, chapterTitle, sectionTitle, department } })
    });

    if (!response.ok || !response.body) throw new Error("Stream connection failed");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      onChunk(cleanHTML(fullText));
    }
    return cleanHTML(fullText);
  } catch (error) {
    console.error("Section generation failed:", error);
    throw new Error("Connection lost during generation. Please try again.");
  }
};

export const elaborateContentStream = async (
  topic: string,
  currentText: string,
  onChunk: (text: string) => void
) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BASE_URL}/elaborateStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { topic, currentText } })
    });

    if (!response.ok || !response.body) throw new Error("Stream connection failed");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      onChunk(cleanHTML(fullText));
    }
    return cleanHTML(fullText);
  } catch (error) {
    console.error("Elaboration failed:", error);
    throw new Error("Connection lost during generation. Please try again.");
  }
};