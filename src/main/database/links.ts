import Database from 'better-sqlite3';
import { dateToSqliteTimestamp, sqliteTimestampToDate } from './connection';
import type { NotesDatabase } from './notes';

export interface NoteLink {
  id: number;
  sourceNoteId: number;
  targetNoteId: number;
  linkType: string;
  createdAt: Date;
}

export interface NoteLinkWithMetadata extends NoteLink {
  targetName: string;
  targetFolder: string | null;
  targetPath: string;
}

export interface BacklinkInfo {
  noteId: number;
  noteName: string;
  noteFolder: string | null;
  notePath: string;
  context: string;
  lineNumber: number;
}

interface NoteLinkRow {
  id: number;
  source_note_id: number;
  target_note_id: number;
  link_type: string;
  created_at: number;
}

interface NoteLinkWithMetadataRow extends NoteLinkRow {
  target_name: string;
  target_folder: string | null;
  target_path: string;
}

interface BacklinkInfoRow {
  note_id: number;
  note_name: string;
  note_folder: string | null;
  note_path: string;
}

export class LinksDatabase {
  private db: Database.Database;
  private notesDb: NotesDatabase;

  constructor(db: Database.Database, notesDb: NotesDatabase) {
    this.db = db;
    this.notesDb = notesDb;
  }

  // ============== WIKILINK EXTRACTION ==============

  /**
   * Extract wikilinks from markdown content
   * Supports: [[nota]], [[carpeta/nota]], [[nota|texto alternativo]]
   */
  extractWikilinks(content: string): string[] {
    // Regex: captura [[contenido]] pero no ![[contenido]] (que son embeds)
    const regex = /(?<!!)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    const links: string[] = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      const linkTarget = match[1].trim();
      if (linkTarget) {
        links.push(linkTarget);
      }
    }

    // Return unique links
    return [...new Set(links)];
  }

  /**
   * Extract context (line content) for a wikilink at a specific position
   */
  private extractContext(content: string, linkTarget: string): { context: string; lineNumber: number } {
    const lines = content.split('\n');
    const escapedTarget = linkTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkRegex = new RegExp(`\\[\\[${escapedTarget}(?:\\|[^\\]]+)?\\]\\]`);

    for (let i = 0; i < lines.length; i++) {
      if (linkRegex.test(lines[i])) {
        return {
          context: lines[i].trim(),
          lineNumber: i + 1,
        };
      }
    }

    return {
      context: '',
      lineNumber: 0,
    };
  }

  // ============== CRUD OPERATIONS ==============

  /**
   * Update all links for a note
   * Removes old links and creates new ones based on content
   */
  updateLinksForNote(noteId: number, content: string): void {
    // Extract wikilinks from content
    const linkTargets = this.extractWikilinks(content);

    // Delete existing links from this note
    this.deleteLinksForNote(noteId);

    // Create new links
    const now = dateToSqliteTimestamp(new Date());
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO note_links (source_note_id, target_note_id, link_type, created_at)
      VALUES (?, ?, 'wikilink', ?)
    `);

    for (const target of linkTargets) {
      // Resolve target name to note ID
      const targetNote = this.notesDb.getNoteByName(target);
      if (targetNote) {
        stmt.run(noteId, targetNote.id, now);
      }
    }
  }

  /**
   * Delete all links from a note
   */
  deleteLinksForNote(noteId: number): void {
    this.db.prepare('DELETE FROM note_links WHERE source_note_id = ?').run(noteId);
  }

  /**
   * Delete all links to a note
   */
  deleteLinksToNote(noteId: number): void {
    this.db.prepare('DELETE FROM note_links WHERE target_note_id = ?').run(noteId);
  }

  /**
   * Update links when a note is renamed
   * This is called when a note name changes to update references
   */
  async updateLinksAfterRename(oldName: string, newName: string): Promise<void> {
    // Get all notes that might reference the old name
    const allNotes = this.notesDb.listNotes();
    
    for (const note of allNotes) {
      try {
        // Read note content
        const noteData = await this.notesDb.readNoteContent(note.path);
        if (!noteData) continue;

        const links = this.extractWikilinks(noteData);
        if (links.includes(oldName)) {
          // Note references the renamed note, update its links
          this.updateLinksForNote(note.id, noteData);
        }
      } catch (error) {
        console.error(`Error updating links for note ${note.name}:`, error);
      }
    }
  }

  // ============== QUERIES ==============

  /**
   * Get all outgoing links from a note (links it contains)
   */
  getOutgoingLinks(noteId: number): NoteLinkWithMetadata[] {
    const rows = this.db.prepare(`
      SELECT 
        nl.id,
        nl.source_note_id,
        nl.target_note_id,
        nl.link_type,
        nl.created_at,
        n.name as target_name,
        n.folder as target_folder,
        n.path as target_path
      FROM note_links nl
      JOIN notes n ON nl.target_note_id = n.id
      WHERE nl.source_note_id = ?
      ORDER BY n.name
    `).all(noteId) as NoteLinkWithMetadataRow[];

    return rows.map(row => ({
      id: row.id,
      sourceNoteId: row.source_note_id,
      targetNoteId: row.target_note_id,
      linkType: row.link_type,
      createdAt: sqliteTimestampToDate(row.created_at),
      targetName: row.target_name,
      targetFolder: row.target_folder,
      targetPath: row.target_path,
    }));
  }

  /**
   * Get all incoming links to a note (backlinks)
   * Includes context snippet where the link appears
   */
  getIncomingLinks(noteId: number): BacklinkInfo[] {
    const rows = this.db.prepare(`
      SELECT 
        n.id as note_id,
        n.name as note_name,
        n.folder as note_folder,
        n.path as note_path
      FROM note_links nl
      JOIN notes n ON nl.source_note_id = n.id
      WHERE nl.target_note_id = ?
      ORDER BY n.name
    `).all(noteId) as BacklinkInfoRow[];

    // Get the target note to know what link target to look for
    const targetNote = this.notesDb.getNoteById(noteId);
    if (!targetNote) return [];

    // For each source note, extract context
    const backlinks: BacklinkInfo[] = [];
    for (const row of rows) {
      try {
        const content = this.notesDb.readNoteContentSync(row.note_path);
        if (!content) continue;

        // Try to find the link context
        // Check for direct name match or folder/name match
        const possibleTargets = [
          targetNote.name,
          targetNote.folder ? `${targetNote.folder}/${targetNote.name}` : null,
        ].filter(Boolean) as string[];

        let contextInfo = { context: '', lineNumber: 0 };
        for (const target of possibleTargets) {
          const found = this.extractContext(content, target);
          if (found.context) {
            contextInfo = found;
            break;
          }
        }

        backlinks.push({
          noteId: row.note_id,
          noteName: row.note_name,
          noteFolder: row.note_folder,
          notePath: row.note_path,
          context: contextInfo.context,
          lineNumber: contextInfo.lineNumber,
        });
      } catch (error) {
        console.error(`Error reading note ${row.note_name} for backlink context:`, error);
        // Still include the backlink without context
        backlinks.push({
          noteId: row.note_id,
          noteName: row.note_name,
          noteFolder: row.note_folder,
          notePath: row.note_path,
          context: '',
          lineNumber: 0,
        });
      }
    }

    return backlinks;
  }

  /**
   * Get all links in the database (for graph view)
   */
  getAllLinks(): NoteLink[] {
    const rows = this.db.prepare(`
      SELECT id, source_note_id, target_note_id, link_type, created_at
      FROM note_links
      ORDER BY created_at DESC
    `).all() as NoteLinkRow[];

    return rows.map(row => ({
      id: row.id,
      sourceNoteId: row.source_note_id,
      targetNoteId: row.target_note_id,
      linkType: row.link_type,
      createdAt: sqliteTimestampToDate(row.created_at),
    }));
  }

  /**
   * Get count of incoming links (backlinks) for a note
   */
  getBacklinksCount(noteId: number): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM note_links
      WHERE target_note_id = ?
    `).get(noteId) as { count: number };

    return row.count;
  }

  /**
   * Get count of outgoing links for a note
   */
  getOutgoingLinksCount(noteId: number): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM note_links
      WHERE source_note_id = ?
    `).get(noteId) as { count: number };

    return row.count;
  }

  /**
   * Check if a link exists between two notes
   */
  linkExists(sourceNoteId: number, targetNoteId: number): boolean {
    const row = this.db.prepare(`
      SELECT 1
      FROM note_links
      WHERE source_note_id = ? AND target_note_id = ?
    `).get(sourceNoteId, targetNoteId);

    return !!row;
  }
}
