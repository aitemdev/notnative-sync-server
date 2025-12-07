import { useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatStore } from '../../stores/chat-store';
import { useAppStore } from '../../stores/app-store';
import type { ChatMessage } from '../../../shared/types';

// Component to render content with wiki-links as clickable buttons
function WikiLinkRenderer({ content, onNoteClick }: { content: string; onNoteClick?: (name: string) => void }) {
  // Split content by wiki-links pattern [[note name]]
  const parts: ReactNode[] = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    // Add text before the match as ReactMarkdown
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index);
      parts.push(
        <ReactMarkdown 
          key={`md-${key}`} 
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <span>{children}</span>,
            ul: ({ children }) => <ul className="m-0 mb-2 pl-4 list-disc">{children}</ul>,
            ol: ({ children }) => <ol className="m-0 mb-2 pl-4 list-decimal">{children}</ol>,
            li: ({ children }) => <li className="m-0">{children}</li>,
            code: ({ className, children, ...props }) => {
              const isInline = !className;
              return isInline ? (
                <code className="px-1 py-0.5 rounded bg-surface1 text-lavender text-xs" {...props}>
                  {children}
                </code>
              ) : (
                <code className={`block p-2 rounded bg-surface1 text-xs overflow-x-auto ${className || ''}`} {...props}>
                  {children}
                </code>
              );
            },
            pre: ({ children }) => <pre className="m-0 mb-2">{children}</pre>,
            h1: ({ children }) => <h1 className="text-base font-bold m-0 mb-2">{children}</h1>,
            h2: ({ children }) => <h2 className="text-sm font-bold m-0 mb-2">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-semibold m-0 mb-1">{children}</h3>,
            strong: ({ children }) => <strong className="font-bold">{children}</strong>,
            em: ({ children }) => <em className="italic">{children}</em>,
            a: ({ href, children }) => (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-lavender hover:underline">
                {children}
              </a>
            ),
          }}
        >
          {textBefore}
        </ReactMarkdown>
      );
      key++;
    }
    
    // Add the wiki-link as a button
    const noteName = match[1];
    parts.push(
      <button
        key={`link-${key}`}
        type="button"
        onClick={() => {
          console.log('📄 Clicking wiki-link:', noteName);
          onNoteClick?.(noteName);
        }}
        className="text-green hover:text-teal cursor-pointer font-medium hover:underline bg-transparent border-none p-0 mx-0.5 inline"
        style={{ font: 'inherit' }}
      >
        📄 {noteName}
      </button>
    );
    key++;
    
    lastIndex = regex.lastIndex;
  }
  
  // Add remaining text as ReactMarkdown
  if (lastIndex < content.length) {
    const textAfter = content.slice(lastIndex);
    parts.push(
      <ReactMarkdown 
        key={`md-${key}`} 
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <span>{children}</span>,
          ul: ({ children }) => <ul className="m-0 mb-2 pl-4 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="m-0 mb-2 pl-4 list-decimal">{children}</ol>,
          li: ({ children }) => <li className="m-0">{children}</li>,
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            return isInline ? (
              <code className="px-1 py-0.5 rounded bg-surface1 text-lavender text-xs" {...props}>
                {children}
              </code>
            ) : (
              <code className={`block p-2 rounded bg-surface1 text-xs overflow-x-auto ${className || ''}`} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="m-0 mb-2">{children}</pre>,
          h1: ({ children }) => <h1 className="text-base font-bold m-0 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold m-0 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold m-0 mb-1">{children}</h3>,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-lavender hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {textAfter}
      </ReactMarkdown>
    );
  }
  
  // If no wiki-links, just render markdown normally
  if (parts.length === 0) {
    return (
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="m-0 mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="m-0 mb-2 pl-4 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="m-0 mb-2 pl-4 list-decimal">{children}</ol>,
          li: ({ children }) => <li className="m-0">{children}</li>,
          code: ({ className, children, ...props }) => {
            const isInline = !className;
            return isInline ? (
              <code className="px-1 py-0.5 rounded bg-surface1 text-lavender text-xs" {...props}>
                {children}
              </code>
            ) : (
              <code className={`block p-2 rounded bg-surface1 text-xs overflow-x-auto ${className || ''}`} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="m-0 mb-2">{children}</pre>,
          h1: ({ children }) => <h1 className="text-base font-bold m-0 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold m-0 mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold m-0 mb-1">{children}</h3>,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-lavender hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    );
  }
  
  return <div className="whitespace-pre-wrap">{parts}</div>;
}

export function Chat() {
  const { t } = useTranslation();
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
  const { notes, setCurrentNote, setCurrentNoteContent, rightPanelOpen } = useAppStore();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ id: number; name: string; folder: string | null }>>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);

  // Focus chat input when the right panel (chat) opens
  useEffect(() => {
    if (rightPanelOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  }, [rightPanelOpen]);

  // Handle clicking on a note link in chat messages
  const handleNoteClick = useCallback(async (noteName: string) => {
    console.log('🔍 Looking for note:', noteName);
    console.log('📚 Available notes:', notes.map(n => `${n.id}:${n.folder ?? 'root'}/${n.name}`));

    const normalized = noteName.trim();
    const hasFolder = normalized.includes('/');

    let note: typeof notes[number] | undefined;

    if (hasFolder) {
      // Try to match folder/name exactly
      note = notes.find(n => {
        const candidate = n.folder ? `${n.folder}/${n.name}` : n.name;
        return candidate === normalized;
      });
    }

    if (!note) {
      // Exact name match (no folder)
      note = notes.find(n => n.name === normalized);
    }

    if (!note) {
      // Partial fallback
      const lower = normalized.toLowerCase();
      note = notes.find(n => {
        const candidate = n.folder ? `${n.folder}/${n.name}` : n.name;
        return candidate.toLowerCase().includes(lower) || lower.includes(candidate.toLowerCase());
      });
    }

    if (note) {
      console.log('✅ Found note:', note.id, note.name, note.path);
      setCurrentNote(note);
      try {
        const fullNote = await window.electron.notes.readById(note.id);
        if (fullNote && fullNote.content) {
          console.log('📄 Loaded content length:', fullNote.content.length);
          setCurrentNoteContent(fullNote.content);
        }
      } catch (err) {
        console.error('❌ Error loading note content:', err);
      }
    } else {
      console.warn(`❌ Note "${noteName}" not found in:`, notes.map(n => n.name));
    }
  }, [notes, setCurrentNote, setCurrentNoteContent]);

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

    // Keep focus in the input after sending
    setTimeout(() => textareaRef.current?.focus(), 0);

    try {
      await window.electron.ai.sendMessage(currentSession?.id ?? null, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setIsStreaming(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [inputMessage, isStreaming, currentSession]);

  // When streaming ends, return focus to the input so the user can keep typing
  useEffect(() => {
    if (!isStreaming) {
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isStreaming]);

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
          .filter(n => n.name.toLowerCase().includes(query))
          .slice(0, 8)
          .map(n => ({ id: n.id, name: n.name, folder: n.folder ?? null }));
        
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
  const completeMention = useCallback((note: { id: number; name: string; folder: string | null }) => {
    if (mentionStart === -1) return;
    
    const cursorPos = textareaRef.current?.selectionStart || inputMessage.length;
    const before = inputMessage.slice(0, mentionStart);
    const after = inputMessage.slice(cursorPos);

    const mentionText = note.folder ? `${note.folder}/${note.name}` : note.name;
    const newValue = `${before}@${mentionText} ${after}`;
    setInputMessage(newValue);
    setShowSuggestions(false);
    setSuggestions([]);
    setMentionStart(-1);
    
    // Focus back and set cursor position
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = mentionStart + mentionText.length + 2; // @ + text + space
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
    <div className="flex flex-col h-full bg-base">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-mauve" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="font-medium text-text">
            {t('chat.title')}
          </span>
          {currentSession && (
            <span className="text-xs px-2 py-0.5 rounded bg-surface1 text-subtext0">
              {t('chat.session', { id: currentSession.id })}
            </span>
          )}
        </div>
        <button
          onClick={handleNewSession}
          className="px-3 py-1.5 rounded text-sm transition-colors bg-surface0 text-text hover:bg-surface1"
        >
          {t('chat.newChat')}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isStreaming && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-surface0">
              <svg className="w-8 h-8 text-mauve" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </div>
            <h3 className="text-lg font-medium mb-2 text-text">
              {t('chat.startConversation')}
            </h3>
            <p className="text-sm max-w-md mx-auto text-subtext0">
              {t('chat.startConversationDesc')}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onNoteClick={handleNoteClick} />
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
            onNoteClick={handleNoteClick}
          />
        )}

        {error && (
          <div className="p-3 rounded-lg text-sm bg-red/20 text-red">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-surface0 relative">
        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute bottom-full left-4 right-4 mb-2 rounded-lg overflow-hidden shadow-lg border bg-surface0 border-surface1 max-h-[200px] overflow-y-auto">
            {suggestions.map((s, index) => (
              <button
                key={`${s.id}-${s.folder ?? 'root'}-${s.name}`}
                onClick={() => completeMention(s)}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors text-text ${
                  index === selectedSuggestion ? 'bg-surface1' : 'bg-transparent'
                }`}
                onMouseEnter={() => setSelectedSuggestion(index)}
              >
                <span className="text-mauve">@</span>
                <span className="flex-1 text-left truncate">{s.name}</span>
                {s.folder && <span className="text-xs text-subtext0 truncate">{s.folder}</span>}
              </button>
            ))}
          </div>
        )}
        
        <div className="flex items-end gap-2 rounded-lg p-2 bg-surface0">
          <textarea
            ref={textareaRef}
            value={inputMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-sm text-text min-h-[24px] max-h-[120px]"
          />
          {isStreaming ? (
            <button
              onClick={handleCancel}
              className="p-2 rounded-lg transition-colors bg-red text-crust"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputMessage.trim()}
              className={`p-2 rounded-lg transition-colors disabled:opacity-50 text-crust ${
                inputMessage.trim() ? 'bg-mauve' : 'bg-surface1'
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-xs mt-2 text-overlay0">
          {t('chat.sendHint')}
        </p>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onNoteClick?: (noteName: string) => void;
}

function MessageBubble({ message, isStreaming, onNoteClick }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-2.5 ${isStreaming ? 'animate-pulse' : ''} ${
          isUser ? 'bg-mauve text-crust' : 'bg-surface0 text-text'
        }`}
      >
        {/* Tool calls indicator */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className={`mb-2 pb-2 border-b ${isUser ? 'border-crust' : 'border-surface1'}`}>
            <span className={`text-xs font-medium ${isUser ? 'text-crust' : 'text-subtext0'}`}>
              🔧 Used {message.toolCalls.length} tool{message.toolCalls.length > 1 ? 's' : ''}:
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {message.toolCalls.map((tc, index) => (
                <span 
                  key={tc.id || `tool-${index}`} 
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    isUser ? 'bg-crust/40 text-crust' : 'bg-surface1 text-subtext1'
                  }`}
                >
                  {tc.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Message content with Markdown */}
        <div className={`text-sm break-words prose prose-sm max-w-none ${
          isUser 
            ? 'prose-invert prose-p:text-crust prose-headings:text-crust prose-strong:text-crust prose-code:text-crust prose-li:text-crust' 
            : 'prose-p:text-text prose-headings:text-text prose-strong:text-text prose-code:text-lavender prose-code:bg-surface1 prose-code:px-1 prose-code:rounded prose-li:text-text prose-a:text-lavender'
        }`}>
          {isUser ? (
            <p className="m-0 whitespace-pre-wrap">{message.content}</p>
          ) : (
            <WikiLinkRenderer content={message.content} onNoteClick={onNoteClick} />
          )}
        </div>

        {/* Timestamp */}
        <div className={`text-xs mt-1.5 opacity-60 ${isUser ? 'text-crust' : 'text-subtext0'}`}>
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
