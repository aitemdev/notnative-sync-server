import pool from './db';

/**
 * Add deleted_at column to existing tables
 * Run: npx tsx src/utils/add-deleted-at.ts
 */

async function addDeletedAtColumn() {
  try {
    console.log('🔄 Adding deleted_at column to notes table...');
    
    // Check if column exists
    const checkNotes = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='notes' AND column_name='deleted_at'
    `);
    
    if (checkNotes.rows.length === 0) {
      await pool.query('ALTER TABLE notes ADD COLUMN deleted_at BIGINT');
      console.log('✅ Added deleted_at to notes');
    } else {
      console.log('⚠️ deleted_at already exists in notes');
    }
    
    console.log('🔄 Adding deleted_at column to folders table...');
    
    const checkFolders = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='folders' AND column_name='deleted_at'
    `);
    
    if (checkFolders.rows.length === 0) {
      await pool.query('ALTER TABLE folders ADD COLUMN deleted_at BIGINT');
      console.log('✅ Added deleted_at to folders');
    } else {
      console.log('⚠️ deleted_at already exists in folders');
    }
    
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addDeletedAtColumn();
