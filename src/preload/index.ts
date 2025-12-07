import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS, type IPCChannel } from '../shared/types/ipc';

// Type-safe IPC API
export interface ElectronAPI {
  // Generic invoke
  invoke: <T = unknown>(channel: IPCChannel, ...args: unknown[]) => Promise<T>;
  
  // Event listeners
  on: (channel: IPCChannel, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: IPCChannel, callback: (...args: unknown[]) => void) => void;
  
  // Notes
  notes: {
    list: (folder?: string) => Promise<NoteMetadata[]>;
    read: (name: string) => Promise<Note | null>;
    create: (name: string, content?: string, folder?: string) => Promise<NoteMetadata>;
    update: (name: string, content: string) => Promise<void>;
    updateById: (id: number, content: string) => Promise<NoteMetadata>;
    delete: (name: string) => Promise<void>;
    rename: (oldName: string, newName: string) => Promise<void>;
    move: (name: string, folder: string) => Promise<void>;
    search: (query: string) => Promise<NoteSearchResult[]>;
  };
  
  // Folders
  folders: {
    list: () => Promise<FolderMetadata[]>;
    create: (path: string) => Promise<FolderMetadata>;
    delete: (path: string) => Promise<void>;
    rename: (oldPath: string, newPath: string) => Promise<void>;
  };
  
  // Tags
  tags: {
    list: () => Promise<Tag[]>;
    create: (name: string, color?: string) => Promise<Tag>;
    delete: (name: string) => Promise<void>;
    addToNote: (noteName: string, tagName: string) => Promise<void>;
    removeFromNote: (noteName: string, tagName: string) => Promise<void>;
  };
  
  // AI Chat
  ai: {
    sendMessage: (sessionId: number | null, message: string, options?: { attachedNotes?: string[] }) => Promise<{ sessionId: number; message: ChatMessage }>;
    getSessions: () => Promise<ChatSession[]>;
    getMessages: (sessionId: number) => Promise<ChatMessage[]>;
    deleteSession: (sessionId: number) => Promise<void>;
    cancel: (sessionId: number) => Promise<void>;
    onStreamChunk: (callback: (data: { sessionId: number; chunk: string; fullContent: string }) => void) => () => void;
    onStreamEnd: (callback: (data: { sessionId: number; message: ChatMessage }) => void) => () => void;
    onStreamError: (callback: (data: { sessionId: number; error: string }) => void) => () => void;
    // Model management
    getModels: () => Promise<{ chat: ModelInfo[]; embedding: ModelInfo[] }>;
    getModel: () => Promise<string>;
    setModel: (model: string) => Promise<{ success: boolean }>;
    // API key management
    getApiKey: () => Promise<{ hasKey: boolean; maskedKey: string }>;
    setApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  };
  
  // Embeddings
  embeddings: {
    search: (query: string, limit?: number) => Promise<SemanticSearchResult[]>;
    indexNote: (notePath: string) => Promise<{ success: boolean; error?: string }>;
    reindexAll: () => Promise<{ success: boolean; indexed?: number; errors?: number; error?: string }>;
    getStats: () => Promise<{ totalNotes: number; totalChunks: number; lastUpdated: Date | null }>;
    delete: (notePath: string) => Promise<{ success: boolean; error?: string }>;
    getModel: () => Promise<string>;
    setModel: (model: string) => Promise<{ success: boolean }>;
  };
  
  // Reminders
  reminders: {
    list: () => Promise<Reminder[]>;
    create: (reminder: Omit<Reminder, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Reminder>;
    update: (id: number, reminder: Partial<Reminder>) => Promise<void>;
    delete: (id: number) => Promise<void>;
    snooze: (id: number, until: Date) => Promise<void>;
    complete: (id: number) => Promise<void>;
  };
  
  // App
  app: {
    getInfo: () => Promise<{ name: string; version: string }>;
    getSettings: () => Promise<Record<string, unknown>>;
    setSettings: (settings: Record<string, unknown>) => Promise<void>;
    getTheme: () => Promise<'light' | 'dark' | 'system'>;
    setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
  };
  
  // Window
  window: {
    openQuickNote: () => Promise<void>;
    closeQuickNote: () => Promise<void>;
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  
  // Files
  files: {
    getNotesDirectory: () => Promise<string>;
    setNotesDirectory: (path: string) => Promise<void>;
    onChanged: (callback: (type: string, path: string) => void) => () => void;
  };
  
  // Note content events
  notes_events: {
    onContentUpdated: (callback: (data: { id: number; name: string; content: string }) => void) => () => void;
    onRenamed: (callback: (data: { id: number; oldName: string; newName: string; newPath: string }) => void) => () => void;
  };
  
  // App lifecycle events
  app_events: {
    onBeforeQuit: (callback: () => void) => () => void;
  };
}

// Import types
import type { 
  NoteMetadata, 
  Note, 
  NoteSearchResult,
  FolderMetadata,
  Tag,
  ChatSession,
  ChatMessage,
  Reminder,
  SemanticSearchResult,
  ModelInfo,
} from '../shared/types';

// Create the API
const electronAPI: ElectronAPI = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  on: (channel, callback) => {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  
  once: (channel, callback) => {
    ipcRenderer.once(channel, (_event, ...args) => callback(...args));
  },
  
  // Notes API
  notes: {
    list: (folder) => ipcRenderer.invoke(IPC_CHANNELS['notes:list'], folder),
    read: (name) => ipcRenderer.invoke(IPC_CHANNELS['notes:read'], name),
    create: (name, content, folder) => ipcRenderer.invoke(IPC_CHANNELS['notes:create'], name, content, folder),
    update: (name, content) => ipcRenderer.invoke(IPC_CHANNELS['notes:update'], name, content),
    updateById: (id, content) => ipcRenderer.invoke(IPC_CHANNELS['notes:update-by-id'], id, content),
    delete: (name) => ipcRenderer.invoke(IPC_CHANNELS['notes:delete'], name),
    rename: (oldName, newName) => ipcRenderer.invoke(IPC_CHANNELS['notes:rename'], oldName, newName),
    move: (name, folder) => ipcRenderer.invoke(IPC_CHANNELS['notes:move'], name, folder),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS['notes:search'], query),
  },
  
  // Folders API
  folders: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS['folders:list']),
    create: (path) => ipcRenderer.invoke(IPC_CHANNELS['folders:create'], path),
    delete: (path) => ipcRenderer.invoke(IPC_CHANNELS['folders:delete'], path),
    rename: (oldPath, newPath) => ipcRenderer.invoke(IPC_CHANNELS['folders:rename'], oldPath, newPath),
  },
  
  // Tags API
  tags: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS['tags:list']),
    create: (name, color) => ipcRenderer.invoke(IPC_CHANNELS['tags:create'], name, color),
    delete: (name) => ipcRenderer.invoke(IPC_CHANNELS['tags:delete'], name),
    addToNote: (noteName, tagName) => ipcRenderer.invoke(IPC_CHANNELS['tags:add-to-note'], noteName, tagName),
    removeFromNote: (noteName, tagName) => ipcRenderer.invoke(IPC_CHANNELS['tags:remove-from-note'], noteName, tagName),
  },
  
  // AI Chat API
  ai: {
    sendMessage: (sessionId, message, options?: { attachedNotes?: string[] }) => 
      ipcRenderer.invoke(IPC_CHANNELS['ai:send-message'], sessionId, message, options),
    getSessions: () => ipcRenderer.invoke(IPC_CHANNELS['ai:get-sessions']),
    getMessages: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS['ai:get-messages'], sessionId),
    deleteSession: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS['ai:delete-session'], sessionId),
    cancel: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS['ai:cancel'], sessionId),
    onStreamChunk: (callback) => {
      const subscription = (_event: IpcRendererEvent, data: { sessionId: number; chunk: string; fullContent: string }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS['ai:stream-chunk'], subscription);
      return () => ipcRenderer.removeListener(IPC_CHANNELS['ai:stream-chunk'], subscription);
    },
    onStreamEnd: (callback) => {
      const subscription = (_event: IpcRendererEvent, data: { sessionId: number; message: ChatMessage }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS['ai:stream-end'], subscription);
      return () => ipcRenderer.removeListener(IPC_CHANNELS['ai:stream-end'], subscription);
    },
    onStreamError: (callback) => {
      const subscription = (_event: IpcRendererEvent, data: { sessionId: number; error: string }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS['ai:stream-error'], subscription);
      return () => ipcRenderer.removeListener(IPC_CHANNELS['ai:stream-error'], subscription);
    },
    // Model management
    getModels: () => ipcRenderer.invoke(IPC_CHANNELS['ai:get-models']),
    getModel: () => ipcRenderer.invoke(IPC_CHANNELS['ai:get-chat-model']),
    setModel: (model) => ipcRenderer.invoke(IPC_CHANNELS['ai:set-chat-model'], model),
    // API key management
    getApiKey: () => ipcRenderer.invoke(IPC_CHANNELS['ai:get-api-key']),
    setApiKey: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS['ai:set-api-key'], apiKey),
  },
  
  // Embeddings API
  embeddings: {
    search: (query, limit) => ipcRenderer.invoke(IPC_CHANNELS['embeddings:search'], query, limit),
    indexNote: (notePath) => ipcRenderer.invoke(IPC_CHANNELS['embeddings:index-note'], notePath),
    reindexAll: () => ipcRenderer.invoke(IPC_CHANNELS['embeddings:reindex-all']),
    getStats: () => ipcRenderer.invoke(IPC_CHANNELS['embeddings:get-stats']),
    delete: (notePath) => ipcRenderer.invoke(IPC_CHANNELS['embeddings:delete'], notePath),
    getModel: () => ipcRenderer.invoke(IPC_CHANNELS['embeddings:get-model']),
    setModel: (model) => ipcRenderer.invoke(IPC_CHANNELS['embeddings:set-model'], model),
  },
  
  // Reminders API
  reminders: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS['reminders:list']),
    create: (reminder) => ipcRenderer.invoke(IPC_CHANNELS['reminders:create'], reminder),
    update: (id, reminder) => ipcRenderer.invoke(IPC_CHANNELS['reminders:update'], id, reminder),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS['reminders:delete'], id),
    snooze: (id, until) => ipcRenderer.invoke(IPC_CHANNELS['reminders:snooze'], id, until),
    complete: (id) => ipcRenderer.invoke(IPC_CHANNELS['reminders:complete'], id),
  },
  
  // App API
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS['app:get-info']),
    getSettings: () => ipcRenderer.invoke(IPC_CHANNELS['app:get-settings']),
    setSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS['app:set-settings'], settings),
    getTheme: () => ipcRenderer.invoke(IPC_CHANNELS['app:get-theme']),
    setTheme: (theme) => ipcRenderer.invoke(IPC_CHANNELS['app:set-theme'], theme),
  },
  
  // Window API
  window: {
    openQuickNote: () => ipcRenderer.invoke(IPC_CHANNELS['window:quicknote-open']),
    closeQuickNote: () => ipcRenderer.invoke(IPC_CHANNELS['window:quicknote-close']),
    minimize: () => ipcRenderer.invoke(IPC_CHANNELS['window:minimize']),
    maximize: () => ipcRenderer.invoke(IPC_CHANNELS['window:maximize']),
    close: () => ipcRenderer.invoke(IPC_CHANNELS['window:close']),
  },
  
  // Files API
  files: {
    getNotesDirectory: () => ipcRenderer.invoke(IPC_CHANNELS['files:get-notes-directory']),
    setNotesDirectory: (path) => ipcRenderer.invoke(IPC_CHANNELS['files:set-notes-directory'], path),
    onChanged: (callback) => {
      const subscription = (_event: IpcRendererEvent, type: string, path: string) => callback(type, path);
      ipcRenderer.on(IPC_CHANNELS['files:changed'], subscription);
      return () => ipcRenderer.removeListener(IPC_CHANNELS['files:changed'], subscription);
    },
  },
  
  // Note content updates (from AI tools)
  notes_events: {
    onContentUpdated: (callback: (data: { id: number; name: string; content: string }) => void) => {
      const subscription = (_event: IpcRendererEvent, data: { id: number; name: string; content: string }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS['note:content-updated'], subscription);
      return () => ipcRenderer.removeListener(IPC_CHANNELS['note:content-updated'], subscription);
    },
    onRenamed: (callback: (data: { id: number; oldName: string; newName: string; newPath: string }) => void) => {
      const subscription = (_event: IpcRendererEvent, data: { id: number; oldName: string; newName: string; newPath: string }) => callback(data);
      ipcRenderer.on(IPC_CHANNELS['note:renamed'], subscription);
      return () => ipcRenderer.removeListener(IPC_CHANNELS['note:renamed'], subscription);
    },
  },
  
  // App lifecycle events
  app_events: {
    onBeforeQuit: (callback: () => void) => {
      const subscription = () => callback();
      ipcRenderer.on('app:before-quit', subscription);
      return () => ipcRenderer.removeListener('app:before-quit', subscription);
    },
  },
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electron', electronAPI);

// Add type declaration
declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
