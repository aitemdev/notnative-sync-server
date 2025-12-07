import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import type { ToolContext } from '../context';
import { NoteFile } from '../../files/note-file';
import { IPC_CHANNELS } from '../../../shared/types/ipc';

export function createNoteTools(ctx: ToolContext) {
  return {
    // === Search ===
    search_notes: tool({
      description: 'Search for notes using full-text search (keywords). Returns note names and snippets. Use semantic_search for conceptual/meaning-based search.',
      inputSchema: z.object({
        query: z.string().describe('The search query (keywords)'),
      }),
      execute: async ({ query }: { query: string }) => {
        const results = ctx.notesDb.searchNotes(query);
        if (results.length === 0) {
          return 'No notes found matching the query.';
        }
        
        const limitedResults = results.slice(0, 10);
        const formattedResults = limitedResults.map(r => 
          `- **${r.noteName}**: ${r.snippet || 'No preview available'}`
        ).join('\n');
        
        // Add sources section
        const sources = limitedResults.map(r => `- [[${r.noteName}]]`);
        const uniqueSources = [...new Set(sources)];
        
        return `${formattedResults}\n\n---\n**📚 Fuentes encontradas:**\n${uniqueSources.join('\n')}`;
      },
    }),

    // === Read ===
    read_note: tool({
      description: 'Read the full content of a specific note by its exact name',
      inputSchema: z.object({
        name: z.string().describe('The exact name of the note (without .md extension)'),
      }),
      execute: async ({ name }: { name: string }) => {
        const metadata = ctx.notesDb.getNoteByName(name);
        if (!metadata) {
          return `Note '${name}' not found. Use list_notes or search_notes to find available notes.`;
        }
        try {
          const content = fs.readFileSync(metadata.path, 'utf-8');
          return `# ${name}\n\n${content}\n\n---\n**📚 Fuente:** [[${name}]]`;
        } catch (error) {
          return `Error reading note: ${error}`;
        }
      },
    }),

    list_notes: tool({
      description: 'List all notes in the workspace, optionally filtered by folder',
      inputSchema: z.object({
        folder: z.string().optional().describe('Optional folder path to filter by'),
        limit: z.number().optional().describe('Maximum number of notes to return (default: 50)'),
      }),
      execute: async ({ folder, limit = 50 }: { folder?: string; limit?: number }) => {
        const notes = ctx.notesDb.listNotes(folder);
        if (notes.length === 0) {
          return folder 
            ? `No notes found in folder '${folder}'.`
            : 'No notes found in the workspace.';
        }
        const list = notes.slice(0, limit).map(n => 
          `- ${n.name}${n.folder ? ` (${n.folder})` : ''}`
        ).join('\n');
        return `Found ${notes.length} notes:\n${list}`;
      },
    }),

    // === Create ===
    create_note: tool({
      description: 'Create a new note with the given content',
      inputSchema: z.object({
        name: z.string().describe('The name of the note (without .md extension)'),
        content: z.string().describe('The markdown content of the note'),
        folder: z.string().optional().describe('Optional folder path (e.g., "Projects/Web")'),
      }),
      execute: async ({ name, content, folder }: { name: string; content: string; folder?: string }) => {
        // Check if note already exists
        const existing = ctx.notesDb.getNoteByName(name);
        if (existing) {
          return `Error: A note named '${name}' already exists. Use update_note to modify it.`;
        }

        const fileName = `${name}.md`;
        const filePath = folder 
          ? ctx.notesDir.resolve(path.join(folder, fileName))
          : ctx.notesDir.resolve(fileName);

        try {
          // Create directories if needed
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          
          // Write file
          fs.writeFileSync(filePath, content);
          
          // Add to database
          const metadata = ctx.notesDb.createNote(name, filePath, folder || null);
          ctx.notesDb.indexNoteContent(metadata.id, name, content);
          
          return `✅ Note '${name}' created successfully${folder ? ` in folder '${folder}'` : ''}.`;
        } catch (error) {
          return `Error creating note: ${error}`;
        }
      },
    }),

    // === Update ===
    update_note: tool({
      description: 'Update/replace the entire content of an existing note',
      inputSchema: z.object({
        name: z.string().describe('The name of the note to update'),
        content: z.string().describe('The new markdown content'),
      }),
      execute: async ({ name, content }: { name: string; content: string }) => {
        const metadata = ctx.notesDb.getNoteByName(name);
        if (!metadata) {
          return `Note '${name}' not found. Use create_note to create a new note.`;
        }

        try {
          const noteFile = NoteFile.open(metadata.path);
          noteFile.createBackup(ctx.notesDir);
          noteFile.write(content);
          
          ctx.notesDb.touchNote(metadata.id);
          ctx.notesDb.indexNoteContent(metadata.id, name, content);
          
          // Notify renderer with the new content directly
          const mainWindow = ctx.getMainWindow();
          console.log('[AI Tools] update_note: Notifying renderer, mainWindow:', !!mainWindow);
          if (mainWindow && !mainWindow.isDestroyed()) {
            console.log('[AI Tools] Sending note:content-updated for:', name, 'id:', metadata.id);
            mainWindow.webContents.send(IPC_CHANNELS['note:content-updated'], {
              id: metadata.id,
              name: name,
              content: content,
            });
          } else {
            console.warn('[AI Tools] mainWindow not available or destroyed');
          }
          
          return `✅ Note '${name}' updated successfully.`;
        } catch (error) {
          return `Error updating note: ${error}`;
        }
      },
    }),

    append_to_note: tool({
      description: 'Append content to the end of an existing note',
      inputSchema: z.object({
        name: z.string().describe('The name of the note'),
        content: z.string().describe('Content to append at the end'),
      }),
      execute: async ({ name, content }: { name: string; content: string }) => {
        const metadata = ctx.notesDb.getNoteByName(name);
        if (!metadata) {
          return `Note '${name}' not found.`;
        }

        try {
          const existing = fs.readFileSync(metadata.path, 'utf-8');
          const newContent = existing.trimEnd() + '\n\n' + content;
          
          fs.writeFileSync(metadata.path, newContent);
          ctx.notesDb.touchNote(metadata.id);
          ctx.notesDb.indexNoteContent(metadata.id, name, newContent);
          
          // Notify renderer with the new content
          const mainWindow = ctx.getMainWindow();
          console.log('[AI Tools] append_to_note: Notifying renderer, mainWindow:', !!mainWindow);
          if (mainWindow && !mainWindow.isDestroyed()) {
            console.log('[AI Tools] Sending note:content-updated for:', name, 'id:', metadata.id);
            mainWindow.webContents.send(IPC_CHANNELS['note:content-updated'], {
              id: metadata.id,
              name: name,
              content: newContent,
            });
          }
          
          return `✅ Content appended to '${name}'.`;
        } catch (error) {
          return `Error appending to note: ${error}`;
        }
      },
    }),

    // === Delete ===
    delete_note: tool({
      description: 'Delete a note (moves to trash)',
      inputSchema: z.object({
        name: z.string().describe('The name of the note to delete'),
      }),
      execute: async ({ name }: { name: string }) => {
        const metadata = ctx.notesDb.getNoteByName(name);
        if (!metadata) {
          return `Note '${name}' not found.`;
        }

        try {
          const noteFile = NoteFile.open(metadata.path);
          noteFile.trash(ctx.notesDir);
          
          ctx.notesDb.removeNoteFromFTS(metadata.id);
          ctx.notesDb.deleteNote(metadata.id);
          
          return `✅ Note '${name}' moved to trash.`;
        } catch (error) {
          return `Error deleting note: ${error}`;
        }
      },
    }),

    // === Rename ===
    rename_note: tool({
      description: 'Rename an existing note',
      inputSchema: z.object({
        oldName: z.string().describe('Current name of the note'),
        newName: z.string().describe('New name for the note'),
      }),
      execute: async ({ oldName, newName }: { oldName: string; newName: string }) => {
        const metadata = ctx.notesDb.getNoteByName(oldName);
        if (!metadata) {
          return `Note '${oldName}' not found.`;
        }

        // Check if new name exists
        const existing = ctx.notesDb.getNoteByName(newName);
        if (existing) {
          return `Error: A note named '${newName}' already exists.`;
        }

        try {
          const noteFile = NoteFile.open(metadata.path);
          noteFile.rename(newName);
          
          ctx.notesDb.updateNote(metadata.id, { name: newName, path: noteFile.path });
          
          // Notify renderer about the rename
          const mainWindow = ctx.getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            console.log('[AI Tools] Sending note:renamed for:', oldName, '->', newName);
            mainWindow.webContents.send(IPC_CHANNELS['note:renamed'], {
              id: metadata.id,
              oldName: oldName,
              newName: newName,
              newPath: noteFile.path,
            });
          }
          
          return `✅ Note renamed from '${oldName}' to '${newName}'.`;
        } catch (error) {
          return `Error renaming note: ${error}`;
        }
      },
    }),
  };
}
