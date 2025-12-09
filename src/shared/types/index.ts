// Tipos compartidos entre Main y Renderer

// ============== NOTES ==============
export interface NoteMetadata {
  id: number;
  uuid?: string;  // UUID for cross-device sync (v13+)
  name: string;
  path: string;
  folder: string | null;
  orderIndex: number;
  icon: string | null;
  iconColor: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Note extends NoteMetadata {
  content: string;
  tags: string[];
}

export interface NoteSearchResult {
  noteId: number;
  noteName: string;
  notePath: string;
  snippet: string;
  relevance: number;
}

// ============== LINKS ==============
export interface NoteLink {
  id: number;
  sourceNoteId: number;
  targetNoteId: number;
  linkType: string;
  createdAt: Date;
}

export interface NoteLinkWithMetadata extends NoteLink {
  targetName: string;
  targetFolder: string | null;
  targetPath: string;
}

export interface BacklinkInfo {
  noteId: number;
  noteName: string;
  noteFolder: string | null;
  notePath: string;
  context: string;
  lineNumber: number;
}

// ============== FRONTMATTER ==============
export interface Frontmatter {
  tags: string[];
  title?: string;
  date?: string;
  author?: string;
  [key: string]: unknown;
}

export interface ParsedNote {
  frontmatter: Frontmatter;
  content: string;
}

// ============== TAGS ==============
export interface Tag {
  id: number;
  name: string;
  color: string | null;
  usageCount: number;
}

// ============== FOLDERS ==============
export interface FolderMetadata {
  id: number;
  path: string;
  icon: string | null;
  color: string | null;
  iconColor: string | null;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============== PROPERTIES ==============
export type PropertyType =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'datetime'
  | 'list'
  | 'tags'
  | 'links'
  | 'link';

export interface InlineProperty {
  id: number;
  noteId: number;
  key: string;
  propertyType: PropertyType;
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  lineNumber: number;
  charStart: number;
  charEnd: number;
  linkedNoteId: number | null;
  groupId: number | null;
}

export interface PropertyGroup {
  groupId: number;
  properties: InlineProperty[];
}

// ============== BASES ==============
export interface BaseDefinition {
  id: number;
  name: string;
  description: string | null;
  sourceFolder: string | null;
  configYaml: string;
  activeView: number;
  createdAt: Date;
  updatedAt: Date;
}

export type BaseViewType = 'table' | 'board' | 'graph' | 'calendar';

export interface BaseView {
  id: string;
  name: string;
  type: BaseViewType;
  config: Record<string, unknown>;
}

export interface BaseColumn {
  key: string;
  label: string;
  type: PropertyType;
  width?: number;
  visible: boolean;
  sortable: boolean;
}

// ============== AI CHAT ==============
export interface ChatSession {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  model: string;
  provider: string;
  temperature: number;
  maxTokens: number;
}

export interface ChatMessage {
  id: number;
  sessionId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
}

// ============== THEME ==============
export * from './theme';

// ============== REMINDERS ==============
export type ReminderPriority = 0 | 1 | 2 | 3; // low, medium, high, urgent
export type ReminderStatus = 0 | 1 | 2; // pending, completed, snoozed
export type RepeatPattern = 0 | 1 | 2 | 3; // none, daily, weekly, monthly

export interface Reminder {
  id: number;
  noteId: number | null;
  title: string;
  description: string | null;
  dueDate: Date;
  priority: ReminderPriority;
  status: ReminderStatus;
  snoozeUntil: Date | null;
  repeatPattern: RepeatPattern;
  createdAt: Date;
  updatedAt: Date;
}

// ============== EMBEDDINGS ==============
export interface NoteEmbedding {
  id: number;
  notePath: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  tokenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SemanticSearchResult {
  notePath: string;
  chunkText: string;
  similarity: number;
}

// ============== AI MODELS ==============
export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  pricing: string;
  isChat: boolean;
  isEmbedding: boolean;
}

// ============== ATTACHMENTS ==============
export interface NoteAttachment {
  id: number;
  notePath: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string | null;
  createdAt: Date;
}
