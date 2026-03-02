/**
 * Terminal-style chat interface
 * Main component for the portfolio chatbot
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { useChatSession } from '../hooks/useChatSession';

// --- Suggested prompts shown under the welcome message ---
const SUGGESTED_PROMPTS = [
  'What projects have you worked on?',
  'Tell me about your AWS experience',
  'What is your current role?',
  'Do you have AI/ML experience?',
  'What are your top skills?',
];

// --- Client-side commands (no API call) ---
const CLIENT_COMMANDS = {
  help: `Available commands:
  help, /help     Show this help message
  ls              List directory contents
  pwd             Print working directory
  whoami          Print current user
  cat resume.md   View resume summary
  get resume      Get resume & contact links
  clear           Clear conversation (or Ctrl+L)

Or just ask me anything about Peterson!`,

  ls: `total 6
drwxr-xr-x  experience/
drwxr-xr-x  projects/
drwxr-xr-x  skills/
drwxr-xr-x  contact/
-rw-r--r--  resume.md
-rw-r--r--  about.md`,

  pwd: `/home/visitor/peterson.dev`,

  whoami: `visitor`,

  'cat resume.md': `Peterson Ngo — Software Engineer III (AI/R&D)
Chicago, IL

Current: FloQast Inc. — building agentic AI platforms for accountants
Previous: Discover Financial Services — backend & cloud infrastructure

4+ years of experience in backend systems, cloud (AWS), and AI/ML.
CODiE Award winner 2025 · ~$3M ARR in 11 months

Type "get resume" for full resume & contact links.`,

  'get resume': `Full resume & contact:

  LinkedIn:  https://linkedin.com/in/petersonngo
  GitHub:    https://github.com/ngope
  Email:     ngop0629@gmail.com`,
};

// Render text content, turning URLs into clickable links
function renderContent(content) {
  const parts = content.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline hover:text-green-200">{part}</a>
      : part
  );
}

export default function TerminalChat() {
  const {
    messages,
    isLoading,
    remaining,
    sendMessage,
    addLocalMessage,
    clearConversation,
    retry
  } = useChatSession();

  const [input, setInput] = useState('');
  const [showSources, setShowSources] = useState({});
  const [historyIndex, setHistoryIndex] = useState(-1);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const sentMessagesRef = useRef([]);  // oldest → newest
  const savedInputRef = useRef('');    // input saved before browsing history

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
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // Record in command history and reset browsing state
    sentMessagesRef.current.push(trimmed);
    setHistoryIndex(-1);
    savedInputRef.current = '';
    setInput('');

    const cmd = trimmed.toLowerCase();

    // clear is special — calls clearConversation, not addLocalMessage
    if (cmd === 'clear') {
      clearConversation();
      return;
    }

    // Client-side commands (/help is an alias for help)
    const commandKey = cmd === '/help' ? 'help' : cmd;
    if (commandKey in CLIENT_COMMANDS) {
      addLocalMessage(trimmed, CLIENT_COMMANDS[commandKey]);
      return;
    }

    sendMessage(trimmed);
  };

  const handleKeyDown = (e) => {
    // Ctrl/Cmd + L to clear
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      clearConversation();
      return;
    }

    const msgs = sentMessagesRef.current;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (msgs.length === 0) return;
      if (historyIndex === -1) {
        savedInputRef.current = input;
        const newIndex = msgs.length - 1;
        setHistoryIndex(newIndex);
        setInput(msgs[newIndex]);
      } else if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInput(msgs[newIndex]);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;
      if (historyIndex === msgs.length - 1) {
        setHistoryIndex(-1);
        setInput(savedInputRef.current);
      } else {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInput(msgs[newIndex]);
      }
      return;
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    // Typing manually breaks out of history browsing
    if (historyIndex !== -1) {
      setHistoryIndex(-1);
      savedInputRef.current = '';
    }
  };

  const toggleSources = (messageId) => {
    setShowSources(prev => ({ ...prev, [messageId]: !prev[messageId] }));
  };

  const isWelcomeOnly = messages.length === 1 && messages[0]?.id === 'welcome';
  const lastMessageId = messages[messages.length - 1]?.id;
  const lastMsg = messages[messages.length - 1];

  // Show standalone loader when waiting for the first streaming chunk
  const showStandaloneLoader = isLoading && (
    !lastMsg ||
    lastMsg.role === 'user' ||
    (lastMsg.role === 'assistant' && lastMsg.content === '')
  );

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-4 flex flex-col">
      {/* Terminal Header */}
      <div className="border-b border-green-800 pb-2 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-green-500">●</span>
            <span className="text-yellow-500">●</span>
            <span className="text-red-500">●</span>
            <span className="ml-4">peterson.dev@portfolio:~$</span>
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
                    {renderContent(message.content)}
                    {/* Inline blinking cursor while this message is streaming */}
                    {isLoading && message.id === lastMessageId && message.content.length > 0 && (
                      <span className="animate-blink ml-0.5">▋</span>
                    )}
                  </div>

                  {/* Suggested prompt chips under the welcome message */}
                  {message.id === 'welcome' && isWelcomeOnly && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {SUGGESTED_PROMPTS.map(prompt => (
                        <button
                          key={prompt}
                          onClick={() => sendMessage(prompt)}
                          disabled={isLoading}
                          className="text-xs border border-green-800 text-green-600 hover:border-green-500 hover:text-green-400 px-3 py-1 transition-colors disabled:opacity-40"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  )}

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

        {/* Standalone blinking cursor — shown before first streaming chunk arrives */}
        {showStandaloneLoader && (
          <div className="flex gap-2">
            <span className="text-green-400">$</span>
            <div className="flex items-center gap-1">
              <span className="text-green-300">assistant:</span>
              <span className="animate-blink text-green-400 ml-1">▋</span>
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
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about Peterson or type 'help'..."
            disabled={isLoading || remaining <= 0}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-green-800 disabled:opacity-50"
            maxLength={1000}
          />
        </div>

        <div className="mt-2 text-xs text-green-800 flex justify-between">
          <span>Enter to send • ↑↓ history • Ctrl+L clear</span>
          {input.length > 0 && <span>{input.length}/1000</span>}
        </div>
      </form>

      {/* Contact Footer */}
      <div className="border-t border-green-900 mt-4 pt-2 flex items-center justify-center gap-4 text-xs text-green-800">
        <a href="https://github.com/ngope" target="_blank" rel="noopener noreferrer" className="hover:text-green-500 transition-colors">github</a>
        <span>•</span>
        <a href="https://linkedin.com/in/petersonngo" target="_blank" rel="noopener noreferrer" className="hover:text-green-500 transition-colors">linkedin</a>
        <span>•</span>
        <a href="mailto:ngop0629@gmail.com" className="hover:text-green-500 transition-colors">email</a>
      </div>

      {/* Scanline effect */}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-transparent via-green-950/5 to-transparent animate-scanline" />

      <style jsx>{`
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        .animate-scanline {
          animation: scanline 8s linear infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 1s step-end infinite;
        }
      `}</style>
    </div>
  );
}
