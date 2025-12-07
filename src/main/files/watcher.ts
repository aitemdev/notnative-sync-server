import chokidar, { FSWatcher } from 'chokidar';
import { BrowserWindow } from 'electron';
import Database from 'better-sqlite3';
import { NotesDirectory } from './notes-directory';
import { NoteFile } from './note-file';
import { NotesDatabase } from '../database/notes';
import { TagsDatabase } from '../database/tags';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import { FILE_WATCH_DEBOUNCE } from '../../shared/constants';

export class NotesWatcher {
  private watcher: FSWatcher | null = null;
  private db: Database.Database;
  private notesDir: NotesDirectory;
  private mainWindow: BrowserWindow;
  private notesDb: NotesDatabase;
  private tagsDb: TagsDatabase;
  
  // Debounce tracking
  private pendingChanges: Map<string, NodeJS.Timeout> = new Map();

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
      .on('add', (filePath: string) => this.debouncedHandle('add', filePath))
      .on('change', (filePath: string) => this.debouncedHandle('change', filePath))
      .on('unlink', (filePath: string) => this.debouncedHandle('unlink', filePath))
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
      
      console.log('✅ File watcher stopped');
    }
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
   * Handle new file added
   */
  private async handleAdd(filePath: string): Promise<void> {
    console.log(`📄 New note detected: ${filePath}`);

    try {
      await this.indexNote(filePath);
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
      // Remove from database
      this.notesDb.deleteNoteByPath(filePath);
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
    
    const notes = await this.notesDir.listAllNotes();
    console.log(`📊 Found ${notes.length} notes`);

    for (const notePath of notes) {
      try {
        await this.indexNote(notePath);
      } catch (error) {
        console.error(`❌ Error indexing: ${notePath}`, error);
      }
    }

    console.log('✅ Initial scan complete');
    
    // Notify renderer that notes are ready
    this.notifyRenderer('sync-complete', '');
  }
}
