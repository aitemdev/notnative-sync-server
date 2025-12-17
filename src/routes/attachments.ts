import { Router, Response } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../utils/db';
import {
  generateFileHash,
  getStoragePath,
  saveFile,
  deleteFile,
  getAbsoluteFilePath,
  isAllowedMimeType,
  checkStorageQuota,
  updateUserStorage,
} from '../utils/storage';
import fs from 'fs';
import path from 'path';

const router = Router();

// Configurar multer para almacenamiento en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB por defecto
  },
  fileFilter: (req, file, cb) => {
    if (!isAllowedMimeType(file.mimetype)) {
      return cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

// All routes require authentication
router.use(authenticateToken);

// POST /api/attachments/upload - Upload attachment
router.post('/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.userId!;
    const { noteUuid } = req.body;

    if (!noteUuid) {
      return res.status(400).json({ error: 'noteUuid is required' });
    }

    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname;
    const mimeType = req.file.mimetype;
    const fileSize = req.file.size;

    // Verificar cuota de storage
    const quotaCheck = await checkStorageQuota(userId, fileSize);
    if (!quotaCheck.allowed) {
      return res.status(413).json({ error: quotaCheck.reason });
    }

    // Generar hash del archivo
    const fileHash = generateFileHash(fileBuffer);
    const storageKey = getStoragePath(fileHash);

    await client.query('BEGIN');

    // Verificar si el archivo ya existe (deduplicación)
    const existingFile = await client.query(
      'SELECT id, file_hash, s3_key FROM attachments WHERE file_hash = $1 AND user_id = $2 LIMIT 1',
      [fileHash, userId]
    );

    let attachmentId: string;

    if (existingFile.rows.length > 0) {
      // Archivo ya existe, crear nueva entrada apuntando al mismo archivo
      const now = Date.now();
      const result = await client.query(
        `INSERT INTO attachments 
          (user_id, note_uuid, file_name, file_hash, file_size, mime_type, s3_key, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, file_hash, s3_key`,
        [
          userId,
          noteUuid,
          fileName,
          fileHash,
          fileSize,
          mimeType,
          existingFile.rows[0].s3_key, // Reutilizar la misma storage key
          now,
          now,
        ]
      );
      attachmentId = result.rows[0].id;
    } else {
      // Nuevo archivo, guardar físicamente
      await saveFile(fileBuffer, storageKey);

      // Insertar en base de datos
      const now = Date.now();
      const result = await client.query(
        `INSERT INTO attachments 
          (user_id, note_uuid, file_name, file_hash, file_size, mime_type, s3_key, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, file_hash, s3_key`,
        [userId, noteUuid, fileName, fileHash, fileSize, mimeType, storageKey, now, now]
      );
      attachmentId = result.rows[0].id;
    }

    // Actualizar storage usado del usuario
    await client.query(
      'UPDATE users SET storage_used = storage_used + $1, updated_at = NOW() WHERE id = $2',
      [fileSize, userId]
    );

    // Registrar en sync_log
    await client.query(
      `INSERT INTO sync_log 
        (user_id, device_id, entity_type, entity_id, operation, data_json, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        req.body.deviceId || 'server',
        'attachment',
        attachmentId,
        'create',
        JSON.stringify({
          id: attachmentId,
          noteUuid,
          fileName,
          fileHash,
          fileSize,
          mimeType,
          createdAt: Date.now(),
        }),
        Date.now(),
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      attachment: {
        id: attachmentId,
        noteUuid,
        fileName,
        fileHash,
        fileSize,
        mimeType,
        createdAt: Date.now(),
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Upload error:', error);
    
    if (error.message?.includes('File type not allowed')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// GET /api/attachments/:id/download - Download attachment
router.get('/:id/download', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Obtener metadata del attachment
    const result = await pool.query(
      `SELECT id, user_id, file_name, file_hash, file_size, mime_type, s3_key, deleted_at
       FROM attachments
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const attachment = result.rows[0];

    // Verificar que el usuario tiene acceso
    if (attachment.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verificar que no esté eliminado
    if (attachment.deleted_at) {
      return res.status(410).json({ error: 'Attachment has been deleted' });
    }

    const filePath = getAbsoluteFilePath(attachment.s3_key);

    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Configurar headers
    res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', attachment.file_size);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.file_name)}"`);
    res.setHeader('Cache-Control', 'private, max-age=86400'); // Cache 24 horas

    // Stream del archivo
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming file' });
      }
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/attachments/:id - Delete attachment
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  
  try {
    const userId = req.userId!;
    const { id } = req.params;

    await client.query('BEGIN');

    // Obtener attachment info
    const result = await client.query(
      'SELECT id, user_id, file_size, s3_key, deleted_at FROM attachments WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const attachment = result.rows[0];

    if (attachment.user_id !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied' });
    }

    if (attachment.deleted_at) {
      await client.query('ROLLBACK');
      return res.status(410).json({ error: 'Attachment already deleted' });
    }

    // Marcar como eliminado (soft delete)
    await client.query(
      'UPDATE attachments SET deleted_at = $1 WHERE id = $2',
      [Date.now(), id]
    );

    // Actualizar storage usado del usuario (restar)
    await client.query(
      'UPDATE users SET storage_used = storage_used - $1, updated_at = NOW() WHERE id = $2',
      [attachment.file_size, userId]
    );

    // Registrar en sync_log
    await client.query(
      `INSERT INTO sync_log 
        (user_id, device_id, entity_type, entity_id, operation, data_json, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        req.body.deviceId || 'server',
        'attachment',
        id,
        'delete',
        JSON.stringify({ id, deletedAt: Date.now() }),
        Date.now(),
      ]
    );

    await client.query('COMMIT');

    // Nota: No eliminamos el archivo físico inmediatamente
    // El script cleanup-orphans se encargará de eliminar archivos huérfanos

    res.json({ success: true, message: 'Attachment deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// GET /api/attachments - List attachments for a note
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { noteUuid } = req.query;

    let query = `
      SELECT id, note_uuid, file_name, file_hash, file_size, mime_type, created_at
      FROM attachments
      WHERE user_id = $1 AND deleted_at IS NULL
    `;
    const params: any[] = [userId];

    if (noteUuid) {
      query += ' AND note_uuid = $2';
      params.push(noteUuid);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.json({ attachments: result.rows });
  } catch (error) {
    console.error('List attachments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

