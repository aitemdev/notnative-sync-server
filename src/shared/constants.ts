// Application constants

export const APP_NAME = 'NotNative';
export const APP_VERSION = '1.0.0';

// Default paths
export const DEFAULT_NOTES_FOLDER = 'NotNative Notes';

// Editor
export const EDITOR_AUTOSAVE_DELAY = 2000; // ms
export const EDITOR_FONT_SIZE_DEFAULT = 14;
export const EDITOR_FONT_SIZE_MIN = 10;
export const EDITOR_FONT_SIZE_MAX = 24;

// MCP Server
export const MCP_SERVER_PORT = 8788;
export const MCP_SERVER_HOST = '127.0.0.1';

// AI
export const AI_DEFAULT_MODEL = 'anthropic/claude-3.5-sonnet';
export const AI_DEFAULT_TEMPERATURE = 0.7;
export const AI_DEFAULT_MAX_TOKENS = 4096;
export const AI_EMBEDDING_MODEL = 'openai/text-embedding-3-small';

// Embeddings
export const EMBEDDING_CHUNK_SIZE = 500; // tokens
export const EMBEDDING_CHUNK_OVERLAP = 50; // tokens
export const EMBEDDING_DIMENSIONS = 1536;

// Search
export const SEARCH_RESULTS_LIMIT = 50;
export const SEMANTIC_SEARCH_LIMIT = 10;

// Database
export const DATABASE_VERSION = 10;
export const DATABASE_FILENAME = 'notnative.db';

// File watching
export const FILE_WATCH_DEBOUNCE = 500; // ms

// Supported file extensions
export const NOTE_EXTENSIONS = ['.md', '.markdown'];

// Property types
export const PROPERTY_TYPES = [
  'text',
  'number',
  'checkbox',
  'date',
  'datetime',
  'list',
  'tags',
  'links',
  'link',
] as const;

// Reminder priorities
export const REMINDER_PRIORITY_LABELS = {
  0: 'low',
  1: 'medium',
  2: 'high',
  3: 'urgent',
} as const;

// Repeat patterns
export const REPEAT_PATTERN_LABELS = {
  0: 'none',
  1: 'daily',
  2: 'weekly',
  3: 'monthly',
} as const;

// Editor modes
export const EDITOR_MODES = {
  NORMAL: 'normal',
  INSERT: 'insert',
  VISUAL: 'visual',
  COMMAND: 'command',
  SEARCH: 'search',
} as const;

// i18n
export const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
export const DEFAULT_LANGUAGE = 'es';
