import pool from './db';

/**
 * Add is_locked and password_hash columns to folders table
 * Run: npx tsx src/utils/add-folder-lock.ts
 */

async function addFolderLockColumns() {
  try {
    console.log('🔄 Adding lock columns to folders table...');
    
    // Check if is_locked exists
    const checkLocked = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='folders' AND column_name='is_locked'
    `);
    
    if (checkLocked.rows.length === 0) {
      await pool.query('ALTER TABLE folders ADD COLUMN is_locked BOOLEAN DEFAULT FALSE');
      console.log('✅ Added is_locked to folders');
    } else {
      console.log('⚠️ is_locked already exists in folders');
    }
    
    // Check if password_hash exists
    const checkHash = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='folders' AND column_name='password_hash'
    `);
    
    if (checkHash.rows.length === 0) {
      await pool.query('ALTER TABLE folders ADD COLUMN password_hash VARCHAR(255)');
      console.log('✅ Added password_hash to folders');
    } else {
      console.log('⚠️ password_hash already exists in folders');
    }
    
    console.log('🎉 Migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

addFolderLockColumns();
