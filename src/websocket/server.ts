import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import pool from '../utils/db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  isAlive?: boolean;
}

interface WSMessage {
  type: 'sync:push' | 'sync:pull-request' | 'heartbeat' | 'pong';
  data?: any;
}

/**
 * WebSocket Sync Server
 * Manages real-time bidirectional sync between devices
 */
export class WebSocketSyncServer {
  private wss: WebSocketServer;
  private clients: Map<string, Set<AuthenticatedWebSocket>> = new Map(); // userId -> Set<WebSocket>
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(port: number) {
    this.wss = new WebSocketServer({ 
      port,
      verifyClient: this.verifyClient.bind(this),
    });

    console.log(`🔌 WebSocket Server listening on port ${port}`);
    
    this.wss.on('connection', this.handleConnection.bind(this));
    this.startHeartbeat();
  }

  /**
   * Verify client authentication during handshake
   */
  private verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }, callback: (result: boolean, code?: number, message?: string) => void): void {
    const url = new URL(info.req.url || '', `ws://${info.req.headers.host}`);
    const token = url.searchParams.get('token');
    const deviceId = url.searchParams.get('deviceId');

    if (!token || !deviceId) {
      callback(false, 401, 'Missing authentication credentials');
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      
      // Attach userId and deviceId to the request for use in handleConnection
      (info.req as any).userId = decoded.userId;
      (info.req as any).deviceId = deviceId;
      
      callback(true);
    } catch (error) {
      console.error('❌ WS Auth failed:', error);
      callback(false, 403, 'Invalid token');
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: AuthenticatedWebSocket, req: IncomingMessage): void {
    const userId = (req as any).userId;
    const deviceId = (req as any).deviceId;

    ws.userId = userId;
    ws.deviceId = deviceId;
    ws.isAlive = true;

    console.log(`✅ WS Client connected - User: ${userId}, Device: ${deviceId}`);

    // Add to clients map
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(ws);

    // Setup event handlers
    ws.on('message', (data: Buffer) => this.handleMessage(ws, data));
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => this.handleDisconnect(ws));
    ws.on('error', (error) => console.error('❌ WS Error:', error));

    // Send welcome message
    this.sendToClient(ws, {
      type: 'heartbeat',
      data: { message: 'Connected to sync server', timestamp: Date.now() },
    });
  }

  /**
   * Handle incoming messages from clients
   */
  private async handleMessage(ws: AuthenticatedWebSocket, data: Buffer): Promise<void> {
    try {
      const message: WSMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'sync:push':
          await this.handleSyncPush(ws, message.data);
          break;

        case 'sync:pull-request':
          await this.handlePullRequest(ws, message.data);
          break;

        case 'heartbeat':
          ws.isAlive = true;
          this.sendToClient(ws, { type: 'pong', data: { timestamp: Date.now() } });
          break;

        default:
          console.warn('⚠️ Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
      this.sendToClient(ws, {
        type: 'sync:push',
        data: { success: false, error: 'Failed to process message' },
      });
    }
  }

  /**
   * Handle sync push from client
   */
  private async handleSyncPush(ws: AuthenticatedWebSocket, changes: any[]): Promise<void> {
    const userId = ws.userId!;
    const deviceId = ws.deviceId!;

    console.log(`📤 WS Push from ${deviceId}: ${changes.length} changes`);

    const conflicts: any[] = [];
    const applied: any[] = [];

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const change of changes) {
        const { entityType, entityId, operation, dataJson, timestamp } = change;

        // Handle note operations
        if (entityType === 'note') {
          if (operation === 'create' || operation === 'update') {
            // Check for conflicts
            const existingNote = await client.query(
              'SELECT updated_at FROM notes WHERE user_id = $1 AND uuid = $2',
              [userId, entityId]
            );

            if (existingNote.rows.length > 0) {
              const serverUpdatedAt = parseInt(existingNote.rows[0].updated_at);

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

            // Debug log: verificar contenido recibido via WebSocket
            console.log(`[WS] Updating note ${entityId} from device ${deviceId}`);
            console.log(`[WS] Content length: ${dataJson.content?.length || 0}`);
            console.log(`[WS] Last 50 chars: "${dataJson.content?.slice(-50) || ''}"`);

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
                dataJson.icon || null,
                dataJson.iconColor || null,
                dataJson.createdAt || Date.now(),
                dataJson.updatedAt || Date.now(),
              ]
            );

            applied.push({ entityType, entityId, operation });
          } else if (operation === 'delete') {
            await client.query(
              'UPDATE notes SET deleted_at = $1 WHERE user_id = $2 AND uuid = $3',
              [Date.now(), userId, entityId]
            );
            applied.push({ entityType, entityId, operation });
          }
        }
        
        // Handle attachment operations
        if (entityType === 'attachment') {
          if (operation === 'create') {
            // Verify attachment exists and belongs to user
            const existingAttachment = await client.query(
              'SELECT id FROM attachments WHERE id = $1 AND user_id = $2',
              [entityId, userId]
            );
            
            if (existingAttachment.rows.length > 0) {
              // Log to sync_log
              await client.query(
                `INSERT INTO sync_log 
                  (user_id, device_id, entity_type, entity_id, operation, data_json, timestamp)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [userId, deviceId, entityType, entityId, operation, dataJson, timestamp]
              );
              
              applied.push({ entityType, entityId, operation });
            }
          } else if (operation === 'delete') {
            // Mark attachment as deleted
            await client.query(
              'UPDATE attachments SET deleted_at = $1 WHERE id = $2 AND user_id = $3',
              [Date.now(), entityId, userId]
            );
            
            // Update user storage
            const attachmentInfo = await client.query(
              'SELECT file_size FROM attachments WHERE id = $1 AND user_id = $2',
              [entityId, userId]
            );
            
            if (attachmentInfo.rows.length > 0) {
              await client.query(
                'UPDATE users SET storage_used = storage_used - $1 WHERE id = $2',
                [attachmentInfo.rows[0].file_size, userId]
              );
            }
            
            // Log to sync_log
            await client.query(
              `INSERT INTO sync_log 
                (user_id, device_id, entity_type, entity_id, operation, data_json, timestamp)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [userId, deviceId, entityType, entityId, operation, dataJson, timestamp]
            );
            
            applied.push({ entityType, entityId, operation });
          }
        }
      }

      await client.query('COMMIT');

      // Send success response to sender
      this.sendToClient(ws, {
        type: 'sync:push',
        data: { success: true, conflicts, applied },
      });

      // Broadcast to other devices of the same user
      if (applied.length > 0) {
        // Get the actual changes that were applied to send them directly
        const broadcastChanges = changes.filter(change =>
          applied.some(applied =>
            applied.entityType === change.entityType &&
            applied.entityId === change.entityId
          )
        );
        
        this.broadcastToUserDevices(userId, deviceId, {
          type: 'sync:push',
          data: { success: true, changes: broadcastChanges },
        });
      }

      console.log(`✅ WS Push completed - Applied: ${applied.length}, Conflicts: ${conflicts.length}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ WS Push error:', error);
      this.sendToClient(ws, {
        type: 'sync:push',
        data: { success: false, error: 'Failed to apply changes' },
      });
    } finally {
      client.release();
    }
  }

  /**
   * Handle pull request from client
   */
  private async handlePullRequest(ws: AuthenticatedWebSocket, data: { since: number }): Promise<void> {
    const userId = ws.userId!;
    const deviceId = ws.deviceId!;
    const since = data.since || 0;

    console.log(`📥 WS Pull request from ${deviceId} since ${since}`);

    try {
      // Query note changes since timestamp
      const notesResult = await pool.query(
        `SELECT uuid, name, path, folder, content, order_index, icon, icon_color, 
                created_at, updated_at, deleted_at
         FROM notes
         WHERE user_id = $1 AND updated_at > $2
         ORDER BY updated_at ASC
         LIMIT 1000`,
        [userId, since]
      );

      const noteChanges = notesResult.rows.map((note: any) => ({
        entityType: 'note',
        entityId: note.uuid,
        operation: note.deleted_at ? 'delete' : 'update',
        dataJson: {
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
        },
        timestamp: parseInt(note.updated_at),
      }));
      
      // Query attachment changes since timestamp
      const attachmentsResult = await pool.query(
        `SELECT id, note_uuid, file_name, file_hash, file_size, mime_type, created_at, deleted_at
         FROM attachments
         WHERE user_id = $1 AND created_at > $2
         ORDER BY created_at ASC
         LIMIT 1000`,
        [userId, since]
      );
      
      const attachmentChanges = attachmentsResult.rows.map((att: any) => ({
        entityType: 'attachment',
        entityId: att.id,
        operation: att.deleted_at ? 'delete' : 'create',
        dataJson: {
          id: att.id,
          noteUuid: att.note_uuid,
          fileName: att.file_name,
          fileHash: att.file_hash,
          fileSize: parseInt(att.file_size),
          mimeType: att.mime_type,
          createdAt: parseInt(att.created_at),
          deletedAt: att.deleted_at ? parseInt(att.deleted_at) : null,
        },
        timestamp: parseInt(att.created_at),
      }));
      
      const changes = [...noteChanges, ...attachmentChanges];

      this.sendToClient(ws, {
        type: 'sync:pull-request',
        data: { success: true, changes },
      });

      console.log(`✅ WS Pull completed - Sent ${noteChanges.length} notes, ${attachmentChanges.length} attachments`);
    } catch (error) {
      console.error('❌ WS Pull error:', error);
      this.sendToClient(ws, {
        type: 'sync:pull-request',
        data: { success: false, error: 'Failed to fetch changes' },
      });
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(ws: AuthenticatedWebSocket): void {
    const userId = ws.userId;
    const deviceId = ws.deviceId;

    console.log(`❌ WS Client disconnected - User: ${userId}, Device: ${deviceId}`);

    if (userId) {
      const userClients = this.clients.get(userId);
      if (userClients) {
        userClients.delete(ws);
        if (userClients.size === 0) {
          this.clients.delete(userId);
        }
      }
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all devices of a user except the sender
   */
  private broadcastToUserDevices(userId: string, excludeDeviceId: string, message: WSMessage): void {
    const userClients = this.clients.get(userId);
    console.log(`📢 Broadcasting to user ${userId} (excluding device ${excludeDeviceId})`);
    console.log(`   Total clients for user: ${userClients?.size || 0}`);
    if (!userClients) return;

    userClients.forEach((client) => {
      if (client.deviceId !== excludeDeviceId && client.readyState === WebSocket.OPEN) {
        console.log(`   ➡️  Sending to device: ${client.deviceId}, readyState: ${client.readyState === 1 ? "OPEN" : "CLOSED"}`);
        client.send(JSON.stringify(message));
      }
    });
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: WebSocket) => {
        const client = ws as AuthenticatedWebSocket;
        
        if (client.isAlive === false) {
          console.log(`💀 Terminating dead connection - User: ${client.userId}, Device: ${client.deviceId}`);
          return client.terminate();
        }

        client.isAlive = false;
        client.ping();
      });
    }, 30000); // 30 seconds
  }

  /**
   * Gracefully shutdown the server
   */
  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down WebSocket server...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    this.wss.clients.forEach((ws) => {
      ws.close(1000, 'Server shutting down');
    });

    // Close server
    await new Promise<void>((resolve) => {
      this.wss.close(() => {
        console.log('✅ WebSocket server closed');
        resolve();
      });
    });
  }
}
