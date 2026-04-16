import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, app } from '../firebase';
import { cleanHTML } from './htmlCleaner';

const functions = getFunctions(app, 'us-central1');

// Stream timeout: 90 seconds max for any streaming operation
const STREAM_TIMEOUT_MS = 90_000;

// Max retries for failed stream connections
const MAX_RETRIES = 2;

/** Wrap a stream read loop with a timeout to prevent indefinite hangs */
const readStreamWithTimeout = async (
  response: Response,
  onChunk: (text: string) => void,
  timeoutMs: number = STREAM_TIMEOUT_MS
): Promise<string> => {
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    reader.cancel();
  }, timeoutMs);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      onChunk(cleanHTML(fullText));
    }
  } catch (err) {
    // reader.cancel() from timeout causes an AbortError — handle it below
    if (!timedOut) throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (timedOut) {
    throw new Error('Generation timed out. Please try again.');
  }

  return cleanHTML(fullText);
};

/** Retry a fetch with exponential backoff — only retries on network errors and 5xx */
const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  maxRetries: number = MAX_RETRIES
): Promise<Response> => {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;

      // Don't retry client errors (4xx) — they won't succeed on retry
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Server errors (5xx) are retryable
      throw Object.assign(new Error(`HTTP ${response.status}: ${response.statusText}`), { retryable: true });
    } catch (error: any) {
      lastError = error;
      // Only retry on network errors (no response) or 5xx server errors
      const isRetryable = !error.message?.startsWith('HTTP 4') && (error.retryable || !error.message?.startsWith('HTTP'));
      if (attempt < maxRetries && isRetryable) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      } else {
        throw error;
      }
    }
  }
  throw lastError || new Error('Fetch failed after retries');
};

// Waits until Firebase Auth has a fully resolved, token-ready user
const waitForAuth = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // If already signed in and token is ready, resolve immediately
    if (auth.currentUser) {
      resolve();
      return;
    }
    // Otherwise wait for auth state to settle (max 10 seconds)
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Authentication timed out. Please log in again.'));
    }, 10000);

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
};

export const generateTopics = async (
  institutionType: string,
  institutionName: string,
  faculty: string,
  department: string
) => {
  try {
    await waitForAuth();
    
    // Force a fresh token before calling the function
    await auth.currentUser?.getIdToken(true); 
    
    const fn = httpsCallable(functions, 'generateTopics');
    const result = await fn({ institutionType, institutionName, faculty, department });
    return (result.data as { title: string }[]) || [];
  } catch (error) {
    console.error('Topic generation failed:', error);
    throw error;
  }
};

export const generateOutline = async (topic: string) => {
  try {
    await waitForAuth();
    const fn = httpsCallable(functions, 'generateOutline');
    const result = await fn({ topic });
    return (result.data as any[]) || [];
  } catch (error) {
    console.error('Outline generation failed:', error);
    throw error;
  }
};

// For the streaming functions, keep using fetch but get token after waitForAuth
const getAuthHeaders = async () => {
  await waitForAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated. Please log in again.');
  const token = await user.getIdToken(true);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

const BASE_URL = import.meta.env.VITE_FIREBASE_STREAM_URL;

export const generateChapterContentStream = async (
  topic: string,
  chapterTitle: string,
  department: string,
  onChunk: (text: string) => void
) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetchWithRetry(`${BASE_URL}/generateChapterStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { topic, chapterTitle, department } }),
    });
    return await readStreamWithTimeout(response, onChunk);
  } catch (error) {
    console.error('Chapter generation failed:', error);
    throw new Error('Connection lost during generation. Please try again.');
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
    const response = await fetchWithRetry(`${BASE_URL}/generateSectionStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { topic, chapterTitle, sectionTitle, department } }),
    });
    return await readStreamWithTimeout(response, onChunk);
  } catch (error) {
    console.error('Section generation failed:', error);
    throw new Error('Connection lost during generation. Please try again.');
  }
};

/** Fetch a short inline suggestion (1-2 sentences) for ghost text autocomplete. */
export const fetchSuggestion = async (
  topic: string,
  contextText: string,
  signal?: AbortSignal
): Promise<string | null> => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BASE_URL}/elaborateStream`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        data: {
          topic,
          currentText: `SUGGESTION MODE: Complete the following academic text with exactly 1-2 sentences. Return ONLY the continuation text — no HTML tags, no formatting, no preamble. Just plain text that naturally continues the passage.\n\nText to continue: "${contextText.slice(-300)}"`,
        },
      }),
    });

    if (!response.body) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
      // Cap at 200 chars for a short suggestion
      if (result.length > 200) {
        reader.cancel();
        break;
      }
    }

    // Strip any HTML tags the AI might sneak in, trim whitespace
    const cleaned = result.replace(/<[^>]*>/g, '').trim().slice(0, 200);
    return cleaned || null;
  } catch {
    return null;
  }
};

export const elaborateContentStream = async (
  topic: string,
  currentText: string,
  onChunk: (text: string) => void
) => {
  try {
    const headers = await getAuthHeaders();
    const response = await fetchWithRetry(`${BASE_URL}/elaborateStream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: { topic, currentText } }),
    });
    return await readStreamWithTimeout(response, onChunk);
  } catch (error) {
    console.error('Elaboration failed:', error);
    throw new Error('Connection lost during generation. Please try again.');
  }
};