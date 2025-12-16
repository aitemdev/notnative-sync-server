import { Router, Response } from 'express';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import pool from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
let wsServer: any = null;

export function setWebSocketServer(ws: any) {
  wsServer = ws;
}

router.use(authenticateToken);

// Schemas
const NoteSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  path: z.string(),
  folder: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  content_hash: z.string().nullable().optional(),
  order_index: z.number().optional(),
  icon: z.string().nullable().optional(),
  icon_color: z.string().nullable().optional(),
  created_at: z.number(),
  updated_at: z.number(),
  deleted_at: z.number().nullable().optional(),
});

const FolderSchema = z.object({
  path: z.string(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  icon_color: z.string().nullable().optional(),
  order_index: z.number().optional(),
  created_at: z.number(),
  updated_at: z.number(),
  deleted_at: z.number().nullable().optional(),
});

const PushSchema = z.object({
  notes: z.array(NoteSchema).optional(),
  folders: z.array(FolderSchema).optional(),
  deviceId: z.string(),
});

const PullSchema = z.object({
  lastSyncTimestamp: z.number(),
});

// PULL
router.post('/pull', async (req: AuthRequest, res: Response) => {
  try {
    const { lastSyncTimestamp } = PullSchema.parse(req.body);
    const userId = req.userId!;

    // Get changed notes
    // Return: modified non-deleted notes OR recently deleted notes
    // This prevents old deleted notes from being restored on fresh sync
    const notesResult = await pool.query(
      `SELECT * FROM notes 
       WHERE user_id = $1 
       AND (
         (updated_at > $2 AND deleted_at IS NULL)
         OR deleted_at > $2
       )`,
      [userId, lastSyncTimestamp]
    );

    // Get changed folders
    const foldersResult = await pool.query(
      `SELECT * FROM folders 
       WHERE user_id = $1 
       AND (updated_at > $2 OR deleted_at > $2)`,
      [userId, lastSyncTimestamp]
    );

    // Convert BigInt to Number for JSON
    const notes = notesResult.rows.map(row => ({
      ...row,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      deleted_at: row.deleted_at ? Number(row.deleted_at) : null,
      // Ensure content is never undefined - use empty string if null
      content: row.content !== null && row.content !== undefined ? row.content : '',
      // Ensure path is never null - construct from name if missing
      path: row.path || `${row.folder ? row.folder + '/' : ''}${row.name}.md`
    }));

    const folders = foldersResult.rows.map(row => ({
      ...row,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      deleted_at: row.deleted_at ? Number(row.deleted_at) : null,
    }));
    
    // Log notes with missing content for debugging
    const notesWithoutContent = notes.filter(n => !n.content && !n.deleted_at);
    if (notesWithoutContent.length > 0) {
      console.warn(`⚠️ Found ${notesWithoutContent.length} notes without content:`, 
        notesWithoutContent.map(n => `${n.name} (${n.uuid})`));
    }

    res.json({
      notes,
      folders,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('Pull error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// PUSH
router.post('/push', async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { notes, folders, deviceId } = PushSchema.parse(req.body);
    const userId = req.userId!;
    
    await client.query('BEGIN');

    // Upsert Notes
    if (notes) {
      for (const note of notes) {
        // Normalize path and folder to forward slashes for cross-platform consistency
        const normalizedPath = note.path ? note.path.replace(/\\/g, '/') : note.path;
        const normalizedFolder = note.folder ? note.folder.replace(/\\/g, '/') : note.folder;
        
        await client.query(
          `INSERT INTO notes (user_id, uuid, name, path, folder, content, content_hash, order_index, icon, icon_color, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (user_id, uuid) DO UPDATE SET
             name = EXCLUDED.name,
             path = EXCLUDED.path,
             folder = EXCLUDED.folder,
             content = EXCLUDED.content,
             content_hash = EXCLUDED.content_hash,
             order_index = EXCLUDED.order_index,
             icon = EXCLUDED.icon,
             icon_color = EXCLUDED.icon_color,
             updated_at = EXCLUDED.updated_at,
             deleted_at = EXCLUDED.deleted_at`,
          [userId, note.uuid, note.name, normalizedPath, normalizedFolder, note.content, note.content_hash, note.order_index, note.icon, note.icon_color, note.created_at, note.updated_at, note.deleted_at]
        );
      }
    }

    // Upsert Folders
    if (folders) {
      for (const folder of folders) {
        await client.query(
          `INSERT INTO folders (user_id, path, icon, color, icon_color, order_index, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (user_id, path) DO UPDATE SET
             icon = EXCLUDED.icon,
             color = EXCLUDED.color,
             icon_color = EXCLUDED.icon_color,
             order_index = EXCLUDED.order_index,
             updated_at = EXCLUDED.updated_at,
             deleted_at = EXCLUDED.deleted_at`,
          [userId, folder.path, folder.icon, folder.color, folder.icon_color, folder.order_index, folder.created_at, folder.updated_at, folder.deleted_at]
        );
      }
    }

    await client.query('COMMIT');

    // Notify other clients
    if (wsServer) {
      wsServer.notifySyncAvailable(userId, deviceId);
    }

    res.json({ success: true, timestamp: Date.now() });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Push error:', error);
    res.status(500).json({ error: (error as Error).message });
  } finally {
    client.release();
  }
});

// ATTACHMENTS PULL
const AttachmentsPullSchema = z.object({
  noteUuids: z.array(z.string()),
  lastSyncTimestamp: z.number(),
});

router.post('/attachments/pull', async (req: AuthRequest, res: Response) => {
  try {
    const { noteUuids, lastSyncTimestamp } = AttachmentsPullSchema.parse(req.body);
    const userId = req.userId!;

    if (noteUuids.length === 0) {
      return res.json({ attachments: [], timestamp: Date.now() });
    }

    // Get attachments for the specified notes that were updated/deleted after lastSyncTimestamp
    const attachmentsResult = await pool.query(
      `SELECT id, note_uuid, file_name, file_hash, file_size, mime_type, created_at, updated_at, deleted_at
       FROM attachments 
       WHERE user_id = $1 
       AND note_uuid = ANY($2)
       AND (updated_at > $3 OR deleted_at > $3)`,
      [userId, noteUuids, lastSyncTimestamp]
    );

    // Convert BigInt to Number for JSON
    const attachments = attachmentsResult.rows.map(row => ({
      id: row.id,
      note_uuid: row.note_uuid,
      file_name: row.file_name,
      file_hash: row.file_hash,
      file_size: Number(row.file_size),
      mime_type: row.mime_type,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      deleted_at: row.deleted_at ? Number(row.deleted_at) : null,
    }));

    res.json({
      attachments,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('Attachments pull error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
