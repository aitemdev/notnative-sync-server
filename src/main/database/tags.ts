import Database from 'better-sqlite3';
import { dateToSqliteTimestamp, sqliteTimestampToDate } from './connection';
import type { Tag } from '../../shared/types';

export class TagsDatabase {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ============== CREATE ==============
  
  createTag(name: string, color: string | null = null): Tag {
    const stmt = this.db.prepare(`
      INSERT INTO tags (name, color, usage_count)
      VALUES (?, ?, 0)
    `);
    
    const result = stmt.run(name, color);
    
    return {
      id: result.lastInsertRowid as number,
      name,
      color,
      usageCount: 0,
    };
  }

  getOrCreateTag(name: string): Tag {
    const existing = this.getTagByName(name);
    if (existing) return existing;
    return this.createTag(name);
  }

  // ============== READ ==============
  
  getTagById(id: number): Tag | null {
    const row = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined;
    return row ? this.rowToTag(row) : null;
  }

  getTagByName(name: string): Tag | null {
    const row = this.db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as TagRow | undefined;
    return row ? this.rowToTag(row) : null;
  }

  listTags(): Tag[] {
    const rows = this.db.prepare('SELECT * FROM tags ORDER BY usage_count DESC, name').all() as TagRow[];
    return rows.map(row => this.rowToTag(row));
  }

  getTagsForNote(noteId: number): Tag[] {
    const rows = this.db.prepare(`
      SELECT t.* FROM tags t
      JOIN note_tags nt ON t.id = nt.tag_id
      WHERE nt.note_id = ?
      ORDER BY t.name
    `).all(noteId) as TagRow[];
    
    return rows.map(row => this.rowToTag(row));
  }

  // ============== UPDATE ==============
  
  updateTag(id: number, updates: Partial<Pick<Tag, 'name' | 'color'>>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.color !== undefined) {
      fields.push('color = ?');
      values.push(updates.color);
    }
    
    if (fields.length === 0) return;
    
    values.push(id);
    
    this.db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  incrementUsageCount(tagId: number): void {
    this.db.prepare('UPDATE tags SET usage_count = usage_count + 1 WHERE id = ?').run(tagId);
  }

  decrementUsageCount(tagId: number): void {
    this.db.prepare('UPDATE tags SET usage_count = MAX(0, usage_count - 1) WHERE id = ?').run(tagId);
  }

  // ============== DELETE ==============
  
  deleteTag(id: number): void {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }

  deleteUnusedTags(): number {
    const result = this.db.prepare('DELETE FROM tags WHERE usage_count = 0').run();
    return result.changes;
  }

  // ============== STATS ==============

  getTagsCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM tags').get() as { count: number };
    return row.count;
  }

  // ============== NOTE-TAG RELATIONS ==============
  
  addTagToNote(noteId: number, tagId: number): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)
    `).run(noteId, tagId);
    
    this.incrementUsageCount(tagId);
  }

  removeTagFromNote(noteId: number, tagId: number): void {
    const result = this.db.prepare(`
      DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?
    `).run(noteId, tagId);
    
    if (result.changes > 0) {
      this.decrementUsageCount(tagId);
    }
  }

  removeAllTagsFromNote(noteId: number): void {
    // Get tags before removing to decrement counts
    const tags = this.getTagsForNote(noteId);
    
    this.db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);
    
    // Decrement usage counts
    for (const tag of tags) {
      this.decrementUsageCount(tag.id);
    }
  }

  syncNoteTags(noteId: number, tagNames: string[]): void {
    // Get current tags
    const currentTags = this.getTagsForNote(noteId);
    const currentTagNames = new Set(currentTags.map(t => t.name));
    const newTagNames = new Set(tagNames);
    
    // Tags to remove
    for (const tag of currentTags) {
      if (!newTagNames.has(tag.name)) {
        this.removeTagFromNote(noteId, tag.id);
      }
    }
    
    // Tags to add
    for (const tagName of tagNames) {
      if (!currentTagNames.has(tagName)) {
        const tag = this.getOrCreateTag(tagName);
        this.addTagToNote(noteId, tag.id);
      }
    }
  }

  getNotesWithTag(tagId: number): number[] {
    const rows = this.db.prepare(`
      SELECT note_id FROM note_tags WHERE tag_id = ?
    `).all(tagId) as { note_id: number }[];
    
    return rows.map(row => row.note_id);
  }

  // ============== HELPERS ==============
  
  private rowToTag(row: TagRow): Tag {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      usageCount: row.usage_count,
    };
  }
}

interface TagRow {
  id: number;
  name: string;
  color: string | null;
  usage_count: number;
}
