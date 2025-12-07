import { useEffect, useRef, useCallback, useState } from 'react';
import { useChatStore } from '../../stores/chat-store';
import { useAppStore } from '../../stores/app-store';
import type { ChatMessage } from '../../../shared/types';

// Catppuccin Mocha colors
const colors = {
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b',
  surface0: '#313244',
  surface1: '#45475a',
  surface2: '#585b70',
  overlay0: '#6c7086',
  overlay1: '#7f849c',
  text: '#cdd6f4',
  subtext0: '#a6adc8',
  subtext1: '#bac2de',
  lavender: '#b4befe',
  blue: '#89b4fa',
  sapphire: '#74c7ec',
  sky: '#89dceb',
  teal: '#94e2d5',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  peach: '#fab387',
  maroon: '#eba0ac',
  red: '#f38ba8',
  mauve: '#cba6f7',
  pink: '#f5c2e7',
  flamingo: '#f2cdcd',
  rosewater: '#f5e0dc',
};

export function Chat() {
  const {
    messages,
    currentSession,
    inputMessage,
    isStreaming,
    streamingContent,
    setSessions,
    setCurrentSession,
    setMessages,
    addMessage,
    setInputMessage,
    setIsStreaming,
    setStreamingContent,
    clearStreamingContent,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Note autocomplete state
  const { notes } = useAppStore();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Load sessions on mount
  useEffect(() => {
    window.electron.ai.getSessions().then(setSessions);
  }, []);

  // Load messages when session changes
  useEffect(() => {
    if (currentSession) {
      window.electron.ai.getMessages(currentSession.id).then(setMessages);
    } else {
      setMessages([]);
    }
  }, [currentSession?.id]);

  // Setup stream listeners
  useEffect(() => {
    const unsubChunk = window.electron.ai.onStreamChunk(({ fullContent }) => {
      setStreamingContent(fullContent);
    });

    const unsubEnd = window.electron.ai.onStreamEnd(({ message, sessionId }) => {
      setIsStreaming(false);
      clearStreamingContent();
      addMessage(message);
      
      // Update current session if new
      if (!currentSession || currentSession.id !== sessionId) {
        window.electron.ai.getSessions().then(sessions => {
          setSessions(sessions);
          const newSession = sessions.find(s => s.id === sessionId);
          if (newSession) {
            setCurrentSession(newSession);
          }
        });
      }
    });

    const unsubError = window.electron.ai.onStreamError(({ error }) => {
      setIsStreaming(false);
      clearStreamingContent();
      setError(error);
    });

    return () => {
      unsubChunk();
      unsubEnd();
      unsubError();
    };
  }, [currentSession]);

  const handleSend = useCallback(async () => {
    if (!inputMessage.trim() || isStreaming) return;

    const message = inputMessage.trim();
    setInputMessage('');
    setError(null);

    // Add user message to UI immediately
    const userMessage: ChatMessage = {
      id: Date.now(),
      sessionId: currentSession?.id ?? 0,
      role: 'user',
      content: message,
      createdAt: new Date(),
    };
    addMessage(userMessage);

    setIsStreaming(true);

    try {
      await window.electron.ai.sendMessage(currentSession?.id ?? null, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsStreaming(false);
    }
  }, [inputMessage, isStreaming, currentSession]);

  // Handle input change for @ mentions
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setInputMessage(value);

    // Check if we're typing a mention
    const textBeforeCursor = value.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      // Check if @ is at start or after a space
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1).toLowerCase();
        const matches = notes
          .map(n => n.name)
          .filter(name => name.toLowerCase().includes(query))
          .slice(0, 8);
        
        if (matches.length > 0) {
          setSuggestions(matches);
          setShowSuggestions(true);
          setSelectedSuggestion(0);
          setMentionStart(atIndex);
          return;
        }
      }
    }
    
    setShowSuggestions(false);
    setSuggestions([]);
  }, [notes, setInputMessage]);

  // Complete the mention
  const completeMention = useCallback((noteName: string) => {
    if (mentionStart === -1) return;
    
    const cursorPos = textareaRef.current?.selectionStart || inputMessage.length;
    const before = inputMessage.slice(0, mentionStart);
    const after = inputMessage.slice(cursorPos);
    
    const newValue = `${before}@${noteName} ${after}`;
    setInputMessage(newValue);
    setShowSuggestions(false);
    setSuggestions([]);
    setMentionStart(-1);
    
    // Focus back and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = mentionStart + noteName.length + 2; // @ + name + space
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  }, [inputMessage, mentionStart, setInputMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle suggestions navigation
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        completeMention(suggestions[selectedSuggestion]);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }
    
    // Normal send behavior
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, showSuggestions, suggestions, selectedSuggestion, completeMention]);

  const handleNewSession = useCallback(() => {
    setCurrentSession(null);
    setMessages([]);
    clearStreamingContent();
  }, []);

  const handleCancel = useCallback(() => {
    if (currentSession) {
      window.electron.ai.cancel(currentSession.id);
    }
  }, [currentSession]);

  return (
    <div 
      className="flex flex-col h-full"
      style={{ backgroundColor: colors.base }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: colors.surface0 }}
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" style={{ color: colors.mauve }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="font-medium" style={{ color: colors.text }}>
            AI Assistant
          </span>
          {currentSession && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: colors.surface1, color: colors.subtext0 }}>
              Session #{currentSession.id}
            </span>
          )}
        </div>
        <button
          onClick={handleNewSession}
          className="px-3 py-1.5 rounded text-sm transition-colors"
          style={{ 
            backgroundColor: colors.surface0,
            color: colors.text,
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = colors.surface1}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = colors.surface0}
        >
          New Chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="text-center py-12">
            <div 
              className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: colors.surface0 }}
            >
              <svg className="w-8 h-8" style={{ color: colors.mauve }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ color: colors.text }}>
              Start a conversation
            </h3>
            <p className="text-sm max-w-md mx-auto" style={{ color: colors.subtext0 }}>
              Ask me to search, create, or modify your notes. I can help you organize your knowledge base.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isStreaming && streamingContent && (
          <MessageBubble
            message={{
              id: -1,
              sessionId: currentSession?.id ?? 0,
              role: 'assistant',
              content: streamingContent,
              createdAt: new Date(),
            }}
            isStreaming
          />
        )}

        {error && (
          <div 
            className="p-3 rounded-lg text-sm"
            style={{ backgroundColor: `${colors.red}20`, color: colors.red }}
          >
            <strong>Error:</strong> {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div 
        className="p-4 border-t relative"
        style={{ borderColor: colors.surface0 }}
      >
        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div 
            className="absolute bottom-full left-4 right-4 mb-2 rounded-lg overflow-hidden shadow-lg border"
            style={{ 
              backgroundColor: colors.surface0,
              borderColor: colors.surface1,
              maxHeight: '200px',
              overflowY: 'auto',
            }}
          >
            {suggestions.map((name, index) => (
              <button
                key={name}
                onClick={() => completeMention(name)}
                className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: index === selectedSuggestion ? colors.surface1 : 'transparent',
                  color: colors.text,
                }}
                onMouseEnter={() => setSelectedSuggestion(index)}
              >
                <span style={{ color: colors.mauve }}>@</span>
                <span>{name}</span>
              </button>
            ))}
          </div>
        )}
        
        <div 
          className="flex items-end gap-2 rounded-lg p-2"
          style={{ backgroundColor: colors.surface0 }}
        >
          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your notes... (use @ to mention notes)"
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-sm"
            style={{ 
              color: colors.text,
              minHeight: '24px',
              maxHeight: '120px',
            }}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={handleCancel}
              className="p-2 rounded-lg transition-colors"
              style={{ backgroundColor: colors.red, color: colors.crust }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputMessage.trim()}
              className="p-2 rounded-lg transition-colors disabled:opacity-50"
              style={{ 
                backgroundColor: inputMessage.trim() ? colors.mauve : colors.surface1,
                color: colors.crust,
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-xs mt-2" style={{ color: colors.overlay0 }}>
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 ${isStreaming ? 'animate-pulse' : ''}`}
        style={{
          backgroundColor: isUser ? colors.mauve : colors.surface0,
          color: isUser ? colors.crust : colors.text,
        }}
      >
        {/* Tool calls indicator */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 pb-2 border-b" style={{ borderColor: isUser ? colors.crust : colors.surface1 }}>
            <span className="text-xs font-medium" style={{ color: isUser ? colors.crust : colors.subtext0 }}>
              🔧 Used {message.toolCalls.length} tool{message.toolCalls.length > 1 ? 's' : ''}:
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {message.toolCalls.map((tc, index) => (
                <span 
                  key={tc.id || `tool-${index}`} 
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ 
                    backgroundColor: isUser ? `${colors.crust}40` : colors.surface1,
                    color: isUser ? colors.crust : colors.subtext1,
                  }}
                >
                  {tc.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Message content */}
        <div className="text-sm whitespace-pre-wrap break-words">
          {message.content}
        </div>

        {/* Timestamp */}
        <div 
          className="text-xs mt-1.5 opacity-60"
          style={{ color: isUser ? colors.crust : colors.subtext0 }}
        >
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
