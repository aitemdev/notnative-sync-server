import Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

export interface SyncConfig {
  user_id?: string;
  device_id?: string;
  jwt_token?: string;
  refresh_token?: string;
  server_url?: string;
  last_sync_timestamp?: number;
}

export interface SyncChange {
  entity_type: string;
  entity_id: string;
  operation: 'create' | 'update' | 'delete';
  data_json?: any;
  timestamp: number;
}

export interface SyncConflict {
  entity_type: string;
  entity_id: string;
  localTimestamp: number;
  remoteTimestamp: number;
  localData?: any;
  remoteData?: any;
}

export interface SyncStatus {
  isLoggedIn: boolean;
  isSyncing: boolean;
  lastSync?: number;
  pendingChanges: number;
  error?: string;
}

export class SyncConfigDatabase {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  get(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM sync_config WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  set(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO sync_config (key, value) 
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM sync_config WHERE key = ?').run(key);
  }

  getAll(): SyncConfig {
    const rows = this.db.prepare('SELECT key, value FROM sync_config').all() as { key: string; value: string }[];
    
    const config: SyncConfig = {};
    for (const row of rows) {
      (config as any)[row.key] = row.value;
    }
    
    return config;
  }

  isLoggedIn(): boolean {
    return !!this.get('user_id') && !!this.get('jwt_token');
  }
}

export class SyncLogDatabase {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  addChange(change: SyncChange, userId?: string, deviceId?: string): void {
    this.db.prepare(`
      INSERT INTO sync_log (entity_type, entity_id, operation, data_json, timestamp, synced, user_id, device_id)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      change.entity_type,
      change.entity_id,
      change.operation,
      change.data_json ? JSON.stringify(change.data_json) : null,
      change.timestamp,
      userId || null,
      deviceId || null
    );
  }

  getPendingChanges(limit: number = 1000): SyncChange[] {
    const rows = this.db.prepare(`
      SELECT entity_type, entity_id, operation, data_json, timestamp
      FROM sync_log
      WHERE synced = 0
      ORDER BY timestamp ASC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      operation: row.operation,
      data_json: row.data_json ? JSON.parse(row.data_json) : undefined,
      timestamp: row.timestamp,
    }));
  }

  markAsSynced(changes: SyncChange[]): void {
    const stmt = this.db.prepare(`
      UPDATE sync_log 
      SET synced = 1 
      WHERE entity_type = ? AND entity_id = ? AND timestamp = ?
    `);

    const transaction = this.db.transaction(() => {
      for (const change of changes) {
        stmt.run(change.entity_type, change.entity_id, change.timestamp);
      }
    });

    transaction();
  }

  countPending(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM sync_log WHERE synced = 0').get() as { count: number };
    return row.count;
  }

  clear(): void {
    this.db.prepare('DELETE FROM sync_log WHERE synced = 1').run();
  }
}
