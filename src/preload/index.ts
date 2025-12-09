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
    readById: (id: number) => Promise<Note | null>;
    create: (name: string, content?: string, folder?: string) => Promise<NoteMetadata>;
    update: (name: string, content: string) => Promise<void>;
    updateById: (id: number, content: string) => Promise<NoteMetadata>;
    delete: (name: string) => Promise<void>;
    rename: (oldName: string, newName: string) => Promise<void>;
    move: (name: string, folder: string) => Promise<void>;
    search: (query: string) => Promise<NoteSearchResult[]>;
    reindex: () => Promise<{ indexed: number; total: number }>;
    getHistory: (noteName: string) => Promise<Array<{ path: string; filename: string; timestamp: number; date: Date }>>;
    getHistoryContent: (historyPath: string) => Promise<string>;
    restoreFromHistory: (noteName: string, historyPath: string) => Promise<{ success: boolean }>;
  };

  // Links
  links: {
    getOutgoing: (noteId: number) => Promise<NoteLinkWithMetadata[]>;
    getIncoming: (noteId: number) => Promise<BacklinkInfo[]>;
    getAll: () => Promise<NoteLink[]>;
  };
  
  // Folders
  folders: {
    list: () => Promise<string[]>;
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
    getBraveApiKey: () => Promise<{ hasKey: boolean; maskedKey: string }>;
    setBraveApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
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
    getDocPath: (fileName: string) => Promise<string>;
  };

  dialog: {
    openDirectory: () => Promise<string | null>;
  };

  shell: {
    openPath: (path: string) => Promise<{ success: boolean; error?: string }>;
    showItemInFolder: (path: string) => Promise<void>;
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
    saveAs: (sourcePath: string) => Promise<{ success: boolean; error?: string; destination?: string; canceled?: boolean }>;
    getSize: (filePath: string, notePath?: string) => Promise<{ success: boolean; size?: number; error?: string; path?: string }>;
    onChanged: (callback: (type: string, path: string) => void) => () => void;
  };

  // Images
  images: {
    save: (noteId: number, fileName: string, data: Uint8Array | ArrayBuffer) => Promise<{ relativePath: string }>;
  };

  // Attachments
  attachments: {
    open: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    getByNote: (noteName: string) => Promise<{ success: boolean; attachments?: NoteAttachment[]; error?: string }>;
    search: (query: string, limit?: number) => Promise<{ success: boolean; attachments?: NoteAttachment[]; error?: string }>;
    getStats: () => Promise<{ success: boolean; totalAttachments?: number; totalSize?: number; orphanedCount?: number }>;
    cleanOrphans: () => Promise<{ success: boolean; cleaned?: number; error?: string }>;
  };
  
  // Sync
  sync: {
    login: (email: string, password: string, serverUrl: string) => Promise<{ success: boolean; error?: string }>;
    register: (email: string, password: string, serverUrl: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => Promise<{ success: boolean; error?: string }>;
    manual: () => Promise<{ success: boolean; conflicts?: SyncConflict[]; error?: string }>;
    status: () => Promise<{ success: boolean; status?: SyncStatus; error?: string }>;
    getConfig: () => Promise<{ success: boolean; config?: { serverUrl?: string; userEmail?: string }; error?: string }>;
    startPeriodicSync: () => Promise<{ success: boolean; error?: string }>;
    stopPeriodicSync: () => Promise<{ success: boolean; error?: string }>;
    onStatusChanged: (callback: (data: { isSyncing: boolean }) => void) => () => void;
    onCompleted: (callback: (data: { conflicts?: SyncConflict[]; timestamp: number }) => void) => () => void;
    onError: (callback: (data: { error: string }) => void) => () => void;
    onAuthSuccess: (callback: () => void) => () => void;
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

// Sync types
export interface SyncConflict {
  entity_type: string;
  entity_id: string;
  localTimestamp: number;
  remoteTimestamp: number;
  localData?: any;
  remoteData?: any;
}

export interface SyncStatus {
  isLoggedIn: boolean;
  isSyncing: boolean;
  lastSync?: number;
  pendingChanges: number;
  error?: string;
}

// Import types
import type { 
  NoteMetadata, 
  Note, 
  NoteSearchResult,
  NoteLink,
  NoteLinkWithMetadata,
  BacklinkInfo,
  FolderMetadata,
  Tag,
  ChatSession,
  ChatMessage,
  Reminder,
  SemanticSearchResult,
  ModelInfo,
  NoteAttachment,
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
    readById: (id) => ipcRenderer.invoke(IPC_CHANNELS['notes:read-by-id'], id),
    create: (name, content, folder) => ipcRenderer.invoke(IPC_CHANNELS['notes:create'], name, content, folder),
    update: (name, content) => ipcRenderer.invoke(IPC_CHANNELS['notes:update'], name, content),
    updateById: (id, content) => ipcRenderer.invoke(IPC_CHANNELS['notes:update-by-id'], id, content),
    delete: (name) => ipcRenderer.invoke(IPC_CHANNELS['notes:delete'], name),
    rename: (oldName, newName) => ipcRenderer.invoke(IPC_CHANNELS['notes:rename'], oldName, newName),
    move: (name, folder) => ipcRenderer.invoke(IPC_CHANNELS['notes:move'], name, folder),
    search: (query) => ipcRenderer.invoke(IPC_CHANNELS['notes:search'], query),
    reindex: () => ipcRenderer.invoke(IPC_CHANNELS['notes:reindex']),
    getHistory: (noteName) => ipcRenderer.invoke(IPC_CHANNELS['notes:get-history'], noteName),
    getHistoryContent: (historyPath) => ipcRenderer.invoke(IPC_CHANNELS['notes:get-history-content'], historyPath),
    restoreFromHistory: (noteName, historyPath) => ipcRenderer.invoke(IPC_CHANNELS['notes:restore-from-history'], noteName, historyPath),
  },

  // Links API
  links: {
    getOutgoing: (noteId) => ipcRenderer.invoke(IPC_CHANNELS['links:get-outgoing'], noteId),
    getIncoming: (noteId) => ipcRenderer.invoke(IPC_CHANNELS['links:get-incoming'], noteId),
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS['links:get-all']),
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
    getBraveApiKey: () => ipcRenderer.invoke(IPC_CHANNELS['ai:get-brave-api-key']),
    setBraveApiKey: (apiKey) => ipcRenderer.invoke(IPC_CHANNELS['ai:set-brave-api-key'], apiKey),
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
    getDocPath: (fileName: string) => ipcRenderer.invoke(IPC_CHANNELS['app:get-doc-path'], fileName) as Promise<string>,
  },
  
  // Dialogs
  dialog: {
    openDirectory: () => ipcRenderer.invoke(IPC_CHANNELS['dialog:open-directory']) as Promise<string | null>,
  },

  // Shell
  shell: {
    openPath: (path: string) => ipcRenderer.invoke(IPC_CHANNELS['shell:open-path'], path) as Promise<{ success: boolean; error?: string }>,
    showItemInFolder: (path: string) => ipcRenderer.invoke(IPC_CHANNELS['shell:show-item-in-folder'], path) as Promise<void>,
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
    saveAs: (sourcePath: string) => ipcRenderer.invoke(IPC_CHANNELS['files:save-as'], sourcePath) as Promise<{ success: boolean; error?: string; destination?: string; canceled?: boolean }>,
    getSize: (filePath: string, notePath?: string) => ipcRenderer.invoke(IPC_CHANNELS['files:get-size'], filePath, notePath) as Promise<{ success: boolean; size?: number; error?: string; path?: string }>,
    onChanged: (callback) => {
      const subscription = (_event: IpcRendererEvent, type: string, path: string) => callback(type, path);
      ipcRenderer.on(IPC_CHANNELS['files:changed'], subscription);
      return () => ipcRenderer.removeListener(IPC_CHANNELS['files:changed'], subscription);
    },
  },

  // Images API
  images: {
    save: (noteId, fileName, data) => ipcRenderer.invoke(IPC_CHANNELS['images:save'], noteId, fileName, data),
  },

  // Attachments API
  attachments: {
    open: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS['attachments:open'], filePath),
    getByNote: (noteName: string) => ipcRenderer.invoke(IPC_CHANNELS['attachments:get-by-note'], noteName),
    search: (query: string, limit?: number) => ipcRenderer.invoke(IPC_CHANNELS['attachments:search'], query, limit),
    getStats: () => ipcRenderer.invoke(IPC_CHANNELS['attachments:get-stats']),
    cleanOrphans: () => ipcRenderer.invoke(IPC_CHANNELS['attachments:clean-orphans']),
  },
  
  // Sync API
  sync: {
    login: (email, password, serverUrl) => ipcRenderer.invoke('sync:login', email, password, serverUrl),
    register: (email, password, serverUrl) => ipcRenderer.invoke('sync:register', email, password, serverUrl),
    logout: () => ipcRenderer.invoke('sync:logout'),
    manual: () => ipcRenderer.invoke('sync:manual'),
    status: () => ipcRenderer.invoke('sync:status'),
    getConfig: () => ipcRenderer.invoke('sync:get-config'),
    startPeriodicSync: () => ipcRenderer.invoke('sync:start-periodic'),
    stopPeriodicSync: () => ipcRenderer.invoke('sync:stop-periodic'),
    onStatusChanged: (callback) => {
      const subscription = (_event: IpcRendererEvent, data: { isSyncing: boolean }) => callback(data);
      ipcRenderer.on('sync:status-changed', subscription);
      return () => ipcRenderer.removeListener('sync:status-changed', subscription);
    },
    onCompleted: (callback) => {
      const subscription = (_event: IpcRendererEvent, data: { conflicts?: SyncConflict[]; timestamp: number }) => callback(data);
      ipcRenderer.on('sync:completed', subscription);
      return () => ipcRenderer.removeListener('sync:completed', subscription);
    },
    onError: (callback) => {
      const subscription = (_event: IpcRendererEvent, data: { error: string }) => callback(data);
      ipcRenderer.on('sync:error', subscription);
      return () => ipcRenderer.removeListener('sync:error', subscription);
    },
    onAuthSuccess: (callback) => {
      const subscription = () => callback();
      ipcRenderer.on('sync:auth-success', subscription);
      return () => ipcRenderer.removeListener('sync:auth-success', subscription);
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
