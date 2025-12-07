import Database from 'better-sqlite3';
import { dateToSqliteTimestamp, sqliteTimestampToDate } from './connection';
import type { InlineProperty, PropertyType } from '../../shared/types';

export class InlinePropertiesDatabase {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ============== CREATE ==============
  
  createProperty(property: Omit<InlineProperty, 'id'>): InlineProperty {
    const now = dateToSqliteTimestamp(new Date());
    
    const stmt = this.db.prepare(`
      INSERT INTO inline_properties (
        note_id, property_key, property_type,
        value_text, value_number, value_bool,
        line_number, char_start, char_end,
        linked_note_id, group_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      property.noteId,
      property.key,
      property.propertyType,
      property.valueText,
      property.valueNumber,
      property.valueBool === null ? null : property.valueBool ? 1 : 0,
      property.lineNumber,
      property.charStart,
      property.charEnd,
      property.linkedNoteId,
      property.groupId,
      now,
      now
    );
    
    return {
      ...property,
      id: result.lastInsertRowid as number,
    };
  }

  // ============== READ ==============
  
  getPropertiesForNote(noteId: number): InlineProperty[] {
    const rows = this.db.prepare(`
      SELECT * FROM inline_properties 
      WHERE note_id = ?
      ORDER BY line_number, char_start
    `).all(noteId) as PropertyRow[];
    
    return rows.map(row => this.rowToProperty(row));
  }

  getPropertiesByKey(key: string): InlineProperty[] {
    const rows = this.db.prepare(`
      SELECT * FROM inline_properties 
      WHERE property_key = ?
      ORDER BY note_id, line_number
    `).all(key) as PropertyRow[];
    
    return rows.map(row => this.rowToProperty(row));
  }

  getPropertyGroups(noteId: number): Map<number, InlineProperty[]> {
    const properties = this.getPropertiesForNote(noteId);
    const groups = new Map<number, InlineProperty[]>();
    
    for (const prop of properties) {
      if (prop.groupId !== null) {
        const group = groups.get(prop.groupId) || [];
        group.push(prop);
        groups.set(prop.groupId, group);
      }
    }
    
    return groups;
  }

  getDistinctKeys(): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT property_key FROM inline_properties ORDER BY property_key
    `).all() as { property_key: string }[];
    
    return rows.map(row => row.property_key);
  }

  getDistinctValuesForKey(key: string): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT value_text FROM inline_properties 
      WHERE property_key = ? AND value_text IS NOT NULL
      ORDER BY value_text
    `).all(key) as { value_text: string }[];
    
    return rows.map(row => row.value_text);
  }

  // ============== UPDATE ==============
  
  updateProperty(id: number, updates: Partial<InlineProperty>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    
    if (updates.valueText !== undefined) {
      fields.push('value_text = ?');
      values.push(updates.valueText);
    }
    if (updates.valueNumber !== undefined) {
      fields.push('value_number = ?');
      values.push(updates.valueNumber);
    }
    if (updates.valueBool !== undefined) {
      fields.push('value_bool = ?');
      values.push(updates.valueBool === null ? null : updates.valueBool ? 1 : 0);
    }
    if (updates.lineNumber !== undefined) {
      fields.push('line_number = ?');
      values.push(updates.lineNumber);
    }
    if (updates.charStart !== undefined) {
      fields.push('char_start = ?');
      values.push(updates.charStart);
    }
    if (updates.charEnd !== undefined) {
      fields.push('char_end = ?');
      values.push(updates.charEnd);
    }
    
    if (fields.length === 0) return;
    
    fields.push('updated_at = ?');
    values.push(dateToSqliteTimestamp(new Date()));
    values.push(id);
    
    this.db.prepare(`
      UPDATE inline_properties SET ${fields.join(', ')} WHERE id = ?
    `).run(...values);
  }

  // ============== DELETE ==============
  
  deleteProperty(id: number): void {
    this.db.prepare('DELETE FROM inline_properties WHERE id = ?').run(id);
  }

  deletePropertiesForNote(noteId: number): void {
    this.db.prepare('DELETE FROM inline_properties WHERE note_id = ?').run(noteId);
  }

  // ============== SYNC ==============
  
  syncNoteProperties(noteId: number, properties: Omit<InlineProperty, 'id' | 'noteId'>[]): void {
    // Delete existing properties
    this.deletePropertiesForNote(noteId);
    
    // Insert new properties
    for (const prop of properties) {
      this.createProperty({
        ...prop,
        noteId,
      });
    }
  }

  // ============== QUERY ==============
  
  findNotesWithProperty(key: string, value?: string): number[] {
    let rows: { note_id: number }[];
    
    if (value !== undefined) {
      rows = this.db.prepare(`
        SELECT DISTINCT note_id FROM inline_properties 
        WHERE property_key = ? AND value_text = ?
      `).all(key, value) as { note_id: number }[];
    } else {
      rows = this.db.prepare(`
        SELECT DISTINCT note_id FROM inline_properties 
        WHERE property_key = ?
      `).all(key) as { note_id: number }[];
    }
    
    return rows.map(row => row.note_id);
  }

  findNotesWithPropertyRange(key: string, min?: number, max?: number): number[] {
    let sql = 'SELECT DISTINCT note_id FROM inline_properties WHERE property_key = ?';
    const params: unknown[] = [key];
    
    if (min !== undefined) {
      sql += ' AND value_number >= ?';
      params.push(min);
    }
    if (max !== undefined) {
      sql += ' AND value_number <= ?';
      params.push(max);
    }
    
    const rows = this.db.prepare(sql).all(...params) as { note_id: number }[];
    return rows.map(row => row.note_id);
  }

  // ============== HELPERS ==============
  
  private rowToProperty(row: PropertyRow): InlineProperty {
    return {
      id: row.id,
      noteId: row.note_id,
      key: row.property_key,
      propertyType: row.property_type as PropertyType,
      valueText: row.value_text,
      valueNumber: row.value_number,
      valueBool: row.value_bool === null ? null : row.value_bool === 1,
      lineNumber: row.line_number,
      charStart: row.char_start,
      charEnd: row.char_end,
      linkedNoteId: row.linked_note_id,
      groupId: row.group_id,
    };
  }
}

interface PropertyRow {
  id: number;
  note_id: number;
  property_key: string;
  property_type: string;
  value_text: string | null;
  value_number: number | null;
  value_bool: number | null;
  line_number: number;
  char_start: number;
  char_end: number;
  linked_note_id: number | null;
  group_id: number | null;
  created_at: number;
  updated_at: number;
}
