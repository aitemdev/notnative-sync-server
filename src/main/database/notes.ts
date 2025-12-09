import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { dateToSqliteTimestamp, sqliteTimestampToDate } from './connection';
import type { NoteMetadata, Note, NoteSearchResult } from '../../shared/types';
import type { AttachmentsDatabase } from './attachments';
import type { LinksDatabase } from './links';

export class NotesDatabase {
  private db: Database.Database;
  private attachmentsDb?: AttachmentsDatabase;
  private linksDb?: LinksDatabase;

  constructor(db: Database.Database) {
    this.db = db;
  }

  setAttachmentsDatabase(attachmentsDb: AttachmentsDatabase): void {
    this.attachmentsDb = attachmentsDb;
  }

  setLinksDatabase(linksDb: LinksDatabase): void {
    this.linksDb = linksDb;
  }

  // ============== CREATE ==============
  
  createNote(name: string, path: string, folder: string | null = null): NoteMetadata {
    const now = dateToSqliteTimestamp(new Date());
    const uuid = randomUUID();
    
    const stmt = this.db.prepare(`
      INSERT INTO notes (name, path, folder, uuid, order_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `);
    
    const result = stmt.run(name, path, folder, uuid, now, now);
    
    return {
      id: result.lastInsertRowid as number,
      uuid,
      name,
      path,
      folder,
      orderIndex: 0,
      icon: null,
      iconColor: null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  // ============== READ ==============
  
  getNoteById(id: number): NoteMetadata | null {
    const row = this.db.prepare(`
      SELECT * FROM notes WHERE id = ?
    `).get(id) as NoteRow | undefined;
    
    return row ? this.rowToMetadata(row) : null;
  }

  getNoteByName(name: string): NoteMetadata | null {
    // First try exact name match
    let row = this.db.prepare(`
      SELECT * FROM notes WHERE name = ?
    `).get(name) as NoteRow | undefined;
    
    if (row) return this.rowToMetadata(row);
    
    // If name contains '/', try to match folder/name
    if (name.includes('/')) {
      const lastSlash = name.lastIndexOf('/');
      const folder = name.substring(0, lastSlash);
      const noteName = name.substring(lastSlash + 1);
      
      row = this.db.prepare(`
        SELECT * FROM notes WHERE name = ? AND folder = ?
      `).get(noteName, folder) as NoteRow | undefined;
      
      if (row) return this.rowToMetadata(row);
    }
    
    // Try case-insensitive match on name only
    row = this.db.prepare(`
      SELECT * FROM notes WHERE LOWER(name) = LOWER(?)
    `).get(name) as NoteRow | undefined;
    
    return row ? this.rowToMetadata(row) : null;
  }

  getNoteByPath(path: string): NoteMetadata | null {
    const row = this.db.prepare(`
      SELECT * FROM notes WHERE path = ?
    `).get(path) as NoteRow | undefined;
    
    return row ? this.rowToMetadata(row) : null;
  }

  listNotes(folder?: string): NoteMetadata[] {
    let rows: NoteRow[];
    
    if (folder === undefined) {
      rows = this.db.prepare(`
        SELECT * FROM notes ORDER BY order_index, name
      `).all() as NoteRow[];
    } else if (folder === null || folder === '') {
      rows = this.db.prepare(`
        SELECT * FROM notes WHERE folder IS NULL OR folder = '' ORDER BY order_index, name
      `).all() as NoteRow[];
    } else {
      rows = this.db.prepare(`
        SELECT * FROM notes WHERE folder = ? ORDER BY order_index, name
      `).all(folder) as NoteRow[];
    }
    
    return rows.map(row => this.rowToMetadata(row));
  }

  listNotesInFolderRecursive(folder: string): NoteMetadata[] {
    const rows = this.db.prepare(`
      SELECT * FROM notes 
      WHERE folder = ? OR folder LIKE ?
      ORDER BY folder, order_index, name
    `).all(folder, `${folder}/%`) as NoteRow[];
    
    return rows.map(row => this.rowToMetadata(row));
  }

  // ============== UPDATE ==============
  
  updateNote(id: number, updates: Partial<Pick<NoteMetadata, 'name' | 'path' | 'folder' | 'orderIndex' | 'icon' | 'iconColor'>>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.path !== undefined) {
      fields.push('path = ?');
      values.push(updates.path);
    }
    if (updates.folder !== undefined) {
      fields.push('folder = ?');
      values.push(updates.folder);
    }
    if (updates.orderIndex !== undefined) {
      fields.push('order_index = ?');
      values.push(updates.orderIndex);
    }
    if (updates.icon !== undefined) {
      fields.push('icon = ?');
      values.push(updates.icon);
    }
    if (updates.iconColor !== undefined) {
      fields.push('icon_color = ?');
      values.push(updates.iconColor);
    }
    
    if (fields.length === 0) return;
    
    fields.push('updated_at = ?');
    values.push(dateToSqliteTimestamp(new Date()));
    values.push(id);
    
    this.db.prepare(`
      UPDATE notes SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }

  touchNote(id: number): void {
    this.db.prepare(`
      UPDATE notes SET updated_at = ? WHERE id = ?
    `).run(dateToSqliteTimestamp(new Date()), id);
  }

  // ============== DELETE ==============
  
  deleteNote(id: number): void {
    // Get note info first to access path
    const note = this.getNoteById(id);
    
    if (note && this.attachmentsDb) {
      // Delete attachment records from database
      this.attachmentsDb.deleteAttachmentsByNote(note.path);
      
      // Delete physical .assets folder
      const noteName = path.basename(note.path, '.md');
      const noteDir = path.dirname(note.path);
      const assetsDir = path.join(noteDir, `${noteName}.assets`);
      
      if (fs.existsSync(assetsDir)) {
        fs.rmSync(assetsDir, { recursive: true, force: true });
      }
    }
    
    // Delete note from database
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  }

  deleteNoteByPath(path: string): void {
    // Get note by path first
    const note = this.getNoteByPath(path);
    if (note) {
      this.deleteNote(note.id);
    } else {
      // Fallback if note not found
      this.db.prepare('DELETE FROM notes WHERE path = ?').run(path);
    }
  }

  // ============== STATS ==============
  
  getNotesCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM notes').get() as { count: number };
    return row.count;
  }

  getFoldersCount(): number {
    const row = this.db.prepare('SELECT COUNT(DISTINCT folder) as count FROM notes WHERE folder IS NOT NULL AND folder != ""').get() as { count: number };
    return row.count;
  }

  getFolders(): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT folder FROM notes 
      WHERE folder IS NOT NULL AND folder != ''
      ORDER BY folder
    `).all() as { folder: string }[];
    return rows.map(r => r.folder);
  }

  // ============== SEARCH ==============
  
  searchNotes(query: string): NoteSearchResult[] {
    // Escape special FTS characters and add prefix matching
    const sanitized = query.replace(/['"]/g, '').trim();
    if (!sanitized) return [];
    
    // Add * for prefix matching
    const ftsQuery = sanitized.split(/\s+/).map(term => `${term}*`).join(' ');
    
    const rows = this.db.prepare(`
      SELECT 
        n.id as noteId,
        n.name as noteName,
        n.path as notePath,
        snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
        bm25(notes_fts) as relevance
      FROM notes_fts
      JOIN notes n ON notes_fts.rowid = n.id
      WHERE notes_fts MATCH ?
      ORDER BY relevance
      LIMIT 50
    `).all(ftsQuery) as NoteSearchResult[];
    
    return rows;
  }

  // ============== FTS ==============
  
  indexNoteContent(noteId: number, name: string, content: string): void {
    // First, delete existing FTS entry
    this.db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(noteId);
    
    // Insert new entry
    this.db.prepare(`
      INSERT INTO notes_fts (rowid, name, content) VALUES (?, ?, ?)
    `).run(noteId, name, content);

    // Update links if LinksDatabase is available
    if (this.linksDb) {
      try {
        this.linksDb.updateLinksForNote(noteId, content);
      } catch (error) {
        console.error('Error updating links for note:', error);
      }
    }
  }

  removeNoteFromFTS(noteId: number): void {
    this.db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(noteId);
  }

  // Get all notes that need to be indexed (for reindexing)
  getAllNotesForReindex(): { id: number; name: string; path: string }[] {
    return this.db.prepare(`
      SELECT id, name, path FROM notes
    `).all() as { id: number; name: string; path: string }[];
  }

  // Check if FTS index is populated
  getFTSCount(): number {
    const result = this.db.prepare(`SELECT COUNT(*) as count FROM notes_fts`).get() as { count: number };
    return result.count;
  }

  // ============== FILE OPERATIONS ==============

  /**
   * Read note content from file synchronously
   */
  readNoteContentSync(notePath: string): string | null {
    try {
      if (!fs.existsSync(notePath)) {
        return null;
      }
      return fs.readFileSync(notePath, 'utf-8');
    } catch (error) {
      console.error('Error reading note file:', error);
      return null;
    }
  }

  /**
   * Read note content from file asynchronously
   */
  async readNoteContent(notePath: string): Promise<string | null> {
    try {
      if (!fs.existsSync(notePath)) {
        return null;
      }
      return await fs.promises.readFile(notePath, 'utf-8');
    } catch (error) {
      console.error('Error reading note file:', error);
      return null;
    }
  }

  // ============== HELPERS ==============
  
  private rowToMetadata(row: NoteRow): NoteMetadata {
    return {
      id: row.id,
      uuid: row.uuid,
      name: row.name,
      path: row.path,
      folder: row.folder,
      orderIndex: row.order_index,
      icon: row.icon,
      iconColor: row.icon_color,
      createdAt: sqliteTimestampToDate(row.created_at),
      updatedAt: sqliteTimestampToDate(row.updated_at),
    };
  }
  
  // ============== SYNC UTILITIES ==============
  
  /**
   * Migrate existing notes to have UUIDs
   * Run this once after upgrading to v13
   */
  migrateNotesToUUIDs(): number {
    const notesWithoutUuid = this.db.prepare(`
      SELECT id FROM notes WHERE uuid IS NULL
    `).all() as { id: number }[];
    
    const updateStmt = this.db.prepare(`
      UPDATE notes SET uuid = ? WHERE id = ?
    `);
    
    let migratedCount = 0;
    
    for (const note of notesWithoutUuid) {
      const uuid = randomUUID();
      updateStmt.run(uuid, note.id);
      migratedCount++;
    }
    
    return migratedCount;
  }
  
  /**
   * Get note by UUID (for sync operations)
   */
  getNoteByUUID(uuid: string): NoteMetadata | null {
    const row = this.db.prepare(`
      SELECT * FROM notes WHERE uuid = ?
    `).get(uuid) as NoteRow | undefined;
    
    return row ? this.rowToMetadata(row) : null;
  }
}

// Raw database row type
interface NoteRow {
  id: number;
  uuid: string | null;
  name: string;
  path: string;
  folder: string | null;
  order_index: number;
  icon: string | null;
  icon_color: string | null;
  created_at: number;
  updated_at: number;
}
