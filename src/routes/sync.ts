import { Router, Response } from 'express';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import pool from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
let wsServer: any = null;

function toFiniteTimestamp(value: unknown): number | null {
  if (typeof value === 'bigint') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toIsoOrInvalid(value: unknown): string {
  const timestamp = toFiniteTimestamp(value);
  if (timestamp === null) {
    return 'Invalid';
  }

  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return 'Invalid';
    }
    return date.toISOString();
  } catch {
    return 'Invalid';
  }
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  const parsed = toFiniteTimestamp(value);
  if (parsed === null) {
    return fallback;
  }

  // Keep integer millisecond precision to match client semantics
  const safe = Math.trunc(parsed);
  return Number.isFinite(safe) ? safe : fallback;
}

function normalizeNullableTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = toFiniteTimestamp(value);
  if (parsed === null) {
    return null;
  }

  const safe = Math.trunc(parsed);
  return Number.isFinite(safe) ? safe : null;
}

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

const DatabaseSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  icon: z.string().nullable().optional(),
  snapshot: z.any(),
  created_at: z.number(),
  updated_at: z.number(),
  deleted_at: z.number().nullable().optional(),
});

const PushSchema = z.object({
  notes: z.array(NoteSchema).optional(),
  folders: z.array(FolderSchema).optional(),
  calendar_events: z.array(CalendarEventSchema).optional(),
  databases: z.array(DatabaseSchema).optional(),
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

    // Get changed databases (Notion-style)
    const databasesResult = await pool.query(
      `SELECT uuid, name, icon, snapshot, created_at, updated_at, deleted_at
       FROM databases
       WHERE user_id = $1
       AND (
         (updated_at >= $2 AND deleted_at IS NULL)
         OR (deleted_at >= $2 AND $2 > 0)
       )`,
      [userId, lastSyncTimestamp]
    );

    const databases = databasesResult.rows.map(row => ({
      uuid: row.uuid,
      name: row.name,
      icon: row.icon,
      snapshot: row.snapshot,
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
      calendar_events,
      databases,
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
    
    // Track rejected notes and detected conflicts for client feedback
    const rejectedNotes: string[] = [];
    const detectedConflicts: Array<{ uuid: string; name: string; reason: string; clientTimestamp: number; serverTimestamp: number }> = [];
    
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
        let safeUpdatedAt = normalizeTimestamp(note.updated_at, serverTime);
        let safeCreatedAt = normalizeTimestamp(note.created_at, safeUpdatedAt);
        let safeDeletedAt = normalizeNullableTimestamp(note.deleted_at);
        
        if (clientTimestamp) {
          safeUpdatedAt = normalizeTimestamp(safeUpdatedAt + timeOffset, serverTime);
          safeCreatedAt = normalizeTimestamp(safeCreatedAt + timeOffset, safeUpdatedAt);
          if (safeDeletedAt !== null) {
            safeDeletedAt = normalizeTimestamp(safeDeletedAt + timeOffset, safeUpdatedAt);
          }
        } else {
          // Fallback logic if clientTimestamp is missing (legacy clients)
          if (!safeUpdatedAt || safeUpdatedAt > serverTime + 300000) {
             safeUpdatedAt = serverTime;
          }
        }

        // Keep creation timestamp bounded by update timestamp
        if (safeCreatedAt > safeUpdatedAt) {
          safeCreatedAt = safeUpdatedAt;
        }

        // 🔍 DEBUG: Check if note exists and log potential conflicts
        const existingNote = await client.query(
          `SELECT uuid, name, path, folder, content, content_hash, order_index, icon, icon_color, created_at, updated_at, deleted_at, is_favorite, last_modified_by_device
           FROM notes
           WHERE user_id = $1 AND uuid = $2`,
          [userId, note.uuid]
        );

        if (existingNote.rows.length > 0) {
          const existingRow = existingNote.rows[0];
          const serverUpdatedAt = toFiniteTimestamp(existingRow.updated_at) ?? 0;
          const serverDeletedAt = toFiniteTimestamp(existingRow.deleted_at);
          const serverHash = existingRow.content_hash;

          // P0: Delete-wins protection
          // If server already has tombstone and client tries to resurrect with a non-deleted payload,
          // reject stale resurrection at server edge.
          if (serverDeletedAt !== null && safeDeletedAt === null) {
            console.warn(`⛔ Stale resurrection blocked for note "${note.name}" (UUID: ${note.uuid})`);
            console.warn(`   Server deleted_at: ${serverDeletedAt} (${toIsoOrInvalid(serverDeletedAt)})`);
            console.warn(`   Client updated_at: ${safeUpdatedAt} (${toIsoOrInvalid(safeUpdatedAt)})`);
            rejectedNotes.push(note.uuid);
            continue;
          }

          // If both sides are tombstones, keep the newest delete timestamp.
          if (serverDeletedAt !== null && safeDeletedAt !== null && safeDeletedAt < serverDeletedAt) {
            console.warn(`⏭️ Ignoring older tombstone for note "${note.name}" (UUID: ${note.uuid})`);
            continue;
          }
          
          // Conflict detection: only create conflict copy when there is GENUINE concurrent editing
          // i.e., a DIFFERENT device modified the server version AND content hashes differ
          const serverLastDevice = existingRow.last_modified_by_device;
          const isDifferentDevice = serverLastDevice && serverLastDevice !== deviceId;
          const contentDiverged = note.content_hash !== serverHash && serverHash !== null;
          const bothAlive = serverDeletedAt === null && safeDeletedAt === null;
          
          if (bothAlive && contentDiverged && isDifferentDevice) {
            // True concurrent edit: different device changed the note and content differs
            // Only create conflict if the server version was modified recently (within 60s)
            // to avoid creating conflicts from stale data
            const CONCURRENT_WINDOW_MS = 60000;
            const serverModifiedRecently = (serverTime - serverUpdatedAt) < CONCURRENT_WINDOW_MS;
            
            if (serverModifiedRecently) {
              console.warn(`⚠️ TRUE CONFLICT for note "${note.name}" (UUID: ${note.uuid})`);
              console.warn(`   Server device: ${serverLastDevice}, Push device: ${deviceId}`);
              console.warn(`   Content hash - Client: ${note.content_hash}, Server: ${serverHash}`);

              detectedConflicts.push({
                uuid: note.uuid,
                name: note.name,
                reason: 'concurrent_edit',
                clientTimestamp: safeUpdatedAt,
                serverTimestamp: serverUpdatedAt
              });

              const conflictTimestamp = Math.max(serverUpdatedAt, safeUpdatedAt) + 1;
              const safeDeviceId = String(serverLastDevice || 'unknown')
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, '-')
                .slice(0, 24);
              const conflictPath = `${existingRow.path || normalizedPath}.conflict-${safeDeviceId}-${conflictTimestamp}`;

              await client.query(
                `INSERT INTO notes (
                   user_id, uuid, name, path, folder, content, content_hash, order_index,
                   icon, icon_color, created_at, updated_at, deleted_at, is_favorite, last_modified_by_device
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, $13, $14)
                 ON CONFLICT (user_id, path) DO NOTHING`,
                [
                  userId,
                  randomUUID(),
                  `${existingRow.name || note.name} [conflict]`,
                  conflictPath,
                  existingRow.folder,
                  existingRow.content,
                  existingRow.content_hash,
                  existingRow.order_index,
                  existingRow.icon,
                  existingRow.icon_color,
                  toFiniteTimestamp(existingRow.created_at) ?? conflictTimestamp,
                  conflictTimestamp,
                  existingRow.is_favorite ?? 0,
                  serverLastDevice,
                ]
              );

              console.warn(`🛡️ Preserved server version as conflict copy at path: ${conflictPath}`);
            } else {
              console.log(`ℹ️ Content differs but server version is stale (${serverTime - serverUpdatedAt}ms old), accepting push without conflict copy`);
            }
          } else if (contentDiverged && bothAlive && !isDifferentDevice) {
            console.log(`ℹ️ Content differs but same device (${deviceId}), accepting push without conflict copy`);
          }
        }

        // Handle path collision with different UUID
        // The (user_id, path) UNIQUE constraint applies even to soft-deleted rows, so
        // both branches MUST also free the path or the subsequent INSERT will violate
        // notes_user_id_path_key. Using the uuid as suffix guarantees the renamed path
        // is unique (epoch-based suffixes can collide for same-second concurrent writes).
        const pathCollision = await client.query(
          `SELECT uuid, content_hash FROM notes WHERE user_id = $1 AND path = $2 AND uuid != $3`,
          [userId, normalizedPath, note.uuid]
        );
        if (pathCollision.rows.length > 0) {
          const collision = pathCollision.rows[0];
          if (collision.content_hash && collision.content_hash === note.content_hash) {
            // Same content, different UUID — soft-delete AND free the path
            await client.query(
              `UPDATE notes
                 SET deleted_at = $1,
                     path = path || '.dup-' || $3::text
               WHERE user_id = $2 AND uuid = $3`,
              [serverTime, userId, collision.uuid]
            );
            console.log(`🧹 Soft-deleted duplicate note with same content at path: ${normalizedPath} (UUID: ${collision.uuid})`);
          } else {
            // Rename the colliding row so its path is freed; uuid suffix guarantees uniqueness
            await client.query(
              `UPDATE notes
                 SET path = path || '.conflict-' || uuid::text
               WHERE user_id = $1 AND uuid = $2`,
              [userId, collision.uuid]
            );
          }
        }

        // 🛠️ FIX: Use content_hash for conflict detection instead of just timestamp
        // This prevents losing updates when timestamps are skewed
        await client.query(
          `INSERT INTO notes (user_id, uuid, name, path, folder, content, content_hash, order_index, icon, icon_color, created_at, updated_at, deleted_at, is_favorite, last_modified_by_device)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
             is_favorite = EXCLUDED.is_favorite,
             last_modified_by_device = EXCLUDED.last_modified_by_device
           WHERE 
             -- P0 delete-wins: never resurrect a tombstoned note with a non-deleted payload
             NOT (notes.deleted_at IS NOT NULL AND EXCLUDED.deleted_at IS NULL)
             AND (
               -- Always update if content/metadata changed, regardless of timestamp
               EXCLUDED.content_hash IS DISTINCT FROM notes.content_hash
               OR EXCLUDED.deleted_at IS DISTINCT FROM notes.deleted_at
               OR EXCLUDED.name != notes.name
               OR EXCLUDED.path != notes.path
               OR EXCLUDED.folder IS DISTINCT FROM notes.folder
               OR EXCLUDED.is_favorite IS DISTINCT FROM notes.is_favorite
               -- Or if timestamp is genuinely newer
               OR EXCLUDED.updated_at > notes.updated_at
             )`,
          [userId, note.uuid, note.name, normalizedPath, normalizedFolder, note.content, note.content_hash, note.order_index, note.icon, note.icon_color, safeCreatedAt, safeUpdatedAt, safeDeletedAt, note.is_favorite ?? 0, deviceId]
        );
      }
    }

    // Upsert Folders
    if (folders) {
      for (const folder of folders) {
        // Apply same clock-skew correction as notes
        let safeFolderUpdatedAt = normalizeTimestamp(folder.updated_at, serverTime);
        let safeFolderCreatedAt = normalizeTimestamp(folder.created_at, safeFolderUpdatedAt);
        let safeFolderDeletedAt = normalizeNullableTimestamp(folder.deleted_at);

        if (clientTimestamp) {
          safeFolderUpdatedAt = normalizeTimestamp(safeFolderUpdatedAt + timeOffset, serverTime);
          safeFolderCreatedAt = normalizeTimestamp(safeFolderCreatedAt + timeOffset, safeFolderUpdatedAt);
          if (safeFolderDeletedAt !== null) {
            safeFolderDeletedAt = normalizeTimestamp(safeFolderDeletedAt + timeOffset, safeFolderUpdatedAt);
          }
        } else {
          // Fallback for legacy clients without clientTimestamp
          if (!safeFolderUpdatedAt || safeFolderUpdatedAt > serverTime + 300000) {
            safeFolderUpdatedAt = serverTime;
          }
        }

        if (safeFolderCreatedAt > safeFolderUpdatedAt) {
          safeFolderCreatedAt = safeFolderUpdatedAt;
        }

        await client.query(
          `INSERT INTO folders (user_id, path, icon, color, icon_color, order_index, created_at, updated_at, deleted_at, is_locked, password_hash, is_favorite)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (user_id, path) DO UPDATE SET
             icon = EXCLUDED.icon,
             color = EXCLUDED.color,
             icon_color = EXCLUDED.icon_color,
             order_index = EXCLUDED.order_index,
             updated_at = CASE
               WHEN EXCLUDED.updated_at > folders.updated_at THEN EXCLUDED.updated_at
               ELSE folders.updated_at
             END,
             deleted_at = EXCLUDED.deleted_at,
             is_locked = EXCLUDED.is_locked,
             password_hash = EXCLUDED.password_hash,
             is_favorite = EXCLUDED.is_favorite
           WHERE
             EXCLUDED.icon IS DISTINCT FROM folders.icon
             OR EXCLUDED.color IS DISTINCT FROM folders.color
             OR EXCLUDED.icon_color IS DISTINCT FROM folders.icon_color
             OR EXCLUDED.order_index IS DISTINCT FROM folders.order_index
             OR EXCLUDED.deleted_at IS DISTINCT FROM folders.deleted_at
             OR EXCLUDED.is_locked IS DISTINCT FROM folders.is_locked
             OR EXCLUDED.is_favorite IS DISTINCT FROM folders.is_favorite
             OR EXCLUDED.updated_at > folders.updated_at`,
          [userId, folder.path, folder.icon, folder.color, folder.icon_color, folder.order_index, safeFolderCreatedAt, safeFolderUpdatedAt, safeFolderDeletedAt, folder.is_locked || false, folder.password_hash || null, folder.is_favorite ?? 0]
        );
      }
    }

    // Upsert Calendar Events
    if (calendar_events) {
      const serverTime = Date.now();
      for (const event of calendar_events) {
        // Validate timestamps before processing
        if (!event.start_time || isNaN(event.start_time) || !event.end_time || isNaN(event.end_time)) {
          console.error(`❌ Invalid calendar event timestamps for "${event.title}" (UUID: ${event.uuid})`);
          console.error(`   start_time: ${event.start_time}, end_time: ${event.end_time}`);
          continue; // Skip this event
        }
        
        if (!event.created_at || isNaN(event.created_at) || !event.updated_at || isNaN(event.updated_at)) {
          console.error(`❌ Invalid calendar event metadata timestamps for "${event.title}" (UUID: ${event.uuid})`);
          console.error(`   created_at: ${event.created_at}, updated_at: ${event.updated_at}`);
          continue; // Skip this event
        }
        
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
             updated_at = CASE
               WHEN EXCLUDED.title != calendar_events.title
                 OR EXCLUDED.description IS DISTINCT FROM calendar_events.description
                 OR EXCLUDED.start_time != calendar_events.start_time
                 OR EXCLUDED.end_time != calendar_events.end_time
               THEN GREATEST(EXCLUDED.updated_at, calendar_events.updated_at + 1)
               ELSE GREATEST(EXCLUDED.updated_at, calendar_events.updated_at)
             END,
             deleted_at = EXCLUDED.deleted_at
           WHERE
             EXCLUDED.title != calendar_events.title
             OR EXCLUDED.description IS DISTINCT FROM calendar_events.description
             OR EXCLUDED.start_time != calendar_events.start_time
             OR EXCLUDED.end_time != calendar_events.end_time
             OR EXCLUDED.deleted_at IS DISTINCT FROM calendar_events.deleted_at
             OR EXCLUDED.updated_at > calendar_events.updated_at`,
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

    // Upsert Notion-style databases
    const databases = (req.body?.databases ?? []) as Array<{
      uuid: string;
      name: string;
      icon?: string | null;
      snapshot: any;
      created_at: number;
      updated_at: number;
      deleted_at?: number | null;
    }>;
    if (Array.isArray(databases) && databases.length > 0) {
      for (const dbItem of databases) {
        if (!dbItem?.uuid || typeof dbItem.uuid !== 'string') {
          console.warn('[push:databases] skipping entry without uuid');
          continue;
        }
        let safeCreatedAt = normalizeTimestamp(dbItem.created_at, Date.now());
        let safeUpdatedAt = normalizeTimestamp(dbItem.updated_at, Date.now());
        let safeDeletedAt = normalizeNullableTimestamp(dbItem.deleted_at);
        if (clientTimestamp) {
          safeCreatedAt += timeOffset;
          safeUpdatedAt += timeOffset;
          if (safeDeletedAt != null) safeDeletedAt += timeOffset;
        }
        await client.query(
          `INSERT INTO databases (
             user_id, uuid, name, icon, snapshot, created_at, updated_at, deleted_at
           )
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
           ON CONFLICT (user_id, uuid) DO UPDATE SET
             name = EXCLUDED.name,
             icon = EXCLUDED.icon,
             snapshot = EXCLUDED.snapshot,
             updated_at = GREATEST(EXCLUDED.updated_at, databases.updated_at),
             deleted_at = EXCLUDED.deleted_at
           WHERE EXCLUDED.updated_at > databases.updated_at
              OR EXCLUDED.deleted_at IS DISTINCT FROM databases.deleted_at`,
          [
            userId,
            dbItem.uuid,
            dbItem.name,
            dbItem.icon ?? null,
            JSON.stringify(dbItem.snapshot ?? {}),
            safeCreatedAt,
            safeUpdatedAt,
            safeDeletedAt,
          ]
        );
      }
    }

    await client.query('COMMIT');

    // Notify other clients
    if (wsServer) {
      wsServer.notifySyncAvailable(userId, deviceId);
    }

    res.json({
      success: true,
      timestamp: Date.now(),
      rejected: rejectedNotes,
      conflicts: detectedConflicts
    });

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
      `SELECT dedup.id, dedup.note_uuid, dedup.file_name, dedup.file_hash, dedup.file_size, dedup.mime_type, dedup.created_at, dedup.updated_at, dedup.deleted_at
       FROM (
         SELECT DISTINCT ON (note_uuid, file_name)
           id,
           note_uuid,
           file_name,
           file_hash,
           file_size,
           mime_type,
           created_at,
           updated_at,
           deleted_at
         FROM attachments
         WHERE user_id = $1
         AND note_uuid = ANY($2)
         AND deleted_at IS NULL
         ORDER BY note_uuid, file_name, updated_at DESC, created_at DESC, id DESC
       ) dedup
       WHERE dedup.updated_at >= $3`,
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
