import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  isAlive?: boolean;
}

interface WSMessage {
  type: 'sync:notify' | 'heartbeat' | 'pong';
  data?: any;
}

/**
 * WebSocket Notification Server
 * Sends real-time notifications to trigger HTTP REST sync between devices
 * Does NOT handle data sync directly - only notifies clients to pull via HTTP
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
        case 'heartbeat':
          ws.isAlive = true;
          this.sendToClient(ws, { type: 'pong', data: { timestamp: Date.now() } });
          break;

        default:
          console.warn('⚠️ Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
    }
  }

  /**
   * Notify all devices of a user (except sender) that new sync data is available
   * This triggers clients to make an HTTP pull request
   */
  notifySyncAvailable(userId: string, excludeDeviceId: string, data?: any): void {
    const userClients = this.clients.get(userId);
    
    if (!userClients || userClients.size === 0) {
      console.log(`📢 No connected clients for user ${userId} - will sync on next connection`);
      return;
    }

    console.log(`📢 Notifying user ${userId} devices (excluding ${excludeDeviceId}) - ${userClients.size} total clients`);
    
    const message: WSMessage = {
      type: 'sync:notify',
      data: {
        timestamp: Date.now(),
        sourceDeviceId: excludeDeviceId,
        ...data,
      },
    };

    let notifiedCount = 0;
    userClients.forEach((client) => {
      if (client.deviceId !== excludeDeviceId && client.readyState === WebSocket.OPEN) {
        console.log(`   ➡️  Notifying device: ${client.deviceId}`);
        client.send(JSON.stringify(message));
        notifiedCount++;
      }
    });
    
    console.log(`✅ Notified ${notifiedCount} device(s)`);
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
