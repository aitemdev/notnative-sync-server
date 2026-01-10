import pool from './db';

/**
 * Add is_favorite column to notes and folders tables
 * Run: npx ts-node src/utils/add-favorites.ts
 */

async function addFavorites() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Adding is_favorite columns...');
    
    await client.query('BEGIN');
    
    // Add is_favorite to notes table
    await client.query(`
      ALTER TABLE notes 
      ADD COLUMN IF NOT EXISTS is_favorite INTEGER DEFAULT 0
    `);
    console.log('✅ Added is_favorite to notes table');
    
    // Add is_favorite to folders table
    await client.query(`
      ALTER TABLE folders 
      ADD COLUMN IF NOT EXISTS is_favorite INTEGER DEFAULT 0
    `);
    console.log('✅ Added is_favorite to folders table');
    
    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_notes_favorite 
      ON notes(user_id, is_favorite) 
      WHERE is_favorite = 1
    `);
    console.log('✅ Created index on notes.is_favorite');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_folders_favorite 
      ON folders(user_id, is_favorite) 
      WHERE is_favorite = 1
    `);
    console.log('✅ Created index on folders.is_favorite');
    
    await client.query('COMMIT');
    
    console.log('🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

addFavorites();
