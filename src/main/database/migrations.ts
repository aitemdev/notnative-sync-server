import Database from 'better-sqlite3';
import { DATABASE_VERSION } from '../../shared/constants';

// Array of migrations - each index corresponds to a version
const MIGRATIONS: string[] = [
  // v1: Base schema
  `
    -- Notes table
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      path TEXT NOT NULL UNIQUE,
      folder TEXT,
      order_index INTEGER DEFAULT 0,
      icon TEXT,
      icon_color TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_order ON notes(order_index);
    
    -- Tags table
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      usage_count INTEGER DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_tags_usage ON tags(usage_count DESC);
    
    -- Note-Tags relationship
    CREATE TABLE IF NOT EXISTS note_tags (
      note_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (note_id, tag_id),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
    CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
    
    -- Full-text search (unicode61 tokenizer for better prefix matching)
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      name,
      content,
      tokenize = 'unicode61'
    );
    
    -- Folders table
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      icon_color TEXT,
      order_index INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);
    CREATE INDEX IF NOT EXISTS idx_folders_order ON folders(order_index);
  `,

  // v2: Embeddings table
  `
    CREATE TABLE IF NOT EXISTS note_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding BLOB NOT NULL,
      token_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(note_path, chunk_index)
    );
    
    CREATE INDEX IF NOT EXISTS idx_embeddings_note ON note_embeddings(note_path);
    CREATE INDEX IF NOT EXISTS idx_embeddings_updated ON note_embeddings(updated_at DESC);
  `,

  // v3: Query cache (for base queries)
  `
    CREATE TABLE IF NOT EXISTS query_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_hash TEXT NOT NULL UNIQUE,
      query_text TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_query_cache_hash ON query_cache(query_hash);
    CREATE INDEX IF NOT EXISTS idx_query_cache_expires ON query_cache(expires_at);
  `,

  // v4: Reminders table
  `
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      due_date INTEGER NOT NULL,
      priority INTEGER DEFAULT 1,
      status INTEGER DEFAULT 0,
      snooze_until INTEGER,
      repeat_pattern INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_reminders_due_date ON reminders(due_date);
    CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
    CREATE INDEX IF NOT EXISTS idx_reminders_note_id ON reminders(note_id);
  `,

  // v5: Chat sessions and messages
  `
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2000
    );
    
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      tool_calls TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
  `,

  // v6: Bases table
  `
    CREATE TABLE IF NOT EXISTS bases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      source_folder TEXT,
      config_yaml TEXT NOT NULL,
      active_view INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_bases_name ON bases(name);
    CREATE INDEX IF NOT EXISTS idx_bases_folder ON bases(source_folder);
  `,

  // v7: Inline properties table
  `
    CREATE TABLE IF NOT EXISTS inline_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      property_key TEXT NOT NULL,
      property_type TEXT NOT NULL,
      value_text TEXT,
      value_number REAL,
      value_bool INTEGER,
      line_number INTEGER NOT NULL,
      char_start INTEGER NOT NULL,
      char_end INTEGER NOT NULL,
      linked_note_id INTEGER,
      group_id INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_note_id) REFERENCES notes(id) ON DELETE SET NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_inline_props_note ON inline_properties(note_id);
    CREATE INDEX IF NOT EXISTS idx_inline_props_key ON inline_properties(property_key);
    CREATE INDEX IF NOT EXISTS idx_inline_props_type ON inline_properties(property_type);
    CREATE INDEX IF NOT EXISTS idx_inline_props_value_text ON inline_properties(value_text);
    CREATE INDEX IF NOT EXISTS idx_inline_props_value_number ON inline_properties(value_number);
    CREATE INDEX IF NOT EXISTS idx_inline_props_linked ON inline_properties(linked_note_id);
    CREATE INDEX IF NOT EXISTS idx_inline_props_group ON inline_properties(note_id, group_id);
  `,

  // v8: Settings table
  `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `,

  // v9: Links table (for graph view)
  `
    CREATE TABLE IF NOT EXISTS note_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_note_id INTEGER NOT NULL,
      target_note_id INTEGER NOT NULL,
      link_type TEXT DEFAULT 'wikilink',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (target_note_id) REFERENCES notes(id) ON DELETE CASCADE,
      UNIQUE(source_note_id, target_note_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_note_id);
    CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_note_id);
  `,

  // v10: Add title column to chat_sessions
  `
    ALTER TABLE chat_sessions ADD COLUMN title TEXT;
  `,
];

export function runMigrations(db: Database.Database): void {
  // Get current version
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  
  console.log(`📦 Current database version: ${currentVersion}`);
  console.log(`📦 Target database version: ${DATABASE_VERSION}`);
  
  if (currentVersion >= DATABASE_VERSION) {
    console.log('✅ Database is up to date');
    return;
  }
  
  // Run pending migrations
  for (let i = currentVersion; i < MIGRATIONS.length && i < DATABASE_VERSION; i++) {
    console.log(`📦 Running migration v${i + 1}...`);
    
    try {
      db.exec(MIGRATIONS[i]);
      db.pragma(`user_version = ${i + 1}`);
      console.log(`✅ Migration v${i + 1} completed`);
    } catch (error) {
      // Some migrations may fail if tables already exist (e.g., ALTER TABLE)
      // Check if it's a "duplicate column" error and continue
      const errorMessage = (error as Error).message;
      
      if (errorMessage.includes('duplicate column name') || 
          errorMessage.includes('already exists')) {
        console.log(`⚠️ Migration v${i + 1} skipped (already applied)`);
        db.pragma(`user_version = ${i + 1}`);
      } else {
        console.error(`❌ Migration v${i + 1} failed:`, error);
        throw error;
      }
    }
  }
  
  console.log('✅ All migrations completed');
}

export function resetDatabase(db: Database.Database): void {
  console.log('⚠️ Resetting database...');
  
  // Drop all tables
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all() as { name: string }[];
  
  for (const { name } of tables) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
  
  // Reset version
  db.pragma('user_version = 0');
  
  // Run all migrations
  runMigrations(db);
}
