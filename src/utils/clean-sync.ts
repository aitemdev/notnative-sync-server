import pool from './db';

/**
 * Clean Sync Data - Elimina todas las notas y carpetas pero mantiene usuarios
 * Útil para resetear la sincronización sin perder cuentas de usuario
 * 
 * PRECAUCIÓN: Esto eliminará TODAS las notas del servidor.
 * Los clientes las volverán a subir en el próximo sync.
 */

async function cleanSync() {
  const client = await pool.connect();
  
  try {
    console.log('🧹 Limpiando datos de sincronización...');
    console.log('⚠️  PRECAUCIÓN: Esto eliminará todas las notas y carpetas del servidor');
    console.log('');
    
    await client.query('BEGIN');
    
    // Contar registros antes de eliminar
    const notesCount = await client.query('SELECT COUNT(*) as count FROM notes');
    const foldersCount = await client.query('SELECT COUNT(*) as count FROM folders');
    const syncLogCount = await client.query('SELECT COUNT(*) as count FROM sync_log');
    const attachmentsCount = await client.query('SELECT COUNT(*) as count FROM attachments');
    
    console.log('📊 Registros actuales:');
    console.log(`   - Notas: ${notesCount.rows[0].count}`);
    console.log(`   - Carpetas: ${foldersCount.rows[0].count}`);
    console.log(`   - Sync log: ${syncLogCount.rows[0].count}`);
    console.log(`   - Attachments: ${attachmentsCount.rows[0].count}`);
    console.log('');
    
    // Eliminar datos de sync
    console.log('🗑️  Eliminando sync_log...');
    await client.query('DELETE FROM sync_log');
    
    console.log('🗑️  Eliminando attachments...');
    await client.query('DELETE FROM attachments');
    
    console.log('🗑️  Eliminando notas...');
    await client.query('DELETE FROM notes');
    
    console.log('🗑️  Eliminando carpetas...');
    await client.query('DELETE FROM folders');
    
    // Resetear storage usado de usuarios a 0
    console.log('📊 Reseteando storage_used de usuarios a 0...');
    await client.query('UPDATE users SET storage_used = 0');
    
    await client.query('COMMIT');
    
    console.log('');
    console.log('✅ Limpieza completada exitosamente');
    console.log('');
    console.log('📝 Próximos pasos:');
    console.log('   1. En UN cliente (el que tenga los datos más actualizados):');
    console.log('      - Reiniciar la app para forzar sync completo');
    console.log('      - Todas las notas se subirán al servidor');
    console.log('');
    console.log('   2. En los DEMÁS clientes:');
    console.log('      - Reiniciar la app');
    console.log('      - Harán pull y se sincronizarán con el servidor');
    console.log('');
    console.log('⚠️  IMPORTANTE: Asegúrate de que el primer cliente tenga todas las notas actualizadas');
    
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la limpieza:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Confirmación de seguridad
const args = process.argv.slice(2);
if (args[0] !== '--confirm') {
  console.log('⚠️  Este script eliminará TODAS las notas del servidor');
  console.log('');
  console.log('Si estás seguro, ejecuta:');
  console.log('  npm run clean-sync -- --confirm');
  process.exit(1);
}

cleanSync();
