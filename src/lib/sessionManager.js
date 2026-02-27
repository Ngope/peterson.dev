/**
 * Session management utilities
 * Handles session ID generation and persistence
 */

import { v4 as uuidv4 } from 'uuid';

const SESSION_KEY = 'chat_session_id';
const HISTORY_KEY = 'chat_history';

/**
 * Get or create session ID
 */
export function getSessionId() {
  if (typeof window === 'undefined') {
    return null; // Server-side
  }

  let sessionId = localStorage.getItem(SESSION_KEY);

  if (!sessionId) {
    sessionId = uuidv4();
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  return sessionId;
}

/**
 * Clear current session
 */
export function clearSession() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(HISTORY_KEY);
}

/**
 * Save conversation history
 */
export function saveHistory(messages) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
  } catch (error) {
    console.error('Error saving history:', error);
  }
}

/**
 * Load conversation history
 */
export function loadHistory() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const history = localStorage.getItem(HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Error loading history:', error);
    return [];
  }
}

/**
 * Clear conversation history (keep session ID)
 */
export function clearHistory() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(HISTORY_KEY);
}
