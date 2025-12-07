import { create } from 'zustand';
import type { ChatSession, ChatMessage, ToolCall } from '../../shared/types';

interface ChatState {
  // Sessions
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  
  // Messages
  messages: ChatMessage[];
  
  // Input
  inputMessage: string;
  attachedNotes: string[];
  
  // Streaming
  isStreaming: boolean;
  streamingContent: string;
  
  // Actions
  setSessions: (sessions: ChatSession[]) => void;
  setCurrentSession: (session: ChatSession | null) => void;
  addSession: (session: ChatSession) => void;
  removeSession: (sessionId: number) => void;
  
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (content: string) => void;
  
  setInputMessage: (message: string) => void;
  addAttachedNote: (noteName: string) => void;
  removeAttachedNote: (noteName: string) => void;
  clearAttachedNotes: () => void;
  
  setIsStreaming: (streaming: boolean) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (chunk: string) => void;
  clearStreamingContent: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  sessions: [],
  currentSession: null,
  messages: [],
  inputMessage: '',
  attachedNotes: [],
  isStreaming: false,
  streamingContent: '',
  
  // Actions
  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (session) => set({ currentSession: session, messages: [] }),
  addSession: (session) => set((state) => ({ 
    sessions: [session, ...state.sessions],
    currentSession: session,
  })),
  removeSession: (sessionId) => set((state) => ({
    sessions: state.sessions.filter(s => s.id !== sessionId),
    currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
    messages: state.currentSession?.id === sessionId ? [] : state.messages,
  })),
  
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateLastMessage: (content) => set((state) => {
    const messages = [...state.messages];
    if (messages.length > 0) {
      messages[messages.length - 1] = {
        ...messages[messages.length - 1],
        content,
      };
    }
    return { messages };
  }),
  
  setInputMessage: (message) => set({ inputMessage: message }),
  addAttachedNote: (noteName) => set((state) => ({
    attachedNotes: state.attachedNotes.includes(noteName)
      ? state.attachedNotes
      : [...state.attachedNotes, noteName],
  })),
  removeAttachedNote: (noteName) => set((state) => ({
    attachedNotes: state.attachedNotes.filter(n => n !== noteName),
  })),
  clearAttachedNotes: () => set({ attachedNotes: [] }),
  
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setStreamingContent: (content) => set({ streamingContent: content }),
  appendStreamingContent: (chunk) => set((state) => ({
    streamingContent: state.streamingContent + chunk,
  })),
  clearStreamingContent: () => set({ streamingContent: '' }),
}));
