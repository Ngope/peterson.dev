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

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: content.trim(),
          sessionId: sessionId,
          conversationHistory: history
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to send message');
      }

      // Update remaining count
      if (data.remaining !== undefined) {
        setRemaining(data.remaining);
      }

      // Add assistant response
      const assistantMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: data.response,
        sources: data.sources || [],
        cached: data.cached || false,
        cacheType: data.cacheType,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (err) {
      console.error('Error sending message:', err);
      setError(err.message);

      // Add error message
      const errorMessage = {
        id: `error_${Date.now()}`,
        role: 'error',
        content: `Error: ${err.message}`,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      sendingRef.current = false;
    }
  }, [messages, sessionId, isLoading]);

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
    clearConversation,
    retry
  };
}
