import Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';
import { NotesDirectory } from '../files/notes-directory';
import { NotesDatabase } from '../database/notes';
import { TagsDatabase } from '../database/tags';
import { AttachmentsDatabase } from '../database/attachments';

export interface ToolContext {
  db: Database.Database;
  notesDb: NotesDatabase;
  tagsDb: TagsDatabase;
  attachmentsDb: AttachmentsDatabase;
  notesDir: NotesDirectory;
  getMainWindow: () => BrowserWindow | null;
}

export function createToolContext(
  db: Database.Database,
  notesDir: NotesDirectory,
  getMainWindow: () => BrowserWindow | null
): ToolContext {
  return {
    db,
    notesDb: new NotesDatabase(db),
    tagsDb: new TagsDatabase(db),
    attachmentsDb: new AttachmentsDatabase(db),
    notesDir,
    getMainWindow,
  };
}
