import Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import { SyncConfigDatabase, SyncLogDatabase, SyncChange, SyncConflict, SyncStatus } from './sync-db';
import type { NotesDatabase } from '../database/notes';

const SYNC_INTERVAL = 3 * 60 * 1000; // 3 minutes
const MAX_RETRY_DELAY = 30 * 60 * 1000; // 30 minutes

export class SyncService {
  private db: Database.Database;
  private notesDb: NotesDatabase;
  private syncConfigDb: SyncConfigDatabase;
  private syncLogDb: SyncLogDatabase;
  private syncInterval?: NodeJS.Timeout;
  private retryDelay: number = SYNC_INTERVAL;
  private isSyncing: boolean = false;
  private mainWindow?: BrowserWindow;

  constructor(db: Database.Database, notesDb: NotesDatabase) {
    this.db = db;
    this.notesDb = notesDb;
    this.syncConfigDb = new SyncConfigDatabase(db);
    this.syncLogDb = new SyncLogDatabase(db);
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // ============== AUTHENTICATION ==============

  async login(email: string, password: string, serverUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const deviceId = this.syncConfigDb.get('device_id') || '';
      
      const response = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, deviceId }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Login failed' };
      }

      const data = await response.json();

      // Save credentials
      this.syncConfigDb.set('user_id', data.user.id);
      this.syncConfigDb.set('jwt_token', data.accessToken);
      this.syncConfigDb.set('refresh_token', data.refreshToken);
      this.syncConfigDb.set('server_url', serverUrl);
      this.syncConfigDb.set('user_email', email);

      // Start periodic sync
      this.startPeriodicSync();

      // Perform initial sync
      await this.manualSync();

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  async register(email: string, password: string, serverUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const deviceId = this.syncConfigDb.get('device_id') || '';

      const response = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, deviceId }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Registration failed' };
      }

      const data = await response.json();

      // Save credentials
      this.syncConfigDb.set('user_id', data.user.id);
      this.syncConfigDb.set('jwt_token', data.accessToken);
      this.syncConfigDb.set('refresh_token', data.refreshToken);
      this.syncConfigDb.set('server_url', serverUrl);
      this.syncConfigDb.set('user_email', email);

      console.log('✅ Login successful. Saved config:', {
        userId: data.user.id,
        serverUrl,
        userEmail: email,
      });

      // Start periodic sync
      this.startPeriodicSync();

      return { success: true };
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  async logout(): Promise<void> {
    const refreshToken = this.syncConfigDb.get('refresh_token');
    const serverUrl = this.syncConfigDb.get('server_url');

    if (refreshToken && serverUrl) {
      try {
        await fetch(`${serverUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    // Clear credentials
    this.syncConfigDb.delete('user_id');
    this.syncConfigDb.delete('jwt_token');
    this.syncConfigDb.delete('refresh_token');
    this.syncConfigDb.delete('server_url');
    this.syncConfigDb.delete('user_email');
    this.syncConfigDb.delete('last_sync_timestamp');
    this.syncConfigDb.delete('last_sync_timestamp');

    // Stop periodic sync
    this.stopPeriodicSync();
  }

  async refreshToken(): Promise<boolean> {
    try {
      const refreshToken = this.syncConfigDb.get('refresh_token');
      const serverUrl = this.syncConfigDb.get('server_url');

      if (!refreshToken || !serverUrl) {
        return false;
      }

      const response = await fetch(`${serverUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      this.syncConfigDb.set('jwt_token', data.accessToken);

      return true;
    } catch (error) {
      console.error('Refresh token error:', error);
      return false;
    }
  }

  // ============== SYNC OPERATIONS ==============

  async manualSync(): Promise<{ success: boolean; conflicts?: SyncConflict[]; error?: string }> {
    if (!this.syncConfigDb.isLoggedIn()) {
      return { success: false, error: 'Not logged in' };
    }

    if (this.isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    this.isSyncing = true;
    this.sendToRenderer('sync:status-changed', { isSyncing: true });

    try {
      // 1. Pull changes from server
      const pullResult = await this.pullChanges();
      if (!pullResult.success) {
        throw new Error(pullResult.error || 'Pull failed');
      }

      // 2. Push local changes to server
      const pushResult = await this.pushChanges();
      if (!pushResult.success) {
        throw new Error(pushResult.error || 'Push failed');
      }

      // 3. Update last sync timestamp
      this.syncConfigDb.set('last_sync_timestamp', Date.now().toString());

      // Reset retry delay on successful sync
      this.retryDelay = SYNC_INTERVAL;

      this.sendToRenderer('sync:completed', {
        conflicts: pushResult.conflicts,
        timestamp: Date.now(),
      });

      return {
        success: true,
        conflicts: pushResult.conflicts,
      };
    } catch (error) {
      console.error('Sync error:', error);
      
      // Exponential backoff
      this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_DELAY);

      this.sendToRenderer('sync:error', {
        error: (error as Error).message,
      });

      return {
        success: false,
        error: (error as Error).message,
      };
    } finally {
      this.isSyncing = false;
      this.sendToRenderer('sync:status-changed', { isSyncing: false });
    }
  }

  private async pullChanges(): Promise<{ success: boolean; error?: string }> {
    try {
      const serverUrl = this.syncConfigDb.get('server_url');
      const jwtToken = this.syncConfigDb.get('jwt_token');
      const deviceId = this.syncConfigDb.get('device_id');
      const lastSync = parseInt(this.syncConfigDb.get('last_sync_timestamp') || '0');

      if (!serverUrl || !jwtToken || !deviceId) {
        return { success: false, error: 'Missing configuration' };
      }

      const response = await fetch(
        `${serverUrl}/api/sync/changes?since=${lastSync}&deviceId=${deviceId}`,
        {
          headers: {
            'Authorization': `Bearer ${jwtToken}`,
          },
        }
      );

      if (response.status === 403) {
        // Token expired, try to refresh
        const refreshed = await this.refreshToken();
        if (refreshed) {
          return this.pullChanges(); // Retry with new token
        }
        return { success: false, error: 'Authentication expired' };
      }

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Pull failed' };
      }

      const data = await response.json();
      const changes: SyncChange[] = data.changes;

      // Apply changes to local database
      await this.applyRemoteChanges(changes);

      return { success: true };
    } catch (error) {
      console.error('Pull changes error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  private async pushChanges(): Promise<{ success: boolean; conflicts?: SyncConflict[]; error?: string }> {
    try {
      const serverUrl = this.syncConfigDb.get('server_url');
      const jwtToken = this.syncConfigDb.get('jwt_token');
      const deviceId = this.syncConfigDb.get('device_id');

      if (!serverUrl || !jwtToken || !deviceId) {
        return { success: false, error: 'Missing configuration' };
      }

      const pendingChanges = this.syncLogDb.getPendingChanges();

      if (pendingChanges.length === 0) {
        return { success: true };
      }

      const response = await fetch(`${serverUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          changes: pendingChanges,
          deviceId,
        }),
      });

      if (response.status === 403) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          return this.pushChanges();
        }
        return { success: false, error: 'Authentication expired' };
      }

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Push failed' };
      }

      const data = await response.json();

      // Mark successfully pushed changes as synced
      this.syncLogDb.markAsSynced(pendingChanges);

      return {
        success: true,
        conflicts: data.conflicts,
      };
    } catch (error) {
      console.error('Push changes error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  private async applyRemoteChanges(changes: SyncChange[]): Promise<void> {
    for (const change of changes) {
      try {
        if (change.entity_type === 'note') {
          await this.applyNoteChange(change);
        }
        // Add more entity types as needed (tags, folders, etc.)
      } catch (error) {
        console.error(`Failed to apply change for ${change.entity_id}:`, error);
      }
    }
  }

  private async applyNoteChange(change: SyncChange): Promise<void> {
    const { entity_id, operation, data_json } = change;

    if (operation === 'delete') {
      const note = this.notesDb.getNoteByUUID(entity_id);
      if (note) {
        this.notesDb.deleteNote(note.id);
      }
      return;
    }

    if (operation === 'create' || operation === 'update') {
      if (!data_json) {
        return;
      }

      const existingNote = this.notesDb.getNoteByUUID(entity_id);

      if (existingNote) {
        // Update existing note
        this.notesDb.updateNote(existingNote.id, {
          name: data_json.name,
          folder: data_json.folder,
          orderIndex: data_json.order_index,
          icon: data_json.icon,
          iconColor: data_json.icon_color,
        });

        // Update content file
        if (data_json.content !== undefined) {
          await fs.writeFile(existingNote.path, data_json.content, 'utf-8');
        }
      } else {
        // Create new note
        const newNote = this.notesDb.createNote(
          data_json.name,
          data_json.path,
          data_json.folder
        );

        // Write content to file
        if (data_json.content) {
          await fs.writeFile(data_json.path, data_json.content, 'utf-8');
        }
      }
    }
  }

  // ============== PERIODIC SYNC ==============

  startPeriodicSync(): void {
    if (this.syncInterval) {
      return; // Already running
    }

    console.log('🔄 Starting periodic sync every', this.retryDelay / 1000, 'seconds');

    this.syncInterval = setInterval(() => {
      this.manualSync();
    }, this.retryDelay);
  }

  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      console.log('⏸️  Stopped periodic sync');
    }
  }

  // ============== STATUS ==============

  getStatus(): SyncStatus {
    return {
      isLoggedIn: this.syncConfigDb.isLoggedIn(),
      isSyncing: this.isSyncing,
      lastSync: parseInt(this.syncConfigDb.get('last_sync_timestamp') || '0') || undefined,
      pendingChanges: this.syncLogDb.countPending(),
    };
  }

  getConfig(): { serverUrl?: string; userEmail?: string } {
    const serverUrl = this.syncConfigDb.get('server_url') || undefined;
    const userEmail = this.syncConfigDb.get('user_email') || undefined;
    console.log('[SyncService] getConfig() - serverUrl:', serverUrl, 'userEmail:', userEmail);
    return {
      serverUrl,
      userEmail,
    };
  }

  // ============== CLEANUP ==============

  dispose(): void {
    this.stopPeriodicSync();
  }
}
