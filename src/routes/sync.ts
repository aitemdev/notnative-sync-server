import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Validation schemas
const pullChangesSchema = z.object({
  since: z.number().int().nonnegative().optional(),
  deviceId: z.string(),
  limit: z.number().int().positive().max(10000).default(1000),
});

const pushChangesSchema = z.object({
  changes: z.array(
    z.object({
      entityType: z.string(),
      entityId: z.string(),
      operation: z.enum(['create', 'update', 'delete']),
      dataJson: z.any().optional(),
      timestamp: z.number().int().nonnegative(),
      deviceId: z.string(),
    })
  ),
});

// GET /api/sync/changes - Pull changes from server
router.get('/changes', async (req: AuthRequest, res: Response) => {
  try {
    const { since, deviceId, limit } = pullChangesSchema.parse({
      since: req.query.since ? parseInt(req.query.since as string) : undefined,
      deviceId: req.query.deviceId,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 1000,
    });
    
    const userId = req.userId!;
    
    // Get all changes since timestamp, excluding changes from the requesting device
    const result = await pool.query(
      `SELECT 
        id, entity_type, entity_id, operation, data_json, timestamp, device_id
       FROM sync_log
       WHERE user_id = $1 
         AND ($2::BIGINT IS NULL OR timestamp > $2)
         AND device_id != $3
       ORDER BY timestamp ASC
       LIMIT $4`,
      [userId, since || null, deviceId, limit]
    );
    
    const changes = result.rows.map((row: any) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      dataJson: row.data_json,
      timestamp: parseInt(row.timestamp),
      deviceId: row.device_id,
    }));
    
    // Get full note content for note changes
    const noteChanges = changes.filter((c: any) => c.entityType === 'note' && c.operation !== 'delete');
    
    if (noteChanges.length > 0) {
      const noteUuids = noteChanges.map((c: any) => c.entityId);
      const notesResult = await pool.query(
        `SELECT uuid, name, path, folder, content, order_index, icon, icon_color, 
                created_at, updated_at, deleted_at
         FROM notes
         WHERE user_id = $1 AND uuid = ANY($2)`,
        [userId, noteUuids]
      );
      
      // Merge note content into changes
      const notesMap = new Map(notesResult.rows.map((n: any) => [n.uuid, n]));
      
      for (const change of noteChanges) {
        const note = notesMap.get(change.entityId) as any;
        if (note) {
          change.dataJson = {
            ...change.dataJson,
            uuid: note.uuid,
            name: note.name,
            path: note.path,
            folder: note.folder,
            content: note.content,
            orderIndex: note.order_index,
            icon: note.icon,
            iconColor: note.icon_color,
            createdAt: parseInt(note.created_at),
            updatedAt: parseInt(note.updated_at),
            deletedAt: note.deleted_at ? parseInt(note.deleted_at) : null,
          };
        }
      }
    }
    
    res.json({
      changes,
      hasMore: changes.length === limit,
      lastTimestamp: changes.length > 0 ? changes[changes.length - 1].timestamp : since || 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    console.error('Pull changes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sync/push - Push changes to server
router.post('/push', async (req: AuthRequest, res: Response) => {
  try {
    const { changes } = pushChangesSchema.parse(req.body);
    const userId = req.userId!;
    
    const conflicts: any[] = [];
    const applied: any[] = [];
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const change of changes) {
        const { entityType, entityId, operation, dataJson, timestamp, deviceId } = change;
        
        // Handle note operations
        if (entityType === 'note') {
          if (operation === 'create' || operation === 'update') {
            // Check for conflicts (updated_at comparison)
            const existingNote = await client.query(
              'SELECT updated_at FROM notes WHERE user_id = $1 AND uuid = $2',
              [userId, entityId]
            );
            
            if (existingNote.rows.length > 0) {
              const serverUpdatedAt = parseInt(existingNote.rows[0].updated_at);
              
              // Conflict if server version is newer and different device
              if (serverUpdatedAt > timestamp) {
                conflicts.push({
                  entityType,
                  entityId,
                  localTimestamp: timestamp,
                  serverTimestamp: serverUpdatedAt,
                  operation,
                });
                continue;
              }
            }
            
            // Upsert note
            await client.query(
              `INSERT INTO notes 
                (user_id, uuid, name, path, folder, content, order_index, icon, icon_color, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (user_id, uuid) 
               DO UPDATE SET 
                 name = EXCLUDED.name,
                 path = EXCLUDED.path,
                 folder = EXCLUDED.folder,
                 content = EXCLUDED.content,
                 order_index = EXCLUDED.order_index,
                 icon = EXCLUDED.icon,
                 icon_color = EXCLUDED.icon_color,
                 updated_at = EXCLUDED.updated_at`,
              [
                userId,
                entityId,
                dataJson.name,
                dataJson.path,
                dataJson.folder,
                dataJson.content,
                dataJson.orderIndex || 0,
                dataJson.icon,
                dataJson.iconColor,
                dataJson.createdAt || timestamp,
                dataJson.updatedAt || timestamp,
              ]
            );
          } else if (operation === 'delete') {
            // Soft delete
            await client.query(
              `UPDATE notes SET deleted_at = $1 WHERE user_id = $2 AND uuid = $3`,
              [timestamp, userId, entityId]
            );
          }
          
          // Log sync
          await client.query(
            `INSERT INTO sync_log 
              (user_id, device_id, entity_type, entity_id, operation, data_json, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [userId, deviceId, entityType, entityId, operation, dataJson, timestamp]
          );
          
          applied.push({ entityType, entityId, operation });
        }
        
        // TODO: Handle other entity types (folders, tags, etc.)
      }
      
      await client.query('COMMIT');
      
      res.json({
        applied: applied.length,
        conflicts: conflicts.length,
        conflictDetails: conflicts,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    
    console.error('Push changes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sync/status - Get sync status
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    
    // Get user's devices
    const devicesResult = await pool.query(
      `SELECT id, device_id, device_name, last_sync, created_at
       FROM devices
       WHERE user_id = $1
       ORDER BY last_sync DESC`,
      [userId]
    );
    
    // Get pending changes count
    const pendingResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM sync_log
       WHERE user_id = $1 AND timestamp > EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000`,
      [userId]
    );
    
    res.json({
      devices: devicesResult.rows,
      pendingChanges: parseInt(pendingResult.rows[0].count),
    });
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
