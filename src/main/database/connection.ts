import Database from 'better-sqlite3';
import path from 'path';
import { DATABASE_FILENAME } from '../../shared/constants';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;

export async function initDatabase(userDataPath: string): Promise<Database.Database> {
  const dbPath = path.join(userDataPath, DATABASE_FILENAME);
  
  console.log(`📦 Initializing database at: ${dbPath}`);
  
  db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  });

  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  
  // Run migrations
  runMigrations(db);
  
  console.log('✅ Database initialized');
  
  return db;
}

export function getDatabase(): Database.Database | null {
  return db;
}

export function closeDatabase(): void {
  if (db) {
    console.log('📦 Closing database...');
    db.close();
    db = null;
  }
}

// Helper function to convert SQLite timestamps to Date
export function sqliteTimestampToDate(timestamp: number): Date {
  return new Date(timestamp);
}

// Helper function to convert Date to SQLite timestamp
export function dateToSqliteTimestamp(date: Date): number {
  return date.getTime();
}
