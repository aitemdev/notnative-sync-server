import Database from 'better-sqlite3';
import { NotesDirectory } from '../files/notes-directory';
import { NoteFile } from '../files/note-file';
import { NotesDatabase } from '../database/notes';
import { TagsDatabase } from '../database/tags';
import type { MCPToolDefinition, MCPToolResult } from '../../shared/types/mcp';
import { MCP_ERROR_CODES } from '../../shared/types/mcp';

export class MCPToolExecutor {
  private db: Database.Database;
  private notesDir: NotesDirectory;
  private notesDb: NotesDatabase;
  private tagsDb: TagsDatabase;

  constructor(db: Database.Database, notesDir: NotesDirectory) {
    this.db = db;
    this.notesDir = notesDir;
    this.notesDb = new NotesDatabase(db);
    this.tagsDb = new TagsDatabase(db);
  }

  async execute(method: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    const handler = this.handlers[method];
    
    if (!handler) {
      return {
        success: false,
        error: `Unknown method: ${method}`,
      };
    }

    try {
      const data = await handler.call(this, params);
      return { success: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  private handlers: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
    // ============== NOTES ==============
    
    list_notes: async (params) => {
      const folder = params.folder as string | undefined;
      return this.notesDb.listNotes(folder);
    },

    read_note: async (params) => {
      const name = params.name as string;
      const metadata = this.notesDb.getNoteByName(name);
      
      if (!metadata) {
        throw new Error(`Note not found: ${name}`);
      }

      const noteFile = NoteFile.open(metadata.path);
      const content = noteFile.read();
      
      return {
        ...metadata,
        content,
      };
    },

    create_note: async (params) => {
      const name = params.name as string;
      const content = params.content as string | undefined;
      const folder = params.folder as string | undefined;

      const fileName = `${name}.md`;
      const filePath = folder
        ? this.notesDir.resolve(`${folder}/${fileName}`)
        : this.notesDir.resolve(fileName);

      if (NoteFile.exists(filePath)) {
        throw new Error(`Note already exists: ${name}`);
      }

      const initialContent = content ?? NoteFile.generateDefaultContent(name);
      NoteFile.create(filePath, initialContent);

      const metadata = this.notesDb.createNote(name, filePath, folder ?? null);
      this.notesDb.indexNoteContent(metadata.id, name, initialContent);

      return metadata;
    },

    update_note: async (params) => {
      const name = params.name as string;
      const content = params.content as string;

      const metadata = this.notesDb.getNoteByName(name);
      if (!metadata) {
        throw new Error(`Note not found: ${name}`);
      }

      const noteFile = NoteFile.open(metadata.path);
      noteFile.write(content);

      this.notesDb.touchNote(metadata.id);
      this.notesDb.indexNoteContent(metadata.id, name, content);

      return { success: true };
    },

    append_to_note: async (params) => {
      const name = params.name as string;
      const content = params.content as string;

      const metadata = this.notesDb.getNoteByName(name);
      if (!metadata) {
        throw new Error(`Note not found: ${name}`);
      }

      const noteFile = NoteFile.open(metadata.path);
      const currentContent = noteFile.read();
      const newContent = currentContent + '\n' + content;
      noteFile.write(newContent);

      this.notesDb.touchNote(metadata.id);
      this.notesDb.indexNoteContent(metadata.id, name, newContent);

      return { success: true };
    },

    delete_note: async (params) => {
      const name = params.name as string;

      const metadata = this.notesDb.getNoteByName(name);
      if (!metadata) {
        throw new Error(`Note not found: ${name}`);
      }

      const noteFile = NoteFile.open(metadata.path);
      noteFile.trash(this.notesDir);
      this.notesDb.removeNoteFromFTS(metadata.id);
      this.notesDb.deleteNote(metadata.id);

      return { success: true };
    },

    rename_note: async (params) => {
      const name = params.name as string;
      const newName = params.new_name as string;

      const metadata = this.notesDb.getNoteByName(name);
      if (!metadata) {
        throw new Error(`Note not found: ${name}`);
      }

      const noteFile = NoteFile.open(metadata.path);
      noteFile.rename(newName);

      this.notesDb.updateNote(metadata.id, { name: newName, path: noteFile.path });

      return { success: true, newName };
    },

    move_note: async (params) => {
      const name = params.name as string;
      const folder = params.folder as string;

      const metadata = this.notesDb.getNoteByName(name);
      if (!metadata) {
        throw new Error(`Note not found: ${name}`);
      }

      const noteFile = NoteFile.open(metadata.path);
      noteFile.move(folder, this.notesDir);

      this.notesDb.updateNote(metadata.id, { path: noteFile.path, folder });

      return { success: true };
    },

    // ============== SEARCH ==============

    search_notes: async (params) => {
      const query = params.query as string;
      return this.notesDb.searchNotes(query);
    },

    // ============== TAGS ==============

    list_tags: async () => {
      return this.tagsDb.listTags();
    },

    add_tag: async (params) => {
      const noteName = params.note as string;
      const tagName = params.tag as string;

      const note = this.notesDb.getNoteByName(noteName);
      if (!note) {
        throw new Error(`Note not found: ${noteName}`);
      }

      const tag = this.tagsDb.getOrCreateTag(tagName);
      this.tagsDb.addTagToNote(note.id, tag.id);

      return { success: true };
    },

    remove_tag: async (params) => {
      const noteName = params.note as string;
      const tagName = params.tag as string;

      const note = this.notesDb.getNoteByName(noteName);
      const tag = this.tagsDb.getTagByName(tagName);

      if (note && tag) {
        this.tagsDb.removeTagFromNote(note.id, tag.id);
      }

      return { success: true };
    },

    get_notes_by_tag: async (params) => {
      const tagName = params.tag as string;

      const tag = this.tagsDb.getTagByName(tagName);
      if (!tag) {
        return [];
      }

      const noteIds = this.tagsDb.getNotesWithTag(tag.id);
      return noteIds.map(id => this.notesDb.getNoteById(id)).filter(Boolean);
    },

    // ============== FOLDERS ==============

    list_folders: async () => {
      return this.notesDir.listAllFolders();
    },

    create_folder: async (params) => {
      const path = params.path as string;
      await this.notesDir.createFolder(path);
      return { success: true, path };
    },

    delete_folder: async (params) => {
      const path = params.path as string;
      await this.notesDir.deleteFolder(path, true);
      return { success: true };
    },

    // ============== UTILITY ==============

    get_daily_note: async () => {
      const today = new Date().toISOString().split('T')[0];
      const name = `Daily ${today}`;
      
      let metadata = this.notesDb.getNoteByName(name);
      
      if (!metadata) {
        // Create daily note
        const filePath = this.notesDir.resolve(`Daily/${name}.md`);
        const content = `---
tags: [daily]
date: ${today}
---

# ${today}

## Tasks
- [ ] 

## Notes

`;
        await this.notesDir.createFolder('Daily');
        NoteFile.create(filePath, content);
        metadata = this.notesDb.createNote(name, filePath, 'Daily');
        this.notesDb.indexNoteContent(metadata.id, name, content);
      }

      const noteFile = NoteFile.open(metadata.path);
      return {
        ...metadata,
        content: noteFile.read(),
      };
    },
  };

  getToolDefinitions(): MCPToolDefinition[] {
    return [
      {
        name: 'list_notes',
        description: 'List all notes, optionally filtered by folder',
        inputSchema: {
          type: 'object',
          properties: {
            folder: { type: 'string', description: 'Optional folder to filter by' },
          },
        },
      },
      {
        name: 'read_note',
        description: 'Read the content of a note by name',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the note' },
          },
          required: ['name'],
        },
      },
      {
        name: 'create_note',
        description: 'Create a new note',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the note' },
            content: { type: 'string', description: 'Initial content' },
            folder: { type: 'string', description: 'Folder to create in' },
          },
          required: ['name'],
        },
      },
      {
        name: 'update_note',
        description: 'Update the content of a note',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the note' },
            content: { type: 'string', description: 'New content' },
          },
          required: ['name', 'content'],
        },
      },
      {
        name: 'append_to_note',
        description: 'Append content to an existing note',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the note' },
            content: { type: 'string', description: 'Content to append' },
          },
          required: ['name', 'content'],
        },
      },
      {
        name: 'delete_note',
        description: 'Delete a note (moves to trash)',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the note' },
          },
          required: ['name'],
        },
      },
      {
        name: 'rename_note',
        description: 'Rename a note',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Current name' },
            new_name: { type: 'string', description: 'New name' },
          },
          required: ['name', 'new_name'],
        },
      },
      {
        name: 'move_note',
        description: 'Move a note to a different folder',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the note' },
            folder: { type: 'string', description: 'Target folder' },
          },
          required: ['name', 'folder'],
        },
      },
      {
        name: 'search_notes',
        description: 'Search notes by query',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_tags',
        description: 'List all tags',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'add_tag',
        description: 'Add a tag to a note',
        inputSchema: {
          type: 'object',
          properties: {
            note: { type: 'string', description: 'Note name' },
            tag: { type: 'string', description: 'Tag name' },
          },
          required: ['note', 'tag'],
        },
      },
      {
        name: 'remove_tag',
        description: 'Remove a tag from a note',
        inputSchema: {
          type: 'object',
          properties: {
            note: { type: 'string', description: 'Note name' },
            tag: { type: 'string', description: 'Tag name' },
          },
          required: ['note', 'tag'],
        },
      },
      {
        name: 'get_notes_by_tag',
        description: 'Get all notes with a specific tag',
        inputSchema: {
          type: 'object',
          properties: {
            tag: { type: 'string', description: 'Tag name' },
          },
          required: ['tag'],
        },
      },
      {
        name: 'list_folders',
        description: 'List all folders',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'create_folder',
        description: 'Create a new folder',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Folder path' },
          },
          required: ['path'],
        },
      },
      {
        name: 'delete_folder',
        description: 'Delete a folder',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Folder path' },
          },
          required: ['path'],
        },
      },
      {
        name: 'get_daily_note',
        description: 'Get or create today\'s daily note',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }
}
