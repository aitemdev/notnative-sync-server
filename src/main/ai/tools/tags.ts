import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from '../context';

export function createTagTools(ctx: ToolContext) {
  return {
    list_tags: tool({
      description: 'List all tags in the workspace',
      inputSchema: z.object({}),
      execute: async () => {
        const tags = ctx.tagsDb.listTags();
        if (tags.length === 0) {
          return 'No tags found.';
        }
        return tags.map(t => `- #${t.name} (${t.usageCount} notes)`).join('\n');
      },
    }),

    create_tag: tool({
      description: 'Create a new tag',
      inputSchema: z.object({
        name: z.string().describe('Tag name (without # prefix)'),
        color: z.string().optional().describe('Optional hex color (e.g., "#ff5500")'),
      }),
      execute: async ({ name, color }: { name: string; color?: string }) => {
        const existing = ctx.tagsDb.getTagByName(name);
        if (existing) {
          return `Tag '${name}' already exists.`;
        }
        ctx.tagsDb.createTag(name, color || null);
        return `✅ Tag '${name}' created.`;
      },
    }),

    delete_tag: tool({
      description: 'Delete a tag',
      inputSchema: z.object({
        name: z.string().describe('Tag name to delete'),
      }),
      execute: async ({ name }: { name: string }) => {
        const tag = ctx.tagsDb.getTagByName(name);
        if (!tag) {
          return `Tag '${name}' not found.`;
        }
        ctx.tagsDb.deleteTag(tag.id);
        return `✅ Tag '${name}' deleted.`;
      },
    }),

    add_tag_to_note: tool({
      description: 'Add a tag to a note',
      inputSchema: z.object({
        noteName: z.string().describe('Name of the note'),
        tagName: z.string().describe('Name of the tag'),
      }),
      execute: async ({ noteName, tagName }: { noteName: string; tagName: string }) => {
        const note = ctx.notesDb.getNoteByName(noteName);
        if (!note) {
          return `Note '${noteName}' not found.`;
        }
        const tag = ctx.tagsDb.getOrCreateTag(tagName);
        ctx.tagsDb.addTagToNote(note.id, tag.id);
        return `✅ Tag '${tagName}' added to '${noteName}'.`;
      },
    }),

    remove_tag_from_note: tool({
      description: 'Remove a tag from a note',
      inputSchema: z.object({
        noteName: z.string().describe('Name of the note'),
        tagName: z.string().describe('Name of the tag'),
      }),
      execute: async ({ noteName, tagName }: { noteName: string; tagName: string }) => {
        const note = ctx.notesDb.getNoteByName(noteName);
        const tag = ctx.tagsDb.getTagByName(tagName);
        if (!note) {
          return `Note '${noteName}' not found.`;
        }
        if (!tag) {
          return `Tag '${tagName}' not found.`;
        }
        ctx.tagsDb.removeTagFromNote(note.id, tag.id);
        return `✅ Tag '${tagName}' removed from '${noteName}'.`;
      },
    }),

    get_notes_by_tag: tool({
      description: 'Get all notes that have a specific tag',
      inputSchema: z.object({
        tagName: z.string().describe('Tag name to search for'),
      }),
      execute: async ({ tagName }: { tagName: string }) => {
        const tag = ctx.tagsDb.getTagByName(tagName);
        if (!tag) {
          return `Tag '${tagName}' not found.`;
        }
        const noteIds = ctx.tagsDb.getNotesWithTag(tag.id);
        if (noteIds.length === 0) {
          return `No notes found with tag '${tagName}'.`;
        }
        // Get note names from IDs
        const noteNames = noteIds.map(id => {
          const note = ctx.notesDb.getNoteById(id);
          return note ? note.name : `(note #${id})`;
        });
        return `Notes with #${tagName}:\n${noteNames.map(n => `- ${n}`).join('\n')}`;
      },
    }),
  };
}
