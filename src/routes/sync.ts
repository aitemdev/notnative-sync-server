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
  is_favorite: z.number().optional(), // 0 or 1
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
  is_locked: z.boolean().optional(),
  password_hash: z.string().nullable().optional(),
  is_favorite: z.number().optional(), // 0 or 1
});

const CalendarEventSchema = z.object({
  uuid: z.string(),
  note_uuid: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  start_time: z.number(),
  end_time: z.number(),
  all_day: z.boolean().optional(),
  location: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  reminder_minutes: z.number().nullable().optional(),
  recurrence_rule: z.string().nullable().optional(),
  recurrence_end: z.number().nullable().optional(),
  status: z.number().optional(),
  created_at: z.number(),
  updated_at: z.number(),
  deleted_at: z.number().nullable().optional(),
});

const PushSchema = z.object({
  notes: z.array(NoteSchema).optional(),
  folders: z.array(FolderSchema).optional(),
  calendar_events: z.array(CalendarEventSchema).optional(),
  deviceId: z.string(),
  clientTimestamp: z.number().optional(),
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
    // OPTIMIZATION: If lastSyncTimestamp is 0 (fresh sync), DO NOT send deleted notes
    // The client has no notes, so it doesn't need to delete anything.
    // Use >= instead of > to avoid race conditions where client/server timestamps are identical
    const notesResult = await pool.query(
      `SELECT * FROM notes 
       WHERE user_id = $1 
       AND (
         (updated_at >= $2 AND deleted_at IS NULL)
         OR (deleted_at >= $2 AND $2 > 0)
       )`,
      [userId, lastSyncTimestamp]
    );

    // Get changed folders
    // Use >= instead of > to avoid race conditions
    const foldersResult = await pool.query(
      `SELECT * FROM folders 
       WHERE user_id = $1 
       AND (updated_at >= $2 OR deleted_at >= $2)`,
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

    // Get changed calendar events
    const calendarEventsResult = await pool.query(
      `SELECT * FROM calendar_events 
       WHERE user_id = $1 
       AND (
         (updated_at >= $2 AND deleted_at IS NULL)
         OR (deleted_at >= $2 AND $2 > 0)
       )`,
      [userId, lastSyncTimestamp]
    );

    const calendar_events = calendarEventsResult.rows.map(row => ({
      ...row,
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      deleted_at: row.deleted_at ? Number(row.deleted_at) : null,
      start_time: Number(row.start_time),
      end_time: Number(row.end_time),
      recurrence_end: row.recurrence_end ? Number(row.recurrence_end) : null,
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
      calendar_events,
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
    const { notes, folders, calendar_events, deviceId, clientTimestamp } = PushSchema.parse(req.body);
    const userId = req.userId!;
    
    await client.query('BEGIN');

    // Calculate time offset if client timestamp is provided
    // offset = serverTime - clientTime
    // adjustedTime = clientTime + offset
    const serverTime = Date.now();
    const timeOffset = clientTimestamp ? serverTime - clientTimestamp : 0;
    
    if (clientTimestamp && Math.abs(timeOffset) > 60000) {
      console.log(`🕒 Clock skew detected: Client ${deviceId} is off by ${timeOffset}ms`);
    }

    // Upsert Notes
    if (notes) {
      for (const note of notes) {
        // Normalize path and folder to forward slashes for cross-platform consistency
        const normalizedPath = note.path ? note.path.replace(/\\/g, '/') : note.path;
        const normalizedFolder = note.folder ? note.folder.replace(/\\/g, '/') : note.folder;
        
        // Adjust timestamps using the calculated offset
        // This normalizes the client's time to the server's timeline
        let safeUpdatedAt = note.updated_at;
        let safeCreatedAt = note.created_at;
        let safeDeletedAt = note.deleted_at;
        
        if (clientTimestamp) {
          safeUpdatedAt = safeUpdatedAt + timeOffset;
          safeCreatedAt = safeCreatedAt + timeOffset;
          if (safeDeletedAt) safeDeletedAt = safeDeletedAt + timeOffset;
        } else {
          // Fallback logic if clientTimestamp is missing (legacy clients)
          if (!safeUpdatedAt || safeUpdatedAt > serverTime + 300000) {
             safeUpdatedAt = serverTime;
          }
        }

        // 🔍 DEBUG: Check if note exists and log potential conflicts
        const existingNote = await client.query(
          `SELECT updated_at, content_hash, name FROM notes WHERE user_id = $1 AND uuid = $2`,
          [userId, note.uuid]
        );

        if (existingNote.rows.length > 0) {
          const serverUpdatedAt = existingNote.rows[0].updated_at;
          const serverHash = existingNote.rows[0].content_hash;
          const serverName = existingNote.rows[0].name;
          
          // Log if we're potentially rejecting an update due to timestamp
          if (safeUpdatedAt <= serverUpdatedAt && note.content_hash !== serverHash) {
            console.warn(`⚠️ POTENTIAL CONFLICT for note "${note.name}" (UUID: ${note.uuid})`);
            console.warn(`   Client timestamp: ${safeUpdatedAt} (${new Date(safeUpdatedAt).toISOString()})`);
            console.warn(`   Server timestamp: ${serverUpdatedAt} (${new Date(serverUpdatedAt).toISOString()})`);
            console.warn(`   Content hash - Client: ${note.content_hash}, Server: ${serverHash}`);
            console.warn(`   Device: ${deviceId}, Time offset: ${timeOffset}ms`);
            console.warn(`   🔥 Content differs but client timestamp is not newer - forcing update with incremented timestamp`);
          }
        }

        // Handle path collision with different UUID
        // If a note exists with the same path but different UUID, we rename the old one
        // to avoid unique constraint violation on (user_id, path).
        await client.query(
          `UPDATE notes 
           SET path = path || '.conflict-' || CAST(EXTRACT(EPOCH FROM NOW()) AS INTEGER)
           WHERE user_id = $1 AND path = $2 AND uuid != $3`,
          [userId, normalizedPath, note.uuid]
        );

        // 🛠️ FIX: Use content_hash for conflict detection instead of just timestamp
        // This prevents losing updates when timestamps are skewed
        await client.query(
          `INSERT INTO notes (user_id, uuid, name, path, folder, content, content_hash, order_index, icon, icon_color, created_at, updated_at, deleted_at, is_favorite)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (user_id, uuid) DO UPDATE SET
             name = EXCLUDED.name,
             path = EXCLUDED.path,
             folder = EXCLUDED.folder,
             content = EXCLUDED.content,
             content_hash = EXCLUDED.content_hash,
             order_index = EXCLUDED.order_index,
             icon = EXCLUDED.icon,
             icon_color = EXCLUDED.icon_color,
             updated_at = CASE
               -- If content changed, always update with max timestamp to ensure sync
               WHEN EXCLUDED.content_hash IS DISTINCT FROM notes.content_hash THEN
                 GREATEST(EXCLUDED.updated_at, notes.updated_at + 1)
               -- If content is same, use the newer timestamp
               ELSE
                 GREATEST(EXCLUDED.updated_at, notes.updated_at)
             END,
             deleted_at = EXCLUDED.deleted_at,
             is_favorite = EXCLUDED.is_favorite
           WHERE 
             -- Always update if content/metadata changed, regardless of timestamp
             EXCLUDED.content_hash IS DISTINCT FROM notes.content_hash
             OR EXCLUDED.deleted_at IS DISTINCT FROM notes.deleted_at
             OR EXCLUDED.name != notes.name
             OR EXCLUDED.path != notes.path
             OR EXCLUDED.folder IS DISTINCT FROM notes.folder
             OR EXCLUDED.is_favorite IS DISTINCT FROM notes.is_favorite
             -- Or if timestamp is genuinely newer
             OR EXCLUDED.updated_at > notes.updated_at`,
          [userId, note.uuid, note.name, normalizedPath, normalizedFolder, note.content, note.content_hash, note.order_index, note.icon, note.icon_color, safeCreatedAt, safeUpdatedAt, safeDeletedAt, note.is_favorite ?? 0]
        );
      }
    }

    // Upsert Folders
    if (folders) {
      const serverTime = Date.now();
      for (const folder of folders) {
        const safeUpdatedAt = serverTime;
        await client.query(
          `INSERT INTO folders (user_id, path, icon, color, icon_color, order_index, created_at, updated_at, deleted_at, is_locked, password_hash, is_favorite)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (user_id, path) DO UPDATE SET
             icon = EXCLUDED.icon,
             color = EXCLUDED.color,
             icon_color = EXCLUDED.icon_color,
             order_index = EXCLUDED.order_index,
             updated_at = EXCLUDED.updated_at,
             deleted_at = EXCLUDED.deleted_at,
             is_locked = EXCLUDED.is_locked,
             password_hash = EXCLUDED.password_hash,
             is_favorite = EXCLUDED.is_favorite`,
          [userId, folder.path, folder.icon, folder.color, folder.icon_color, folder.order_index, folder.created_at, safeUpdatedAt, folder.deleted_at ? safeUpdatedAt : null, folder.is_locked || false, folder.password_hash || null, folder.is_favorite ?? 0]
        );
      }
    }

    // Upsert Calendar Events
    if (calendar_events) {
      const serverTime = Date.now();
      for (const event of calendar_events) {
        // Adjust timestamps if client timestamp is provided
        let safeUpdatedAt = event.updated_at;
        let safeCreatedAt = event.created_at;
        let safeDeletedAt = event.deleted_at;
        
        if (clientTimestamp) {
          safeUpdatedAt = safeUpdatedAt + timeOffset;
          safeCreatedAt = safeCreatedAt + timeOffset;
          if (safeDeletedAt) safeDeletedAt = safeDeletedAt + timeOffset;
        }

        await client.query(
          `INSERT INTO calendar_events (
             user_id, uuid, note_uuid, title, description, start_time, end_time, 
             all_day, location, color, reminder_minutes, recurrence_rule, recurrence_end, 
             status, created_at, updated_at, deleted_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           ON CONFLICT (user_id, uuid) DO UPDATE SET
             note_uuid = EXCLUDED.note_uuid,
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             start_time = EXCLUDED.start_time,
             end_time = EXCLUDED.end_time,
             all_day = EXCLUDED.all_day,
             location = EXCLUDED.location,
             color = EXCLUDED.color,
             reminder_minutes = EXCLUDED.reminder_minutes,
             recurrence_rule = EXCLUDED.recurrence_rule,
             recurrence_end = EXCLUDED.recurrence_end,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at,
             deleted_at = EXCLUDED.deleted_at
           WHERE calendar_events.updated_at <= EXCLUDED.updated_at`,
          [
            userId, 
            event.uuid, 
            event.note_uuid || null, 
            event.title, 
            event.description || null, 
            event.start_time, 
            event.end_time,
            event.all_day || false, 
            event.location || null, 
            event.color || null, 
            event.reminder_minutes || null, 
            event.recurrence_rule || null, 
            event.recurrence_end || null,
            event.status || 1, 
            safeCreatedAt, 
            safeUpdatedAt, 
            safeDeletedAt || null
          ]
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
    // Use >= instead of > to avoid race conditions
    const attachmentsResult = await pool.query(
      `SELECT id, note_uuid, file_name, file_hash, file_size, mime_type, created_at, updated_at, deleted_at
       FROM attachments 
       WHERE user_id = $1 
       AND note_uuid = ANY($2)
       AND deleted_at IS NULL
       AND updated_at >= $3`,
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
