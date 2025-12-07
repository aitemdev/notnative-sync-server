import { ipcMain, BrowserWindow, app, nativeTheme } from 'electron';
import Database from 'better-sqlite3';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import { NotesDirectory } from '../files/notes-directory';
import { NoteFile } from '../files/note-file';
import { NotesDatabase } from '../database/notes';
import { TagsDatabase } from '../database/tags';
import { InlinePropertiesDatabase } from '../database/inline-properties';
import { createQuickNoteWindow, closeQuickNoteWindow } from '../windows/quicknote-window';
import { getMainWindow } from '../windows/main-window';
import { APP_NAME, APP_VERSION } from '../../shared/constants';

export function registerIpcHandlers(db: Database.Database, notesDir: NotesDirectory): void {
  const notesDb = new NotesDatabase(db);
  const tagsDb = new TagsDatabase(db);
  const propsDb = new InlinePropertiesDatabase(db);

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
    const metadata = notesDb.getNoteById(id);
    if (!metadata) {
      throw new Error(`Note with id ${id} not found`);
    }

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

  ipcMain.handle(IPC_CHANNELS['notes:delete'], async (_, name: string) => {
    const metadata = notesDb.getNoteByName(name);
    if (!metadata) {
      throw new Error(`Note "${name}" not found`);
    }

    const noteFile = NoteFile.open(metadata.path);
    
    // Move to trash instead of deleting
    noteFile.trash(notesDir);

    // Remove from database
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
    return notesDb.searchNotes(query);
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

  ipcMain.handle(IPC_CHANNELS['app:get-theme'], async () => {
    return nativeTheme.themeSource;
  });

  ipcMain.handle(IPC_CHANNELS['app:set-theme'], async (_, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme;
  });

  ipcMain.handle(IPC_CHANNELS['app:get-settings'], async () => {
    // TODO: Implement settings storage
    return {};
  });

  ipcMain.handle(IPC_CHANNELS['app:set-settings'], async (_, settings: Record<string, unknown>) => {
    // TODO: Implement settings storage
    console.log('Settings updated:', settings);
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

  console.log('✅ IPC handlers registered');
}
