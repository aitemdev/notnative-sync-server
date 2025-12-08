import { ipcMain, BrowserWindow, app, nativeTheme, dialog, shell } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import { NotesDirectory } from '../files/notes-directory';
import { NoteFile } from '../files/note-file';
import { NotesDatabase } from '../database/notes';
import { TagsDatabase } from '../database/tags';
import { AttachmentsDatabase } from '../database/attachments';
import { InlinePropertiesDatabase } from '../database/inline-properties';
import { LinksDatabase } from '../database/links';
import { indexNote, semanticSearch, reindexAllNotes, getIndexingStats, deleteEmbeddings, deleteEmbeddingsMatching } from '../database/embeddings';
import { setEmbeddingModel, getEmbeddingModel, setAIModel, getAIModel, getApiKey as getClientApiKey, initAIClient, getAIClient } from '../ai/client';
import { getAllModels } from '../ai/models';
import { createQuickNoteWindow, closeQuickNoteWindow } from '../windows/quicknote-window';
import { getMainWindow } from '../windows/main-window';
import { APP_NAME, APP_VERSION, AI_EMBEDDING_MODEL, AI_DEFAULT_MODEL } from '../../shared/constants';
import { getApiKey, setApiKey, hasApiKey, getSettings, updateSettings, AppSettings } from '../settings/store';

export function registerIpcHandlers(db: Database.Database, notesDir: NotesDirectory): void {
  const notesDb = new NotesDatabase(db);
  const tagsDb = new TagsDatabase(db);
  const propsDb = new InlinePropertiesDatabase(db);
  const attachmentsDb = new AttachmentsDatabase(db);
  const linksDb = new LinksDatabase(db, notesDb);

  // Link databases for cascade operations
  notesDb.setAttachmentsDatabase(attachmentsDb);
  notesDb.setLinksDatabase(linksDb);

  // ============== NOTES ==============

  ipcMain.handle(IPC_CHANNELS['notes:list'], async (_, folder?: string) => {
    return notesDb.listNotes(folder);
  });

  ipcMain.handle(IPC_CHANNELS['notes:read'], async (_, name: string) => {
    console.log(`📖 Reading note: ${name}`);
    const metadata = notesDb.getNoteByName(name);
    console.log(`📖 Metadata found:`, metadata);
    if (!metadata) {
      console.log(`❌ Note not found: ${name}`);
      return null;
    }

    try {
      const noteFile = NoteFile.open(metadata.path);
      const content = noteFile.read();
      console.log(`📖 Content length: ${content.length}`);
      const tags = tagsDb.getTagsForNote(metadata.id).map(t => t.name);
      
      const result = {
        ...metadata,
        content,
        tags,
      };
      console.log(`📖 Returning note with content`);
      return result;
    } catch (error) {
      console.error(`Error reading note: ${name}`, error);
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS['notes:read-by-id'], async (_, id: number) => {
    console.log(`📖 Reading note by id: ${id}`);
    const metadata = notesDb.getNoteById(id);
    if (!metadata) {
      console.log(`❌ Note not found by id: ${id}`);
      return null;
    }

    try {
      const noteFile = NoteFile.open(metadata.path);
      const content = noteFile.read();
      const tags = tagsDb.getTagsForNote(metadata.id).map(t => t.name);
      return { ...metadata, content, tags };
    } catch (error) {
      console.error(`Error reading note id ${id}:`, error);
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS['notes:create'], async (_, name: string, content?: string, folder?: string) => {
    const fileName = `${name}.md`;
    const filePath = folder 
      ? notesDir.resolve(path.join(folder, fileName))
      : notesDir.resolve(fileName);

    // Check if note already exists
    if (NoteFile.exists(filePath)) {
      throw new Error(`Note "${name}" already exists`);
    }

    // Create file with default content if not provided
    const initialContent = content ?? NoteFile.generateDefaultContent(name);
    const noteFile = NoteFile.create(filePath, initialContent);

    // Add to database
    const metadata = notesDb.createNote(name, filePath, folder ?? null);
    notesDb.indexNoteContent(metadata.id, name, initialContent);

    return metadata;
  });

  ipcMain.handle(IPC_CHANNELS['notes:update'], async (_, name: string, content: string) => {
    const metadata = notesDb.getNoteByName(name);
    if (!metadata) {
      throw new Error(`Note "${name}" not found`);
    }

    const noteFile = NoteFile.open(metadata.path);
    
    // Create backup before updating
    noteFile.createBackup(notesDir);
    
    // Write new content
    noteFile.write(content);

    // Update database
    notesDb.touchNote(metadata.id);
    notesDb.indexNoteContent(metadata.id, name, content);
  });

  // Update note by ID (more reliable than by name)
  ipcMain.handle(IPC_CHANNELS['notes:update-by-id'], async (_, id: number, content: string) => {
    console.log('📝 [IPC] notes:update-by-id called - id:', id, 'content length:', content.length);
    const metadata = notesDb.getNoteById(id);
    if (!metadata) {
      console.error('❌ [IPC] Note not found with id:', id);
      throw new Error(`Note with id ${id} not found`);
    }
    console.log('📝 [IPC] Writing to note:', metadata.name, 'path:', metadata.path);

    const noteFile = NoteFile.open(metadata.path);
    
    // Create backup before updating
    noteFile.createBackup(notesDir);
    
    // Write new content
    noteFile.write(content);

    // Update database
    notesDb.touchNote(metadata.id);
    notesDb.indexNoteContent(metadata.id, metadata.name, content);
    
    return metadata;
  });

  // ============== IMAGES (EDITOR) ==============
  ipcMain.handle(IPC_CHANNELS['images:save'], async (_event, noteId: number, fileName: string, data: Buffer | ArrayBuffer | Uint8Array) => {
    if (!noteId) {
      throw new Error('noteId is required to save a file');
    }

    const metadata = notesDb.getNoteById(noteId);
    if (!metadata) {
      throw new Error(`Note with id ${noteId} not found`);
    }

    // Get the original extension (keep it as-is for all file types)
    const ext = (path.extname(fileName) || '').toLowerCase();

    // Generate a safe filename (preserve original extension)
    const baseName = path.basename(fileName, path.extname(fileName)).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50) || 'file';
    const unique = `${baseName}-${Date.now()}${ext}`;

    // Save in note's assets directory
    const noteFile = NoteFile.open(metadata.path);
    const assetsDir = noteFile.ensureAssetsDirectory();
    const targetPath = path.join(assetsDir, unique);

    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    fs.writeFileSync(targetPath, buffer);

    // Return relative path from the note file location to the file
    const relativePath = path.relative(path.dirname(metadata.path), targetPath);
    return { relativePath };
  });

  ipcMain.handle(IPC_CHANNELS['notes:delete'], async (_, name: string) => {
    const metadata = notesDb.getNoteByName(name);
    if (!metadata) {
      throw new Error(`Note "${name}" not found`);
    }

    const noteFile = NoteFile.open(metadata.path);
    
    // Move to trash instead of deleting
    noteFile.trash(notesDir);

    // Remove from FTS and database
    notesDb.removeNoteFromFTS(metadata.id);
    notesDb.deleteNote(metadata.id);
  });

  ipcMain.handle(IPC_CHANNELS['notes:rename'], async (_, oldName: string, newName: string) => {
    const metadata = notesDb.getNoteByName(oldName);
    if (!metadata) {
      throw new Error(`Note "${oldName}" not found`);
    }

    const noteFile = NoteFile.open(metadata.path);
    noteFile.rename(newName);

    // Update database
    notesDb.updateNote(metadata.id, { name: newName, path: noteFile.path });
  });

  ipcMain.handle(IPC_CHANNELS['notes:move'], async (_, name: string, folder: string) => {
    const metadata = notesDb.getNoteByName(name);
    if (!metadata) {
      throw new Error(`Note "${name}" not found`);
    }

    const noteFile = NoteFile.open(metadata.path);
    noteFile.move(folder, notesDir);

    // Update database
    notesDb.updateNote(metadata.id, { path: noteFile.path, folder });
  });

  ipcMain.handle(IPC_CHANNELS['notes:search'], async (_, query: string) => {
    console.log(`🔍 Searching for: "${query}"`);
    const ftsCount = notesDb.getFTSCount();
    const notesCount = notesDb.listNotes().length;
    console.log(`🔍 FTS index has ${ftsCount} entries, notes table has ${notesCount} notes`);
    
    const results = notesDb.searchNotes(query);
    console.log(`🔍 Found ${results.length} results`);
    return results;
  });

  ipcMain.handle(IPC_CHANNELS['notes:reindex'], async () => {
    console.log('🔄 Starting FTS reindex...');
    const notes = notesDb.getAllNotesForReindex();
    let indexed = 0;
    
    for (const note of notes) {
      try {
        const noteFile = NoteFile.open(note.path);
        const content = noteFile.read();
        notesDb.indexNoteContent(note.id, note.name, content);
        indexed++;
      } catch (error) {
        console.error(`❌ Failed to reindex ${note.name}:`, error);
      }
    }
    
    console.log(`✅ Reindexed ${indexed}/${notes.length} notes`);
    return { indexed, total: notes.length };
  });

  // ============== LINKS ==============

  ipcMain.handle(IPC_CHANNELS['links:get-outgoing'], async (_, noteId: number) => {
    console.log(`🔗 Getting outgoing links for note: ${noteId}`);
    try {
      const links = linksDb.getOutgoingLinks(noteId);
      console.log(`🔗 Found ${links.length} outgoing links`);
      return links;
    } catch (error) {
      console.error('❌ Error getting outgoing links:', error);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS['links:get-incoming'], async (_, noteId: number) => {
    console.log(`🔗 Getting incoming links (backlinks) for note: ${noteId}`);
    try {
      const backlinks = linksDb.getIncomingLinks(noteId);
      console.log(`🔗 Found ${backlinks.length} backlinks`);
      return backlinks;
    } catch (error) {
      console.error('❌ Error getting backlinks:', error);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS['links:get-all'], async () => {
    console.log(`🔗 Getting all links`);
    try {
      const links = linksDb.getAllLinks();
      console.log(`🔗 Found ${links.length} total links`);
      return links;
    } catch (error) {
      console.error('❌ Error getting all links:', error);
      return [];
    }
  });

  // ============== FOLDERS ==============

  ipcMain.handle(IPC_CHANNELS['folders:list'], async () => {
    return notesDir.listAllFolders();
  });

  ipcMain.handle(IPC_CHANNELS['folders:create'], async (_, folderPath: string) => {
    await notesDir.createFolder(folderPath);
    return { path: folderPath };
  });

  ipcMain.handle(IPC_CHANNELS['folders:delete'], async (_, folderPath: string) => {
    await notesDir.deleteFolder(folderPath, true);
  });

  ipcMain.handle(IPC_CHANNELS['folders:rename'], async (_, oldPath: string, newPath: string) => {
    await notesDir.renameFolder(oldPath, newPath);
  });

  // ============== TAGS ==============

  ipcMain.handle(IPC_CHANNELS['tags:list'], async () => {
    return tagsDb.listTags();
  });

  ipcMain.handle(IPC_CHANNELS['tags:create'], async (_, name: string, color?: string) => {
    return tagsDb.createTag(name, color ?? null);
  });

  ipcMain.handle(IPC_CHANNELS['tags:delete'], async (_, name: string) => {
    const tag = tagsDb.getTagByName(name);
    if (tag) {
      tagsDb.deleteTag(tag.id);
    }
  });

  ipcMain.handle(IPC_CHANNELS['tags:add-to-note'], async (_, noteName: string, tagName: string) => {
    const note = notesDb.getNoteByName(noteName);
    if (!note) {
      throw new Error(`Note "${noteName}" not found`);
    }

    const tag = tagsDb.getOrCreateTag(tagName);
    tagsDb.addTagToNote(note.id, tag.id);
  });

  ipcMain.handle(IPC_CHANNELS['tags:remove-from-note'], async (_, noteName: string, tagName: string) => {
    const note = notesDb.getNoteByName(noteName);
    const tag = tagsDb.getTagByName(tagName);
    
    if (note && tag) {
      tagsDb.removeTagFromNote(note.id, tag.id);
    }
  });

  // ============== APP ==============

  ipcMain.handle(IPC_CHANNELS['app:get-info'], async () => {
    return {
      name: APP_NAME,
      version: APP_VERSION,
    };
  });

  ipcMain.handle(IPC_CHANNELS['app:get-doc-path'], async (_, fileName: string) => {
    // In dev, docs are in project root; in production they're in app.asar or resources
    const docPath = app.isPackaged
      ? path.join(process.resourcesPath, fileName)
      : path.join(app.getAppPath(), fileName);
    
    console.log('📄 Getting doc path for:', fileName);
    console.log('📄 Resolved path:', docPath);
    console.log('📄 File exists:', fs.existsSync(docPath));
    
    if (!fs.existsSync(docPath)) {
      console.error('📄 Doc file not found:', docPath);
      throw new Error(`Documentation file not found: ${fileName}`);
    }
    
    return docPath;
  });

  ipcMain.handle(IPC_CHANNELS['app:get-theme'], async () => {
    return nativeTheme.themeSource;
  });

  ipcMain.handle(IPC_CHANNELS['app:set-theme'], async (_, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme;
  });

  ipcMain.handle(IPC_CHANNELS['app:get-settings'], async () => {
    return getSettings();
  });

  ipcMain.handle(IPC_CHANNELS['app:set-settings'], async (_event, settings: Partial<AppSettings>) => {
    const oldSettings = getSettings();
    const newSettings = updateSettings(settings);
    
    // If notesRoot changed, trigger migration
    if (settings.notesRoot && oldSettings.notesRoot !== settings.notesRoot) {
      const oldPath = oldSettings.notesRoot || path.join(app.getPath('documents'), 'NotNative Notes');
      const newPath = settings.notesRoot;
      
      console.log(`📦 Notes path changed from ${oldPath} to ${newPath}`);
      
      // Check if old path exists and has content
      if (fs.existsSync(oldPath)) {
        try {
          const oldContents = await fs.promises.readdir(oldPath);
          const hasContent = oldContents.some(item => 
            !item.startsWith('.') || ['.history', '.trash'].includes(item)
          );
          
          if (hasContent) {
            console.log('📦 Migrating notes to new location...');
            
            // Ensure new directory exists
            await fs.promises.mkdir(newPath, { recursive: true });
            
            // Copy all contents recursively
            const entries = await fs.promises.readdir(oldPath, { withFileTypes: true });
            for (const entry of entries) {
              const srcPath = path.join(oldPath, entry.name);
              const destPath = path.join(newPath, entry.name);
              
              if (entry.isDirectory()) {
                await fs.promises.cp(srcPath, destPath, { recursive: true });
              } else {
                await fs.promises.copyFile(srcPath, destPath);
              }
            }
            
            console.log('✅ Notes migrated successfully');
          }
        } catch (error) {
          console.error('❌ Error migrating notes:', error);
          throw new Error(`Failed to migrate notes: ${error}`);
        }
      }
    }
    
    return newSettings;
  });

  // ============== DIALOGS ==============
  ipcMain.handle(IPC_CHANNELS['dialog:open-directory'], async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // ============== SHELL ==============
  ipcMain.handle(IPC_CHANNELS['shell:open-path'], async (_event, filePath: string) => {
    try {
      const result = await shell.openPath(filePath);
      if (result) {
        // openPath returns empty string on success, error message on failure
        throw new Error(result);
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to open path:', filePath, error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS['shell:show-item-in-folder'], async (_event, filePath: string) => {
    try {
      shell.showItemInFolder(filePath);
    } catch (error) {
      console.error('Failed to show item in folder:', filePath, error);
    }
  });

  // ============== WINDOW ==============

  ipcMain.handle(IPC_CHANNELS['window:quicknote-open'], async () => {
    await createQuickNoteWindow();
  });

  ipcMain.handle(IPC_CHANNELS['window:quicknote-close'], async () => {
    closeQuickNoteWindow();
  });

  ipcMain.handle(IPC_CHANNELS['window:minimize'], async () => {
    const mainWindow = getMainWindow();
    mainWindow?.minimize();
  });

  ipcMain.handle(IPC_CHANNELS['window:maximize'], async () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS['window:close'], async () => {
    const mainWindow = getMainWindow();
    mainWindow?.close();
  });

  // ============== FILES ==============

  ipcMain.handle(IPC_CHANNELS['files:get-notes-directory'], async () => {
    return notesDir.root;
  });

  ipcMain.handle(IPC_CHANNELS['files:get-size'], async (_event, filePath: string, notePath?: string) => {
    try {
      if (!filePath) throw new Error('filePath is required');

      let target = filePath;
      const isAbsolute = path.isAbsolute(filePath) || /^[a-zA-Z]:[\\/]/.test(filePath);

      if (!isAbsolute) {
        if (!notePath) throw new Error('notePath is required for relative paths');
        const baseDir = path.dirname(notePath);
        target = path.join(baseDir, filePath);
      }

      const stats = await fs.promises.stat(target);
      if (!stats.isFile()) throw new Error('Not a file');

      return { success: true, size: stats.size, path: target };
    } catch (error) {
      console.error('Failed to get file size:', filePath, error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS['files:save-as'], async (_event, sourcePath: string) => {
    try {
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        throw new Error('Source file not found');
      }

      const defaultName = path.basename(sourcePath);
      const result = await dialog.showSaveDialog({
        title: 'Guardar archivo',
        defaultPath: defaultName,
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      await fs.promises.copyFile(sourcePath, result.filePath);
      return { success: true, destination: result.filePath };
    } catch (error) {
      console.error('Failed to save file as:', sourcePath, error);
      return { success: false, error: String(error) };
    }
  });

  // ============== EMBEDDINGS ==============

  ipcMain.handle(IPC_CHANNELS['embeddings:search'], async (_, query: string, limit?: number) => {
    try {
      return await semanticSearch(query, limit);
    } catch (error) {
      console.error('Semantic search error:', error);
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS['embeddings:index-note'], async (_, notePath: string) => {
    try {
      const noteFile = NoteFile.open(notePath);
      const content = noteFile.read();
      await indexNote(notePath, content);
      return { success: true };
    } catch (error) {
      console.error('Index note error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS['embeddings:reindex-all'], async () => {
    try {
      // First, clean up embeddings from excluded folders
      const deletedHistory = deleteEmbeddingsMatching('/.history/');
      const deletedTrash = deleteEmbeddingsMatching('/.trash/');
      if (deletedHistory > 0 || deletedTrash > 0) {
        console.log(`🧹 Cleaned up ${deletedHistory + deletedTrash} embeddings from excluded folders`);
      }
      
      const result = await reindexAllNotes(notesDir.root);
      return { success: true, ...result };
    } catch (error) {
      console.error('Reindex all error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS['embeddings:get-stats'], async () => {
    return getIndexingStats();
  });

  ipcMain.handle(IPC_CHANNELS['embeddings:delete'], async (_, notePath: string) => {
    try {
      deleteEmbeddings(notePath);
      return { success: true };
    } catch (error) {
      console.error('Delete embeddings error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS['embeddings:get-model'], async () => {
    return getEmbeddingModel() || AI_EMBEDDING_MODEL;
  });

  ipcMain.handle(IPC_CHANNELS['embeddings:set-model'], async (_, model: string) => {
    setEmbeddingModel(model);
    return { success: true };
  });

  // ============== AI MODELS ==============

  ipcMain.handle(IPC_CHANNELS['ai:get-models'], async () => {
    try {
      // Get API key from settings store (includes env fallback)
      const apiKey = getApiKey();
      
      if (!apiKey) {
        console.warn('⚠️ No API key available for fetching models');
        return { chat: [], embedding: [], error: 'No API key configured. Add your OpenRouter API key in settings.' };
      }
      
      console.log('🔍 Fetching models from OpenRouter...');
      const models = await getAllModels(apiKey);
      console.log(`✅ Fetched ${models.chat.length} chat models and ${models.embedding.length} embedding models`);
      
      return models;
    } catch (error) {
      console.error('❌ Failed to fetch models:', error);
      return { chat: [], embedding: [], error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS['ai:get-chat-model'], async () => {
    return getAIModel() || AI_DEFAULT_MODEL;
  });

  ipcMain.handle(IPC_CHANNELS['ai:set-chat-model'], async (_, model: string) => {
    setAIModel(model);
    return { success: true };
  });

  // ============== API KEY ==============

  ipcMain.handle(IPC_CHANNELS['ai:get-api-key'], async () => {
    const key = getApiKey();
    // Return masked version for security
    if (!key) return { hasKey: false, maskedKey: '' };
    const masked = key.slice(0, 10) + '...' + key.slice(-4);
    return { hasKey: true, maskedKey: masked };
  });

  ipcMain.handle(IPC_CHANNELS['ai:set-api-key'], async (_, apiKey: string) => {
    try {
      // Save to settings
      setApiKey(apiKey);
      
      // Reinitialize AI client with new key
      if (apiKey) {
        initAIClient(apiKey);
        console.log('✅ AI Client reinitialized with new API key');
      }
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to set API key:', error);
      return { success: false, error: String(error) };
    }
  });

  // ============== ATTACHMENTS ==============

  ipcMain.handle(IPC_CHANNELS['attachments:open'], async (_, filePath: string) => {
    try {
      // Decode URL encoding (e.g., %20 -> space)
      const decodedPath = decodeURIComponent(filePath);
      console.log('📂 Opening attachment:', decodedPath);
      
      // Check if file exists
      if (!fs.existsSync(decodedPath)) {
        console.error('❌ File not found:', decodedPath);
        return { success: false, error: 'Archivo no encontrado' };
      }
      
      // shell.openPath returns a promise that resolves to an error string (empty if successful)
      const errorMessage = await shell.openPath(decodedPath);
      
      if (errorMessage) {
        console.error('❌ Failed to open file:', errorMessage);
        return { success: false, error: errorMessage };
      }
      
      console.log('✅ File opened successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Exception opening attachment:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS['attachments:get-by-note'], async (_, noteName: string) => {
    const note = notesDb.getNoteByName(noteName);
    if (!note) {
      return { success: false, error: 'Note not found', attachments: [] };
    }
    
    const attachments = attachmentsDb.getAttachmentsByNote(note.path);
    return { success: true, attachments };
  });

  ipcMain.handle(IPC_CHANNELS['attachments:search'], async (_, query: string, limit?: number) => {
    const attachments = attachmentsDb.searchAttachmentsByName(query, limit);
    return { success: true, attachments };
  });

  ipcMain.handle(IPC_CHANNELS['attachments:get-stats'], async () => {
    const stats = attachmentsDb.getStats();
    return {
      success: true,
      totalAttachments: stats.totalAttachments,
      totalSize: stats.totalSize,
      orphanedCount: stats.orphanedAttachments.length,
    };
  });

  ipcMain.handle(IPC_CHANNELS['attachments:clean-orphans'], async () => {
    try {
      const cleaned = attachmentsDb.cleanOrphanedAttachments();
      return { success: true, cleaned };
    } catch (error) {
      console.error('❌ Failed to clean orphaned attachments:', error);
      return { success: false, error: String(error), cleaned: 0 };
    }
  });

  console.log('✅ IPC handlers registered');
}
