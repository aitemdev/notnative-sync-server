// IPC Channel definitions

export const IPC_CHANNELS = {
  // ============== NOTES ==============
  'notes:list': 'notes:list',
  'notes:read': 'notes:read',
  'notes:read-by-id': 'notes:read-by-id',
  'notes:create': 'notes:create',
  'notes:update': 'notes:update',
  'notes:update-by-id': 'notes:update-by-id',
  'notes:delete': 'notes:delete',
  'notes:rename': 'notes:rename',
  'notes:move': 'notes:move',
  'notes:search': 'notes:search',
  'notes:reindex': 'notes:reindex',
  'notes:get-metadata': 'notes:get-metadata',

  // ============== FOLDERS ==============
  'folders:list': 'folders:list',
  'folders:create': 'folders:create',
  'folders:delete': 'folders:delete',
  'folders:rename': 'folders:rename',

  // ============== TAGS ==============
  'tags:list': 'tags:list',
  'tags:create': 'tags:create',
  'tags:delete': 'tags:delete',
  'tags:rename': 'tags:rename',
  'tags:add-to-note': 'tags:add-to-note',
  'tags:remove-from-note': 'tags:remove-from-note',

  // ============== BASES ==============
  'bases:list': 'bases:list',
  'bases:create': 'bases:create',
  'bases:update': 'bases:update',
  'bases:delete': 'bases:delete',
  'bases:query': 'bases:query',
  'bases:update-cell': 'bases:update-cell',

  // ============== AI CHAT ==============
  'ai:send-message': 'ai:send-message',
  'ai:stream-chunk': 'ai:stream-chunk',
  'ai:stream-end': 'ai:stream-end',
  'ai:stream-error': 'ai:stream-error',
  'ai:execute-tool': 'ai:execute-tool',
  'ai:cancel': 'ai:cancel',
  'ai:get-sessions': 'ai:get-sessions',
  'ai:get-messages': 'ai:get-messages',
  'ai:delete-session': 'ai:delete-session',
  'ai:get-models': 'ai:get-models',
  'ai:get-chat-model': 'ai:get-chat-model',
  'ai:set-chat-model': 'ai:set-chat-model',
  'ai:get-api-key': 'ai:get-api-key',
  'ai:set-api-key': 'ai:set-api-key',
  'ai:get-brave-api-key': 'ai:get-brave-api-key',
  'ai:set-brave-api-key': 'ai:set-brave-api-key',

  // ============== EMBEDDINGS ==============
  'embeddings:search': 'embeddings:search',
  'embeddings:index-note': 'embeddings:index-note',
  'embeddings:reindex-all': 'embeddings:reindex-all',
  'embeddings:get-stats': 'embeddings:get-stats',
  'embeddings:delete': 'embeddings:delete',
  'embeddings:get-model': 'embeddings:get-model',
  'embeddings:set-model': 'embeddings:set-model',

  // ============== REMINDERS ==============
  'reminders:list': 'reminders:list',
  'reminders:create': 'reminders:create',
  'reminders:update': 'reminders:update',
  'reminders:delete': 'reminders:delete',
  'reminders:snooze': 'reminders:snooze',
  'reminders:complete': 'reminders:complete',
  'reminders:due-soon': 'reminders:due-soon',

  // ============== FILES ==============
  'files:watch-start': 'files:watch-start',
  'files:watch-stop': 'files:watch-stop',
  'files:changed': 'files:changed',
  'files:get-notes-directory': 'files:get-notes-directory',
  'files:set-notes-directory': 'files:set-notes-directory',
  
  // ============== NOTE CONTENT ==============
  'note:content-updated': 'note:content-updated',
  'note:renamed': 'note:renamed',

  // ============== APP LIFECYCLE ==============
  'app:before-quit': 'app:before-quit',
  'app:save-complete': 'app:save-complete',

  // ============== APP / SYSTEM ==============
  'app:get-info': 'app:get-info',
  'app:get-settings': 'app:get-settings',
  'app:set-settings': 'app:set-settings',
  'app:get-theme': 'app:get-theme',
  'app:set-theme': 'app:set-theme',

  // ============== WINDOWS ==============
  'window:quicknote-open': 'window:quicknote-open',
  'window:quicknote-close': 'window:quicknote-close',
  'window:minimize': 'window:minimize',
  'window:maximize': 'window:maximize',
  'window:close': 'window:close',

  // ============== TRAY ==============
  'tray:action': 'tray:action',
  'tray:show': 'tray:show',
  'tray:hide': 'tray:hide',

  // ============== MEDIA ==============
  'media:youtube-info': 'media:youtube-info',
  'media:youtube-play': 'media:youtube-play',
  'media:youtube-stop': 'media:youtube-stop',

  // ============== IMAGES (EDITOR) ==============
  'images:save': 'images:save',

  // ============== MCP SERVER ==============
  'mcp:start': 'mcp:start',
  'mcp:stop': 'mcp:stop',
  'mcp:status': 'mcp:status',
} as const;

export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
