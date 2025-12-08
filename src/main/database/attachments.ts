import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { dateToSqliteTimestamp, sqliteTimestampToDate } from './connection';
import type { NoteAttachment } from '../../shared/types';

interface AttachmentRow {
  id: number;
  note_path: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  created_at: number;
}

export class AttachmentsDatabase {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ============== CREATE ==============

  addAttachment(
    notePath: string,
    fileName: string,
    filePath: string,
    fileSize: number,
    mimeType: string | null = null
  ): NoteAttachment {
    const now = dateToSqliteTimestamp(new Date());

    const stmt = this.db.prepare(`
      INSERT INTO note_attachments (note_path, file_name, file_path, file_size, mime_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(notePath, fileName, filePath, fileSize, mimeType, now);

    return {
      id: result.lastInsertRowid as number,
      notePath,
      fileName,
      filePath,
      fileSize,
      mimeType,
      createdAt: new Date(now),
    };
  }

  // ============== READ ==============

  getAttachmentsByNote(notePath: string): NoteAttachment[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM note_attachments
        WHERE note_path = ?
        ORDER BY created_at DESC
      `)
      .all(notePath) as AttachmentRow[];

    return rows.map((row) => this.rowToAttachment(row));
  }

  getAttachmentByPath(filePath: string): NoteAttachment | null {
    const row = this.db
      .prepare(`
        SELECT * FROM note_attachments
        WHERE file_path = ?
      `)
      .get(filePath) as AttachmentRow | undefined;

    return row ? this.rowToAttachment(row) : null;
  }

  searchAttachmentsByName(query: string, limit: number = 50): NoteAttachment[] {
    const searchPattern = `%${query}%`;
    
    const rows = this.db
      .prepare(`
        SELECT * FROM note_attachments
        WHERE file_name LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `)
      .all(searchPattern, limit) as AttachmentRow[];

    return rows.map((row) => this.rowToAttachment(row));
  }

  getAllAttachments(): NoteAttachment[] {
    const rows = this.db
      .prepare(`
        SELECT * FROM note_attachments
        ORDER BY created_at DESC
      `)
      .all() as AttachmentRow[];

    return rows.map((row) => this.rowToAttachment(row));
  }

  // ============== DELETE ==============

  deleteAttachment(id: number): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM note_attachments WHERE id = ?
    `);

    const result = stmt.run(id);
    return result.changes > 0;
  }

  deleteAttachmentsByNote(notePath: string): number {
    const stmt = this.db.prepare(`
      DELETE FROM note_attachments WHERE note_path = ?
    `);

    const result = stmt.run(notePath);
    return result.changes;
  }

  deleteAttachmentByPath(filePath: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM note_attachments WHERE file_path = ?
    `);

    const result = stmt.run(filePath);
    return result.changes > 0;
  }

  // ============== STATS ==============

  getStats(): {
    totalAttachments: number;
    totalSize: number;
    orphanedAttachments: NoteAttachment[];
  } {
    // Total attachments and size
    const stats = this.db
      .prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as size
        FROM note_attachments
      `)
      .get() as { count: number; size: number };

    // Find orphaned attachments (files that don't exist)
    const allAttachments = this.getAllAttachments();
    const orphanedAttachments = allAttachments.filter((attachment) => {
      return !fs.existsSync(attachment.filePath);
    });

    return {
      totalAttachments: stats.count,
      totalSize: stats.size,
      orphanedAttachments,
    };
  }

  cleanOrphanedAttachments(): number {
    const { orphanedAttachments } = this.getStats();
    let cleaned = 0;

    for (const attachment of orphanedAttachments) {
      if (this.deleteAttachment(attachment.id)) {
        cleaned++;
      }
    }

    return cleaned;
  }

  // ============== SCAN & SYNC ==============

  /**
   * Scan all .assets folders and sync with database
   * This is useful for initial population or after manual file operations
   */
  scanAndSyncAttachments(notesDirectory: string): {
    added: number;
    removed: number;
  } {
    let added = 0;
    let removed = 0;

    // Get all attachments from database
    const existingAttachments = this.getAllAttachments();
    const existingPaths = new Set(existingAttachments.map((a) => a.filePath));

    // Scan filesystem
    const scannedPaths = new Set<string>();

    const scanDirectory = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Check if this is a .assets folder
          if (entry.name.endsWith('.assets')) {
            const noteName = entry.name.slice(0, -7); // Remove '.assets'
            const notePath = path.join(path.dirname(fullPath), `${noteName}.md`);

            // Scan files in .assets folder
            if (fs.existsSync(fullPath)) {
              const assetFiles = fs.readdirSync(fullPath);
              
              for (const fileName of assetFiles) {
                const filePath = path.join(fullPath, fileName);
                const stats = fs.statSync(filePath);

                if (stats.isFile()) {
                  scannedPaths.add(filePath);

                  // Add to database if not exists
                  if (!existingPaths.has(filePath)) {
                    const mimeType = this.getMimeTypeFromExtension(fileName);
                    this.addAttachment(notePath, fileName, filePath, stats.size, mimeType);
                    added++;
                  }
                }
              }
            }
          } else {
            // Recursively scan subdirectories
            scanDirectory(fullPath);
          }
        }
      }
    };

    scanDirectory(notesDirectory);

    // Remove attachments from database that no longer exist in filesystem
    for (const attachment of existingAttachments) {
      if (!scannedPaths.has(attachment.filePath)) {
        this.deleteAttachment(attachment.id);
        removed++;
      }
    }

    return { added, removed };
  }

  // ============== HELPERS ==============

  private rowToAttachment(row: AttachmentRow): NoteAttachment {
    return {
      id: row.id,
      notePath: row.note_path,
      fileName: row.file_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      createdAt: sqliteTimestampToDate(row.created_at),
    };
  }

  private getMimeTypeFromExtension(fileName: string): string | null {
    const ext = path.extname(fileName).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      // Documents
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      // Archives
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      // Text
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.csv': 'text/csv',
      // Video
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      // Audio
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
    };

    return mimeTypes[ext] || null;
  }
}
