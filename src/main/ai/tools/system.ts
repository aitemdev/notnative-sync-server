import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import type { ToolContext } from '../context';

export function createSystemTools(ctx: ToolContext) {
  return {
    get_current_datetime: tool({
      description: 'Get the current date and time',
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date();
        return `Current date/time: ${now.toLocaleString()}`;
      },
    }),

    get_workspace_stats: tool({
      description: 'Get statistics about the notes workspace',
      inputSchema: z.object({}),
      execute: async () => {
        const notesCount = ctx.notesDb.getNotesCount();
        const foldersCount = ctx.notesDb.getFoldersCount();
        const tagsCount = ctx.tagsDb.getTagsCount();
        
        return `Workspace Statistics:
- Total Notes: ${notesCount}
- Total Folders: ${foldersCount}
- Total Tags: ${tagsCount}`;
      },
    }),

    create_daily_note: tool({
      description: 'Create a daily note for today (or specified date)',
      inputSchema: z.object({
        date: z.string().optional().describe('Date in YYYY-MM-DD format (default: today)'),
      }),
      execute: async ({ date }: { date?: string }) => {
        const targetDate = date ? new Date(date) : new Date();
        const dateStr = targetDate.toISOString().split('T')[0];
        
        // Check if already exists
        const existing = ctx.notesDb.getNoteByName(dateStr);
        if (existing) {
          return `Daily note for ${dateStr} already exists.`;
        }

        const filePath = ctx.notesDir.resolve(`Daily/${dateStr}.md`);
        const content = `# ${dateStr}

## Tasks
- [ ] 

## Notes

## Reflections

`;
        try {
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, content);
          
          const metadata = ctx.notesDb.createNote(dateStr, filePath, 'Daily');
          ctx.notesDb.indexNoteContent(metadata.id, dateStr, content);
          
          return `✅ Daily note created for ${dateStr}`;
        } catch (error) {
          return `Error creating daily note: ${error}`;
        }
      },
    }),

    generate_toc: tool({
      description: 'Generate a table of contents from a note',
      inputSchema: z.object({
        noteName: z.string().describe('Name of the note'),
      }),
      execute: async ({ noteName }: { noteName: string }) => {
        const metadata = ctx.notesDb.getNoteByName(noteName);
        if (!metadata) {
          return `Note '${noteName}' not found.`;
        }

        try {
          const content = fs.readFileSync(metadata.path, 'utf-8');
          const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
          
          if (headings.length === 0) {
            return 'No headings found in note.';
          }

          const toc = headings.map(h => {
            const level = (h.match(/^#+/) || [''])[0].length;
            const text = h.replace(/^#+\s+/, '');
            const indent = '  '.repeat(level - 1);
            return `${indent}- ${text}`;
          }).join('\n');

          return `Table of Contents for '${noteName}':\n\n${toc}`;
        } catch (error) {
          return `Error generating TOC: ${error}`;
        }
      },
    }),
  };
}
