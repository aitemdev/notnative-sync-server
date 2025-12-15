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
  order_index: z.number().optional(),
  icon: z.string().nullable().optional(),
  icon_color: z.string().nullable().optional(),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
  deleted_at: z.number().nullable().optional(),
});

const FolderSchema = z.object({
  path: z.string(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  icon_color: z.string().nullable().optional(),
  order_index: z.number().optional(),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
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
    const notesResult = await pool.query(
      `SELECT * FROM notes 
       WHERE user_id = $1 
       AND (updated_at > $2 OR deleted_at > $2)`,
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
        // Ensure content is never null - use empty string if undefined/null
        const safeContent = note.content !== null && note.content !== undefined ? note.content : '';
        // Use current timestamp if created_at or updated_at are not provided
        const now = Date.now();
        const createdAt = note.created_at || now;
        const updatedAt = note.updated_at || now;
        
        await client.query(
          `INSERT INTO notes (user_id, uuid, name, path, folder, content, order_index, icon, icon_color, created_at, updated_at, deleted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (user_id, uuid) DO UPDATE SET
             name = EXCLUDED.name,
             path = EXCLUDED.path,
             folder = EXCLUDED.folder,
             content = EXCLUDED.content,
             order_index = EXCLUDED.order_index,
             icon = EXCLUDED.icon,
             icon_color = EXCLUDED.icon_color,
             updated_at = EXCLUDED.updated_at,
             deleted_at = EXCLUDED.deleted_at`,
          [userId, note.uuid, note.name, note.path, note.folder, safeContent, note.order_index, note.icon, note.icon_color, createdAt, updatedAt, note.deleted_at]
    // Upsert Folders
    if (folders) {
      for (const folder of folders) {
        // Use current timestamp if created_at or updated_at are not provided
        const now = Date.now();
        const createdAt = folder.created_at || now;
        const updatedAt = folder.updated_at || now;
        
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
          [userId, folder.path, folder.icon, folder.color, folder.icon_color, folder.order_index, createdAt, updatedAt, folder.deleted_at]
        );
      }
    }        deleted_at = EXCLUDED.deleted_at`,
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

export default router;
