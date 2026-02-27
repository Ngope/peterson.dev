/**
 * Terminal-style chat interface
 * Main component for the portfolio chatbot
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatSession } from '../hooks/useChatSession';

export default function TerminalChat() {
  const {
    messages,
    isLoading,
    error,
    remaining,
    sendMessage,
    clearConversation,
    retry
  } = useChatSession();

  const [input, setInput] = useState('');
  const [showSources, setShowSources] = useState({});
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      sendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e) => {
    // Ctrl/Cmd + L to clear
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      clearConversation();
    }
  };

  const toggleSources = (messageId) => {
    setShowSources(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-4 flex flex-col">
      {/* Terminal Header */}
      <div className="border-b border-green-800 pb-2 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-500">●</span>
            <span className="text-yellow-500">●</span>
            <span className="text-red-500">●</span>
            <span className="ml-4">peterson@portfolio:~$</span>
          </div>
          <div className="text-sm text-green-600">
            {remaining} messages remaining
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className="message">
            {message.role === 'user' && (
              <div className="flex gap-2">
                <span className="text-blue-400">&gt;</span>
                <div className="flex-1">
                  <span className="text-blue-300">user:</span>
                  <span className="ml-2 text-white">{message.content}</span>
                </div>
              </div>
            )}

            {message.role === 'assistant' && (
              <div className="flex gap-2">
                <span className="text-green-400">$</span>
                <div className="flex-1">
                  <span className="text-green-300">assistant:</span>
                  <div className="ml-2 text-green-100 whitespace-pre-wrap">
                    {message.content}
                  </div>

                  {/* Cached indicator */}
                  {message.cached && (
                    <div className="mt-2 text-xs text-green-700">
                      [cached {message.cacheType === 'semantic' ? '~ semantic match' : '✓ exact match'}]
                    </div>
                  )}

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => toggleSources(message.id)}
                        className="text-xs text-green-600 hover:text-green-400 underline"
                      >
                        {showSources[message.id] ? '▼ Hide sources' : '▶ View sources'}
                      </button>

                      {showSources[message.id] && (
                        <div className="mt-2 space-y-2 border-l-2 border-green-800 pl-3">
                          {message.sources.map((source, idx) => (
                            <div key={idx} className="text-xs text-green-700">
                              <div className="flex items-center gap-2">
                                <span className="text-green-600">[{(source.similarity * 100).toFixed(0)}%]</span>
                                <span className="text-green-500">{source.section}</span>
                                <span className="text-green-800">({source.source})</span>
                              </div>
                              {source.preview && (
                                <div className="mt-1 text-green-900 italic">
                                  {source.preview}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {message.role === 'error' && (
              <div className="flex gap-2">
                <span className="text-red-400">✗</span>
                <div className="flex-1 text-red-300">
                  {message.content}
                  <button
                    onClick={retry}
                    className="ml-4 text-xs underline hover:text-red-100"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-2">
            <span className="text-green-400">$</span>
            <div className="flex items-center gap-2">
              <span className="text-green-300">assistant:</span>
              <div className="flex gap-1">
                <span className="animate-pulse">.</span>
                <span className="animate-pulse delay-100">.</span>
                <span className="animate-pulse delay-200">.</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="border-t border-green-800 pt-4">
        <div className="flex gap-2 items-center">
          <span className="text-blue-400">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about Peterson's experience, skills, projects..."
            disabled={isLoading || remaining <= 0}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-green-800 disabled:opacity-50"
            maxLength={1000}
          />
        </div>

        {/* Help text */}
        <div className="mt-2 text-xs text-green-800 flex justify-between">
          <span>Press Enter to send • Ctrl+L to clear</span>
          {input.length > 0 && (
            <span>{input.length}/1000</span>
          )}
        </div>
      </form>

      {/* Scanline effect (subtle) */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-transparent via-green-950/5 to-transparent animate-scanline" />

      <style jsx>{`
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        .animate-scanline {
          animation: scanline 8s linear infinite;
        }
        .delay-100 {
          animation-delay: 0.1s;
        }
        .delay-200 {
          animation-delay: 0.2s;
        }
      `}</style>
    </div>
  );
}
