import chokidar, { FSWatcher } from 'chokidar';
import { BrowserWindow } from 'electron';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { NotesDirectory } from './notes-directory';
import { NoteFile } from './note-file';
import { NotesDatabase } from '../database/notes';
import { TagsDatabase } from '../database/tags';
import { AttachmentsDatabase } from '../database/attachments';
import { indexNote as indexEmbeddings, deleteEmbeddings } from '../database/embeddings';
import { SyncLogDatabase } from '../sync/sync-db';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import { FILE_WATCH_DEBOUNCE } from '../../shared/constants';

export class NotesWatcher {
  private watcher: FSWatcher | null = null;
  private db: Database.Database;
  private notesDir: NotesDirectory;
  private mainWindow: BrowserWindow;
  private notesDb: NotesDatabase;
  private tagsDb: TagsDatabase;
  private attachmentsDb: AttachmentsDatabase;
  private syncLogDb: SyncLogDatabase;
  
  // Debounce tracking
  private pendingChanges: Map<string, NodeJS.Timeout> = new Map();
  private pendingAttachmentChanges: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    db: Database.Database,
    notesDir: NotesDirectory,
    mainWindow: BrowserWindow
  ) {
    this.db = db;
    this.notesDir = notesDir;
    this.mainWindow = mainWindow;
    this.notesDb = new NotesDatabase(db);
    this.tagsDb = new TagsDatabase(db);
    this.attachmentsDb = new AttachmentsDatabase(db);
    this.syncLogDb = new SyncLogDatabase(db);
    
    // Link attachments database to notes database for cascade deletion
    this.notesDb.setAttachmentsDatabase(this.attachmentsDb);
  }

  /**
   * Start watching the notes directory
   * Performs initial sync then watches for changes
   */
  async start(): Promise<void> {
    if (this.watcher) {
      console.log('⚠️ Watcher already running');
      return;
    }

    console.log(`👁️ Starting file watcher on: ${this.notesDir.root}`);

    // Perform initial sync before starting watch
    await this.initialScan();

    this.watcher = chokidar.watch(this.notesDir.root, {
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles
        /\.trash/,
        /\.history/,
        /node_modules/,
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (filePath: string) => this.handleFileAdd(filePath))
      .on('change', (filePath: string) => this.handleFileChange(filePath))
      .on('unlink', (filePath: string) => this.handleFileUnlink(filePath))
      .on('addDir', (dirPath: string) => this.handleAddDir(dirPath))
      .on('unlinkDir', (dirPath: string) => this.handleUnlinkDir(dirPath))
      .on('error', (error: unknown) => console.error('❌ Watcher error:', error));

    console.log('✅ File watcher started');
  }

  /**
   * Stop the file watcher
   */
  stop(): void {
    if (this.watcher) {
      console.log('👁️ Stopping file watcher...');
      this.watcher.close();
      this.watcher = null;
      
      // Clear pending timeouts
      for (const timeout of this.pendingChanges.values()) {
        clearTimeout(timeout);
      }
      this.pendingChanges.clear();
      
      for (const timeout of this.pendingAttachmentChanges.values()) {
        clearTimeout(timeout);
      }
      this.pendingAttachmentChanges.clear();
      
      console.log('✅ File watcher stopped');
    }
  }

  /**
   * Router for file add events
   */
  private handleFileAdd(filePath: string): void {
    if (this.isAttachmentFile(filePath)) {
      this.debouncedHandleAttachment('add', filePath);
    } else if (this.notesDir.isNoteFile(filePath)) {
      this.debouncedHandle('add', filePath);
    }
  }

  /**
   * Router for file change events
   */
  private handleFileChange(filePath: string): void {
    if (this.isAttachmentFile(filePath)) {
      this.debouncedHandleAttachment('change', filePath);
    } else if (this.notesDir.isNoteFile(filePath)) {
      this.debouncedHandle('change', filePath);
    }
  }

  /**
   * Router for file unlink events
   */
  private handleFileUnlink(filePath: string): void {
    if (this.isAttachmentFile(filePath)) {
      this.debouncedHandleAttachment('unlink', filePath);
    } else if (this.notesDir.isNoteFile(filePath)) {
      this.debouncedHandle('unlink', filePath);
    }
  }

  /**
   * Check if a file is an attachment (inside .assets folder)
   */
  private isAttachmentFile(filePath: string): boolean {
    const parts = filePath.split(path.sep);
    return parts.some(part => part.endsWith('.assets'));
  }

  /**
   * Get note path from attachment file path
   */
  private getNotePathFromAttachment(attachmentPath: string): string | null {
    const parts = attachmentPath.split(path.sep);
    const assetsIndex = parts.findIndex(part => part.endsWith('.assets'));
    
    if (assetsIndex === -1) return null;
    
    const assetsFolderName = parts[assetsIndex];
    const noteName = assetsFolderName.slice(0, -7); // Remove '.assets'
    
    // Reconstruct note path
    const noteParts = [...parts.slice(0, assetsIndex), `${noteName}.md`];
    return noteParts.join(path.sep);
  }

  /**
   * Debounce file changes to avoid rapid repeated indexing
   */
  private debouncedHandle(type: 'add' | 'change' | 'unlink', filePath: string): void {
    // Only handle markdown files
    if (!this.notesDir.isNoteFile(filePath)) return;

    // Clear existing timeout for this file
    const existing = this.pendingChanges.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.pendingChanges.delete(filePath);
      
      switch (type) {
        case 'add':
          this.handleAdd(filePath);
          break;
        case 'change':
          this.handleChange(filePath);
          break;
        case 'unlink':
          this.handleUnlink(filePath);
          break;
      }
    }, FILE_WATCH_DEBOUNCE);

    this.pendingChanges.set(filePath, timeout);
  }

  /**
   * Debounce attachment file changes
   */
  private debouncedHandleAttachment(type: 'add' | 'change' | 'unlink', filePath: string): void {
    // Clear existing timeout for this file
    const existing = this.pendingAttachmentChanges.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timeout (500ms for attachments)
    const timeout = setTimeout(() => {
      this.pendingAttachmentChanges.delete(filePath);
      
      switch (type) {
        case 'add':
          this.handleAttachmentAdd(filePath);
          break;
        case 'change':
          this.handleAttachmentChange(filePath);
          break;
        case 'unlink':
          this.handleAttachmentUnlink(filePath);
          break;
      }
    }, 500); // 500ms debounce for attachments

    this.pendingAttachmentChanges.set(filePath, timeout);
  }

  /**
   * Handle new file added
   */
  private async handleAdd(filePath: string): Promise<void> {
    console.log(`📄 New note detected: ${filePath}`);

    try {
      await this.indexNote(filePath);
      
      // Log to sync_log for synchronization
      const note = this.notesDb.getNoteByPath(filePath);
      if (note && note.uuid) {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        this.syncLogDb.addChange({
          entity_type: 'note',
          entity_id: note.uuid,
          operation: 'create',
          data_json: {
            ...note,
            content,
            created_at: note.createdAt.getTime(),
            updated_at: note.updatedAt.getTime(),
          },
          timestamp: Date.now(),
        });
      }
      
      this.notifyRenderer('add', filePath);
    } catch (error) {
      console.error(`❌ Error indexing new note: ${filePath}`, error);
    }
  }

  /**
   * Handle file changed
   */
  private async handleChange(filePath: string): Promise<void> {
    console.log(`📝 Note changed: ${filePath}`);

    try {
      await this.indexNote(filePath);
      
      // Log to sync_log for synchronization
      const note = this.notesDb.getNoteByPath(filePath);
      if (note && note.uuid) {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        this.syncLogDb.addChange({
          entity_type: 'note',
          entity_id: note.uuid,
          operation: 'update',
          data_json: {
            ...note,
            content,
            created_at: note.createdAt.getTime(),
            updated_at: note.updatedAt.getTime(),
          },
          timestamp: Date.now(),
        });
      }
      
      this.notifyRenderer('change', filePath);
    } catch (error) {
      console.error(`❌ Error re-indexing note: ${filePath}`, error);
    }
  }

  /**
   * Handle file deleted
   */
  private handleUnlink(filePath: string): void {
    console.log(`🗑️ Note deleted: ${filePath}`);

    try {
      // Get note info before deleting for sync log
      const note = this.notesDb.getNoteByPath(filePath);
      
      // Remove from database
      this.notesDb.deleteNoteByPath(filePath);
      
      // Remove embeddings
      deleteEmbeddings(filePath);
      
      // Log to sync_log for synchronization
      if (note && note.uuid) {
        this.syncLogDb.addChange({
          entity_type: 'note',
          entity_id: note.uuid,
          operation: 'delete',
          data_json: {
            uuid: note.uuid,
            path: note.path,
          },
          timestamp: Date.now(),
        });
      }
      
      this.notifyRenderer('unlink', filePath);
    } catch (error) {
      console.error(`❌ Error handling deleted note: ${filePath}`, error);
    }
  }

  /**
   * Handle directory added
   */
  private handleAddDir(dirPath: string): void {
    // Skip hidden directories
    if (this.notesDir.isHiddenPath(this.notesDir.relative(dirPath))) return;

    console.log(`📁 New folder detected: ${dirPath}`);
    this.notifyRenderer('addDir', dirPath);
  }

  /**
   * Handle directory removed
   */
  private handleUnlinkDir(dirPath: string): void {
    console.log(`📁 Folder deleted: ${dirPath}`);
    this.notifyRenderer('unlinkDir', dirPath);
  }

  /**
   * Handle new attachment file added
   */
  private handleAttachmentAdd(filePath: string): void {
    console.log(`📎 New attachment detected: ${filePath}`);

    try {
      const notePath = this.getNotePathFromAttachment(filePath);
      if (!notePath) {
        console.warn(`⚠️ Could not determine note path for attachment: ${filePath}`);
        return;
      }

      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);
      const mimeType = this.getMimeTypeFromExtension(fileName);

      // Check if attachment already exists
      const existing = this.attachmentsDb.getAttachmentByPath(filePath);
      if (!existing) {
        this.attachmentsDb.addAttachment(notePath, fileName, filePath, stats.size, mimeType);
        console.log(`✅ Attachment indexed: ${fileName}`);
      }
    } catch (error) {
      console.error(`❌ Error indexing attachment: ${filePath}`, error);
    }
  }

  /**
   * Handle attachment file changed (e.g., replaced)
   */
  private handleAttachmentChange(filePath: string): void {
    console.log(`📎 Attachment changed: ${filePath}`);

    try {
      const notePath = this.getNotePathFromAttachment(filePath);
      if (!notePath) return;

      // Delete and re-add to update metadata
      this.attachmentsDb.deleteAttachmentByPath(filePath);
      
      const stats = fs.statSync(filePath);
      const fileName = path.basename(filePath);
      const mimeType = this.getMimeTypeFromExtension(fileName);
      
      this.attachmentsDb.addAttachment(notePath, fileName, filePath, stats.size, mimeType);
      console.log(`✅ Attachment updated: ${fileName}`);
    } catch (error) {
      console.error(`❌ Error updating attachment: ${filePath}`, error);
    }
  }

  /**
   * Handle attachment file deleted
   */
  private handleAttachmentUnlink(filePath: string): void {
    console.log(`📎 Attachment deleted: ${filePath}`);

    try {
      this.attachmentsDb.deleteAttachmentByPath(filePath);
      console.log(`✅ Attachment removed from database: ${path.basename(filePath)}`);
    } catch (error) {
      console.error(`❌ Error deleting attachment: ${filePath}`, error);
    }
  }

  /**
   * Get MIME type from file extension
   */
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
      // Archives
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      // Text
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
    };

    return mimeTypes[ext] || null;
  }

  /**
   * Index a note file in the database
   */
  private async indexNote(filePath: string): Promise<void> {
    const noteFile = NoteFile.open(filePath);
    const content = await noteFile.readAsync();
    
    const name = this.notesDir.getNoteNameFromPath(filePath);
    const folder = this.notesDir.getFolderFromPath(filePath);

    // Check if note already exists
    const existing = this.notesDb.getNoteByPath(filePath);

    if (existing) {
      // Update existing note
      this.notesDb.touchNote(existing.id);
      this.notesDb.indexNoteContent(existing.id, name, content);
      
      // Sync tags from content
      const tags = this.extractTags(content);
      this.tagsDb.syncNoteTags(existing.id, tags);
    } else {
      // Create new note
      const metadata = this.notesDb.createNote(name, filePath, folder);
      this.notesDb.indexNoteContent(metadata.id, name, content);
      
      // Sync tags from content
      const tags = this.extractTags(content);
      this.tagsDb.syncNoteTags(metadata.id, tags);
    }
    
    // Index embeddings in background (don't await to avoid blocking)
    this.indexEmbeddingsInBackground(filePath, content);
  }
  
  /**
   * Index embeddings in background without blocking the main thread
   */
  private indexEmbeddingsInBackground(filePath: string, content: string): void {
    // Use setImmediate to run after current event loop
    setImmediate(async () => {
      try {
        await indexEmbeddings(filePath, content);
      } catch (error) {
        // Log but don't fail - embeddings are supplementary
        console.warn(`⚠️ Failed to index embeddings for ${filePath}:`, error);
      }
    });
  }

  /**
   * Extract tags from note content (frontmatter + inline #tags)
   */
  private extractTags(content: string): string[] {
    const tags = new Set<string>();

    // Extract from frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const tagsMatch = frontmatter.match(/tags:\s*\[(.*?)\]/);
      if (tagsMatch) {
        const tagsStr = tagsMatch[1];
        const frontmatterTags = tagsStr.split(',').map(t => t.trim().replace(/['"]/g, ''));
        frontmatterTags.forEach(tag => {
          if (tag) tags.add(tag);
        });
      }
    }

    // Extract inline #tags
    const tagRegex = /(?:^|[\s\(\[,])#([a-zA-Z][a-zA-Z0-9_-]*)/g;
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
      tags.add(match[1]);
    }

    return Array.from(tags);
  }

  /**
   * Notify the renderer process about file changes
   */
  private notifyRenderer(type: string, filePath: string): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const relativePath = this.notesDir.relative(filePath);
      this.mainWindow.webContents.send(IPC_CHANNELS['files:changed'], type, relativePath);
    }
  }

  /**
   * Perform initial scan and index all notes
   */
  async initialScan(): Promise<void> {
    console.log('📊 Starting initial scan...');
    
    // Check if FTS needs reindexing
    const ftsCount = this.notesDb.getFTSCount();
    const notesCount = this.notesDb.listNotes().length;
    console.log(`📊 FTS has ${ftsCount} entries, notes table has ${notesCount} notes`);
    
    const notes = await this.notesDir.listAllNotes();
    console.log(`📊 Found ${notes.length} notes on disk`);

    for (const notePath of notes) {
      try {
        await this.indexNote(notePath);
      } catch (error) {
        console.error(`❌ Error indexing: ${notePath}`, error);
      }
    }

    // Log final FTS status
    const finalFtsCount = this.notesDb.getFTSCount();
    console.log(`✅ Initial scan complete. FTS now has ${finalFtsCount} entries`);
    
    // Notify renderer that notes are ready
    this.notifyRenderer('sync-complete', '');
  }
}
