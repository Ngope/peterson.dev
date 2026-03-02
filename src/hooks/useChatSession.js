/**
 * Chat session hook
 * Manages API communication and message state
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSessionId, saveHistory, loadHistory, clearHistory } from '../lib/sessionManager';

export function useChatSession() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remaining, setRemaining] = useState(20);
  const [sessionId, setSessionId] = useState(null);

  // Ref to prevent double-sending
  const sendingRef = useRef(false);
  // AbortController for cancelling in-flight streams on unmount
  const abortControllerRef = useRef(null);

  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  // Initialize session and load history
  useEffect(() => {
    const id = getSessionId();
    setSessionId(id);

    const history = loadHistory();
    if (history.length > 0) {
      setMessages(history);
    } else {
      // Add welcome message if no history
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Welcome! I'm Peterson's AI assistant. Ask me anything about his experience, skills, or projects.

Try asking:
• "What projects have you worked on?"
• "Tell me about your AWS experience"
• "What is your current role?"
• "Do you have AI/ML experience?"`,
        timestamp: new Date().toISOString()
      }]);
    }
  }, []);

  // Save history whenever messages change
  useEffect(() => {
    if (messages.length > 0 && messages[0].id !== 'welcome') {
      saveHistory(messages);
    }
  }, [messages]);

  /**
   * Send message to API
   */
  const sendMessage = useCallback(async (content) => {
    if (!content || !content.trim()) {
      return;
    }

    if (sendingRef.current) {
      console.log('Already sending a message, ignoring duplicate');
      return;
    }

    if (isLoading) {
      return;
    }

    sendingRef.current = true;
    setIsLoading(true);
    setError(null);

    // Add user message immediately
    const userMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);

    try {
      // Get conversation history (last 4 messages for context)
      const history = messages
        .filter(m => m.id !== 'welcome')
        .slice(-4)
        .map(m => ({ role: m.role, content: m.content }));

      abortControllerRef.current = new AbortController();

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content.trim(),
          sessionId: sessionId,
          conversationHistory: history
        }),
        signal: abortControllerRef.current.signal
      });

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        // --- Streaming response (live Gemini call) ---
        const assistantId = `assistant_${Date.now()}`;
        setMessages(prev => [...prev, {
          id: assistantId,
          role: 'assistant',
          content: '',
          sources: [],
          cached: false,
          timestamp: new Date().toISOString()
        }]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop(); // keep any incomplete trailing chunk

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const event = JSON.parse(line.slice(6));

            if (event.type === 'meta') {
              setRemaining(event.remaining);
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, sources: event.sources } : m
              ));
            } else if (event.type === 'chunk') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: m.content + event.text } : m
              ));
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          }
        }
      } else {
        // --- JSON response (cache hit) ---
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to send message');
        }

        if (data.remaining !== undefined) {
          setRemaining(data.remaining);
        }

        setMessages(prev => [...prev, {
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          content: data.response,
          sources: data.sources || [],
          cached: data.cached || false,
          cacheType: data.cacheType,
          timestamp: new Date().toISOString()
        }]);
      }

    } catch (err) {
      // Ignore aborts caused by component unmount
      if (err.name === 'AbortError') return;

      console.error('Error sending message:', err);
      setError(err.message);

      setMessages(prev => [...prev, {
        id: `error_${Date.now()}`,
        role: 'error',
        content: `Error: ${err.message}`,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setIsLoading(false);
      sendingRef.current = false;
    }
  }, [messages, sessionId, isLoading]);

  /**
   * Add a local message pair (user echo + assistant reply) without hitting the API.
   * Used for client-side commands (help, ls, easter eggs, etc.)
   */
  const addLocalMessage = useCallback((userInput, response) => {
    setMessages(prev => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        role: 'user',
        content: userInput,
        timestamp: new Date().toISOString()
      },
      {
        id: `assistant_${Date.now() + 1}`,
        role: 'assistant',
        content: response,
        sources: [],
        cached: false,
        timestamp: new Date().toISOString()
      }
    ]);
  }, []);

  /**
   * Clear conversation
   */
  const clearConversation = useCallback(() => {
    clearHistory();
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Conversation cleared! Ask me anything about Peterson's experience, skills, or projects.`,
      timestamp: new Date().toISOString()
    }]);
    setError(null);
    setRemaining(20);
  }, []);

  /**
   * Retry last message (on error)
   */
  const retry = useCallback(() => {
    // Find last user message
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      // Remove error message
      setMessages(prev => prev.filter(m => m.role !== 'error'));
      sendMessage(lastUserMessage.content);
    }
  }, [messages, sendMessage]);

  return {
    messages,
    isLoading,
    error,
    remaining,
    sessionId,
    sendMessage,
    addLocalMessage,
    clearConversation,
    retry
  };
}
