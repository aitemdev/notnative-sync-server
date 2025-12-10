#!/usr/bin/env node
import pool from './db';
import { deleteFile } from './storage';

/**
 * Cleanup Orphaned Attachments Script
 * 
 * Este script identifica y elimina archivos adjuntos huérfanos que:
 * 1. No tienen referencias en el contenido de ninguna nota (notes.content)
 * 2. Han estado sin referencias durante al menos 7 días
 * 
 * Ejecutar manualmente con: npm run cleanup
 */

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
const DRY_RUN = process.env.DRY_RUN === 'true'; // Set DRY_RUN=true para solo listar sin eliminar

interface Attachment {
  id: string;
  user_id: string;
  file_name: string;
  file_size: number;
  s3_key: string;
  created_at: string;
  note_uuid: string;
}

/**
 * Busca archivos adjuntos que no están referenciados en ninguna nota
 */
async function findOrphanedAttachments(): Promise<Attachment[]> {
  console.log('🔍 Buscando archivos adjuntos huérfanos...');

  const result = await pool.query<Attachment>(
    `SELECT 
      a.id, 
      a.user_id, 
      a.file_name, 
      a.file_size, 
      a.s3_key, 
      a.created_at,
      a.note_uuid
     FROM attachments a
     WHERE a.deleted_at IS NULL
       AND a.created_at < $1
       AND NOT EXISTS (
         SELECT 1 
         FROM notes n 
         WHERE n.user_id = a.user_id 
           AND n.deleted_at IS NULL
           AND (
             n.content LIKE '%' || a.file_name || '%'
             OR n.content LIKE '%' || a.id || '%'
           )
       )`,
    [Date.now() - GRACE_PERIOD_MS]
  );

  return result.rows;
}

/**
 * Busca archivos adjuntos marcados como deleted_at hace más de 7 días
 */
async function findDeletedAttachments(): Promise<Attachment[]> {
  console.log('🔍 Buscando archivos adjuntos marcados como eliminados...');

  const result = await pool.query<Attachment>(
    `SELECT 
      id, 
      user_id, 
      file_name, 
      file_size, 
      s3_key, 
      created_at,
      note_uuid
     FROM attachments
     WHERE deleted_at IS NOT NULL
       AND deleted_at < $1`,
    [Date.now() - GRACE_PERIOD_MS]
  );

  return result.rows;
}

/**
 * Elimina físicamente un attachment y actualiza el storage del usuario
 */
async function cleanupAttachment(attachment: Attachment): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Eliminar el archivo físico
    if (!DRY_RUN) {
      try {
        await deleteFile(attachment.s3_key);
        console.log(`  ✅ Archivo eliminado: ${attachment.s3_key}`);
      } catch (error) {
        console.warn(`  ⚠️  Error al eliminar archivo físico: ${error}`);
      }
    } else {
      console.log(`  [DRY RUN] Eliminaría archivo: ${attachment.s3_key}`);
    }

    // Actualizar storage del usuario (restar el tamaño del archivo)
    if (!DRY_RUN) {
      await client.query(
        `UPDATE users 
         SET storage_used = GREATEST(0, storage_used - $1), 
             updated_at = NOW() 
         WHERE id = $2`,
        [attachment.file_size, attachment.user_id]
      );
    } else {
      console.log(`  [DRY RUN] Actualizaría storage del usuario ${attachment.user_id}: -${attachment.file_size} bytes`);
    }

    // Eliminar completamente el registro de la base de datos
    if (!DRY_RUN) {
      await client.query('DELETE FROM attachments WHERE id = $1', [attachment.id]);
    } else {
      console.log(`  [DRY RUN] Eliminaría registro de DB: ${attachment.id}`);
    }

    // Registrar en sync_log para notificar a los clientes
    if (!DRY_RUN) {
      await client.query(
        `INSERT INTO sync_log 
          (user_id, device_id, entity_type, entity_id, operation, data_json, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          attachment.user_id,
          'cleanup-script',
          'attachment',
          attachment.id,
          'delete',
          JSON.stringify({ 
            id: attachment.id, 
            fileName: attachment.file_name,
            reason: 'orphaned_cleanup',
            deletedAt: Date.now() 
          }),
          Date.now(),
        ]
      );
    } else {
      console.log(`  [DRY RUN] Registraría en sync_log`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Función principal del script
 */
async function main() {
  console.log('🧹 Iniciando limpieza de archivos adjuntos huérfanos...');
  console.log(`   Período de gracia: ${GRACE_PERIOD_MS / (24 * 60 * 60 * 1000)} días`);
  console.log(`   Modo: ${DRY_RUN ? 'DRY RUN (solo listar)' : 'EJECUCIÓN REAL'}`);
  console.log('');

  try {
    // Encontrar attachments huérfanos (sin referencias en notas)
    const orphanedAttachments = await findOrphanedAttachments();
    console.log(`📊 Encontrados ${orphanedAttachments.length} archivos huérfanos`);

    // Encontrar attachments marcados como eliminados
    const deletedAttachments = await findDeletedAttachments();
    console.log(`📊 Encontrados ${deletedAttachments.length} archivos marcados como eliminados`);

    const allAttachmentsToClean = [...orphanedAttachments, ...deletedAttachments];
    
    if (allAttachmentsToClean.length === 0) {
      console.log('✨ No hay archivos para limpiar');
      return;
    }

    console.log('');
    console.log(`🗑️  Limpiando ${allAttachmentsToClean.length} archivos adjuntos...`);
    console.log('');

    let successCount = 0;
    let errorCount = 0;
    let totalSizeFreed = 0;

    for (const attachment of allAttachmentsToClean) {
      try {
        console.log(`📄 ${attachment.file_name} (${formatBytes(attachment.file_size)})`);
        console.log(`   ID: ${attachment.id}`);
        console.log(`   Usuario: ${attachment.user_id}`);
        console.log(`   Nota: ${attachment.note_uuid}`);
        
        await cleanupAttachment(attachment);
        
        successCount++;
        totalSizeFreed += attachment.file_size;
      } catch (error) {
        console.error(`  ❌ Error al limpiar ${attachment.file_name}:`, error);
        errorCount++;
      }
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 Resumen de limpieza:');
    console.log(`   ✅ Limpiados exitosamente: ${successCount}`);
    console.log(`   ❌ Errores: ${errorCount}`);
    console.log(`   💾 Espacio liberado: ${formatBytes(totalSizeFreed)}`);
    
    if (DRY_RUN) {
      console.log('');
      console.log('⚠️  MODO DRY RUN - No se realizaron cambios reales');
      console.log('   Para ejecutar la limpieza, ejecuta sin DRY_RUN=true');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    console.error('❌ Error fatal durante la limpieza:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Formatea bytes a formato legible
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Ejecutar el script
main().catch(console.error);
