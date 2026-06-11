import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, app } from '../firebase';
import { cleanHTML } from './htmlCleaner';

const functions = getFunctions(app, 'us-central1');

// Stream timeout: 90 seconds max for any streaming operation
const STREAM_TIMEOUT_MS = 90_000;

// Max retries for failed stream connections
const MAX_RETRIES = 2;

const assertOnline = () => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are currently offline. Please reconnect to use AI features.');
  }
};

// Signal a global "connection issue" to the OfflineBanner when a stream call
// fails despite navigator.onLine reporting online — captive portals, lossy
// Wi-Fi, and DNS hiccups can leave the browser reporting online while
// functions are unreachable.
const reportConnectionIssue = () => {
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    try { window.dispatchEvent(new CustomEvent('pm:connection-issue')); } catch { /* noop */ }
  }
};

// Convert a stream-call error into a user-facing message. HTTP failures
// carry the response body (e.g. "Too many requests") via the `body` field
// stashed by fetchWithRetry. Network/timeout errors fall back to the
// generic "Connection lost" message.
const friendlyStreamError = (error: any, label: string): string => {
  const status = error?.status as number | undefined;
  const body = (error?.body as string | undefined) || '';
  if (status === 401) return 'Your session expired. Please reload and sign in again.';
  if (status === 403) return body || 'Not authorized for this project.';
  if (status === 404) return body || 'Project not found. Please reload.';
  if (status === 429) return 'Too many requests. Please wait a minute and try again.';
  if (status === 400) return body || 'Invalid request. Please reload and try again.';
  if (status && status >= 500) return body || `Server error (${status}). Please try again.`;
  if (typeof error?.message === 'string' && error.message.startsWith('Generation timed out')) {
    return error.message;
  }
  return `${label} failed. Please check your connection and try again.`;
};

/** Wrap a stream read loop with a timeout to prevent indefinite hangs */
const readStreamWithTimeout = async (
  response: Response,
  onChunk: (text: string) => void,
  timeoutMs: number = STREAM_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<string> => {
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let fullText = '';
  let timedOut = false;
  let aborted = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    reader.cancel();
  }, timeoutMs);

  // Honor an external abort signal — cancels the reader so user navigation /
  // unmount stops both client work AND server-side streaming (the server's
  // for-await loop terminates when the underlying socket closes).
  const onAbort = () => {
    aborted = true;
    reader.cancel();
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullText += decoder.decode(value, { stream: true });
      onChunk(cleanHTML(fullText));
    }
  } catch (err) {
    // reader.cancel() from timeout or abort produces an AbortError — handle it below
    if (!timedOut && !aborted) throw err;
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }

  if (aborted) {
    const e = new Error('Generation cancelled.');
    (e as any).name = 'AbortError';
    throw e;
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

      // Read the response body so the eventual toast surfaces the actual
      // server message ("Project not found", "Too many requests", etc.)
      // instead of a generic HTTP code.
      const bodyText = await response.text().catch(() => '');
      const detail = bodyText.slice(0, 200);

      // Don't retry client errors (4xx) — they won't succeed on retry
      if (response.status >= 400 && response.status < 500) {
        throw Object.assign(
          new Error(`HTTP ${response.status}: ${detail || response.statusText}`),
          { status: response.status, body: detail },
        );
      }

      // Server errors (5xx) are retryable
      throw Object.assign(
        new Error(`HTTP ${response.status}: ${detail || response.statusText}`),
        { status: response.status, body: detail, retryable: true },
      );
    } catch (error: any) {
      lastError = error;
      // Don't retry user-cancelled requests
      if (error?.name === 'AbortError' || options.signal?.aborted) throw error;
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
    assertOnline();
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
    assertOnline();
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
const getAuthHeaders = async (forceRefresh = true) => {
  await waitForAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated. Please log in again.');
  const token = await user.getIdToken(forceRefresh);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

// Fetch with auth + a single token-refresh retry on 401. The ID token has a
// 1-hour TTL; a session that idled near expiry can hit the function just
// after the token died. Without retry the user sees "Connection lost" and
// has to click again, paying for a second AI call.
const fetchWithAuth = async (
  url: string,
  init: Omit<RequestInit, 'headers'> & { body?: BodyInit | null },
  signal?: AbortSignal,
): Promise<Response> => {
  const headers = await getAuthHeaders(false);
  try {
    return await fetchWithRetry(url, { ...init, headers });
  } catch (e: any) {
    const msg = typeof e?.message === 'string' ? e.message : '';
    if (msg.startsWith('HTTP 401') && !signal?.aborted) {
      const refreshed = await getAuthHeaders(true);
      return await fetchWithRetry(url, { ...init, headers: refreshed });
    }
    throw e;
  }
};

const BASE_URL = import.meta.env.VITE_FIREBASE_STREAM_URL;
if (!BASE_URL) throw new Error('VITE_FIREBASE_STREAM_URL is not configured.');

export const generateChapterContentStream = async (
  projectId: string,
  topic: string,
  chapterTitle: string,
  department: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) => {
  try {
    assertOnline();
    const response = await fetchWithAuth(`${BASE_URL}/generateChapterStream`, {
      method: 'POST',
      signal,
      body: JSON.stringify({ data: { projectId, topic, chapterTitle, department } }),
    }, signal);
    return await readStreamWithTimeout(response, onChunk, STREAM_TIMEOUT_MS, signal);
  } catch (error: any) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error;
    console.error('Chapter generation failed:', error);
    reportConnectionIssue();
    throw new Error(friendlyStreamError(error, 'Chapter generation'));
  }
};

export const generateSectionContentStream = async (
  projectId: string,
  topic: string,
  chapterTitle: string,
  sectionTitle: string,
  department: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) => {
  try {
    assertOnline();
    const response = await fetchWithAuth(`${BASE_URL}/generateSectionStream`, {
      method: 'POST',
      signal,
      body: JSON.stringify({ data: { projectId, topic, chapterTitle, sectionTitle, department } }),
    }, signal);
    return await readStreamWithTimeout(response, onChunk, STREAM_TIMEOUT_MS, signal);
  } catch (error: any) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error;
    console.error('Section generation failed:', error);
    reportConnectionIssue();
    throw new Error(friendlyStreamError(error, 'Section generation'));
  }
};

/** Fetch a short inline suggestion (1-2 sentences) for ghost text autocomplete. */
export const fetchSuggestion = async (
  projectId: string,
  topic: string,
  contextText: string,
  signal?: AbortSignal
): Promise<string | null> => {
  try {
    assertOnline();
    const headers = await getAuthHeaders();
    const response = await fetch(`${BASE_URL}/elaborateStream`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        data: {
          projectId,
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
  projectId: string,
  topic: string,
  currentText: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) => {
  try {
    assertOnline();
    const response = await fetchWithAuth(`${BASE_URL}/elaborateStream`, {
      method: 'POST',
      signal,
      body: JSON.stringify({ data: { projectId, topic, currentText } }),
    }, signal);
    return await readStreamWithTimeout(response, onChunk, STREAM_TIMEOUT_MS, signal);
  } catch (error: any) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error;
    console.error('Elaboration failed:', error);
    reportConnectionIssue();
    throw new Error(friendlyStreamError(error, 'Elaboration'));
  }
};