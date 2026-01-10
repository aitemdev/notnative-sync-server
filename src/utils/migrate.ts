import pool from './db';

/**
 * Database schema for NotNative Sync Server
 * Run: npm run migrate
 */

const SCHEMA = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  storage_used BIGINT DEFAULT 0,
  storage_limit BIGINT DEFAULT 524288000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Devices table (track user devices)
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  device_name VARCHAR(255),
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token VARCHAR(500) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

-- Notes table (server-side storage)
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uuid VARCHAR(36) NOT NULL,
  name VARCHAR(500) NOT NULL,
  path TEXT NOT NULL,
  folder VARCHAR(500),
  content TEXT,
  order_index INTEGER DEFAULT 0,
  icon VARCHAR(50),
  icon_color VARCHAR(50),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  is_favorite INTEGER DEFAULT 0,
  UNIQUE(user_id, uuid),
  UNIQUE(user_id, path)
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_uuid ON notes(uuid);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(user_id, folder);
CREATE INDEX IF NOT EXISTS idx_notes_favorite ON notes(user_id, is_favorite) WHERE is_favorite = 1;

-- Tags table (DEPRECATED - Tags are now extracted locally from note content)
-- CREATE TABLE IF NOT EXISTS tags (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   name VARCHAR(255) NOT NULL,
--   color VARCHAR(50),
--   usage_count INTEGER DEFAULT 0,
--   UNIQUE(user_id, name)
-- );
-- 
-- CREATE INDEX IF NOT EXISTS idx_tags_user ON tags(user_id);
-- 
-- -- Note-Tags relationship
-- CREATE TABLE IF NOT EXISTS note_tags (
--   note_uuid VARCHAR(36) NOT NULL,
--   tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
--   PRIMARY KEY (note_uuid, tag_id)
-- );
-- 
-- CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_uuid);
-- CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  path VARCHAR(500) NOT NULL,
  icon VARCHAR(50),
  color VARCHAR(50),
  icon_color VARCHAR(50),
  order_index INTEGER DEFAULT 0,
  is_locked BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT,
  is_favorite INTEGER DEFAULT 0,
  UNIQUE(user_id, path)
);

CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_favorite ON folders(user_id, is_favorite) WHERE is_favorite = 1;

-- Attachments table (metadata only, files in S3)
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_uuid VARCHAR(36) NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_hash VARCHAR(64) UNIQUE NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  s3_key VARCHAR(500) UNIQUE NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id);
CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments(note_uuid);
CREATE INDEX IF NOT EXISTS idx_attachments_hash ON attachments(file_hash);

-- Sync log (for tracking changes)
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  operation VARCHAR(20) NOT NULL,
  data_json JSONB,
  timestamp BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_user ON sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp ON sync_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_device ON sync_log(device_id);
`;

async function migrate() {
  try {
    console.log('🔄 Running database migrations...');
    
    await pool.query(SCHEMA);
    
    // Migración adicional: Añadir content_hash a notas existentes si no existe
    console.log('🔄 Checking for content_hash column...');
    const checkColumn = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'notes' 
      AND column_name = 'content_hash'
    `);
    
    if (checkColumn.rows.length === 0) {
      console.log('📝 Adding content_hash column to notes table...');
      await pool.query(`ALTER TABLE notes ADD COLUMN content_hash VARCHAR(64)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_notes_content_hash ON notes(content_hash)`);
      console.log('✅ content_hash column added successfully');
    } else {
      console.log('✅ content_hash column already exists');
    }
    
    // Migración adicional: Añadir updated_at y deleted_at a attachments si no existen
    console.log('🔄 Checking for updated_at column in attachments...');
    const checkUpdatedAt = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'attachments' 
      AND column_name = 'updated_at'
    `);
    
    if (checkUpdatedAt.rows.length === 0) {
      console.log('📝 Adding updated_at column to attachments table...');
      await pool.query(`ALTER TABLE attachments ADD COLUMN updated_at BIGINT`);
      // Inicializar con created_at para registros existentes
      await pool.query(`UPDATE attachments SET updated_at = created_at WHERE updated_at IS NULL`);
      // Hacer NOT NULL después de poblar
      await pool.query(`ALTER TABLE attachments ALTER COLUMN updated_at SET NOT NULL`);
      console.log('✅ updated_at column added successfully');
    } else {
      console.log('✅ updated_at column already exists');
    }
    
    console.log('🔄 Checking for deleted_at column in attachments...');
    const checkDeletedAt = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'attachments' 
      AND column_name = 'deleted_at'
    `);
    
    if (checkDeletedAt.rows.length === 0) {
      console.log('📝 Adding deleted_at column to attachments table...');
      await pool.query(`ALTER TABLE attachments ADD COLUMN deleted_at BIGINT`);
      console.log('✅ deleted_at column added successfully');
    } else {
      console.log('✅ deleted_at column already exists');
    }

    // Migración adicional: Añadir is_locked y password_hash a folders si no existen
    console.log('🔄 Checking for is_locked column in folders...');
    const checkLocked = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='folders' AND column_name='is_locked'
    `);
    
    if (checkLocked.rows.length === 0) {
      console.log('📝 Adding is_locked column to folders table...');
      await pool.query('ALTER TABLE folders ADD COLUMN is_locked BOOLEAN DEFAULT FALSE');
      console.log('✅ is_locked column added successfully');
    } else {
      console.log('✅ is_locked column already exists');
    }
    
    console.log('🔄 Checking for password_hash column in folders...');
    const checkHash = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='folders' AND column_name='password_hash'
    `);
    
    if (checkHash.rows.length === 0) {
      console.log('📝 Adding password_hash column to folders table...');
      await pool.query('ALTER TABLE folders ADD COLUMN password_hash VARCHAR(255)');
      console.log('✅ password_hash column added successfully');
    } else {
      console.log('✅ password_hash column already exists');
    }

    // Migración adicional: Añadir is_favorite a notes y folders si no existen
    console.log('🔄 Checking for is_favorite column in notes...');
    const checkNotesFavorite = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='notes' AND column_name='is_favorite'
    `);
    
    if (checkNotesFavorite.rows.length === 0) {
      console.log('📝 Adding is_favorite column to notes table...');
      await pool.query('ALTER TABLE notes ADD COLUMN is_favorite INTEGER DEFAULT 0');
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_notes_favorite ON notes(user_id, is_favorite) WHERE is_favorite = 1`);
      console.log('✅ is_favorite column added successfully to notes');
    } else {
      console.log('✅ is_favorite column already exists in notes');
    }
    
    console.log('🔄 Checking for is_favorite column in folders...');
    const checkFoldersFavorite = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='folders' AND column_name='is_favorite'
    `);
    
    if (checkFoldersFavorite.rows.length === 0) {
      console.log('📝 Adding is_favorite column to folders table...');
      await pool.query('ALTER TABLE folders ADD COLUMN is_favorite INTEGER DEFAULT 0');
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_folders_favorite ON folders(user_id, is_favorite) WHERE is_favorite = 1`);
      console.log('✅ is_favorite column added successfully to folders');
    } else {
      console.log('✅ is_favorite column already exists in folders');
    }
    
    console.log('✅ Database migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
