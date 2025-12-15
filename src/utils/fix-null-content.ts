import pool from './db';

/**
 * Fix notes with NULL content
 * This migration ensures all notes have a valid content field (empty string instead of NULL)
 */

async function fixNullContent() {
  try {
    console.log('🔄 Fixing notes with NULL content...');
    
    // First, check how many notes have NULL content
    const countResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM notes 
      WHERE content IS NULL
    `);
    
    const nullCount = parseInt(countResult.rows[0].count, 10);
    console.log(`📊 Found ${nullCount} notes with NULL content`);
    
    if (nullCount === 0) {
      console.log('✅ No notes to fix');
      process.exit(0);
    }
    
    // List the notes that will be fixed
    const listResult = await pool.query(`
      SELECT id, uuid, name, folder, deleted_at
      FROM notes 
      WHERE content IS NULL
      ORDER BY updated_at DESC
      LIMIT 20
    `);
    
    console.log('\n📝 Notes to be fixed:');
    for (const note of listResult.rows) {
      console.log(`  - ${note.name} (${note.uuid}) - Deleted: ${note.deleted_at ? 'Yes' : 'No'}`);
    }
    
    // Update all notes with NULL content to empty string
    const updateResult = await pool.query(`
      UPDATE notes 
      SET content = '' 
      WHERE content IS NULL
      RETURNING id
    `);
    
    console.log(`\n✅ Updated ${updateResult.rowCount} notes successfully`);
    
    // Verify the fix
    const verifyResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM notes 
      WHERE content IS NULL
    `);
    
    const remainingNull = parseInt(verifyResult.rows[0].count, 10);
    
    if (remainingNull === 0) {
      console.log('✅ All notes fixed successfully!');
    } else {
      console.error(`⚠️ Warning: ${remainingNull} notes still have NULL content`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

fixNullContent();
