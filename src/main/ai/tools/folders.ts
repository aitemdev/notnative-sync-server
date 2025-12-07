import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from '../context';

export function createFolderTools(ctx: ToolContext) {
  return {
    list_folders: tool({
      description: 'List all folders in the notes directory',
      inputSchema: z.object({}),
      execute: async () => {
        const folders = ctx.notesDb.getFolders();
        if (folders.length === 0) {
          return 'No folders found.';
        }
        return `Folders:\n${folders.map(f => `- ${f}`).join('\n')}`;
      },
    }),

    create_folder: tool({
      description: 'Create a new folder',
      inputSchema: z.object({
        path: z.string().describe('Folder path (e.g., "Projects/Web")'),
      }),
      execute: async ({ path: folderPath }: { path: string }) => {
        try {
          await ctx.notesDir.createFolder(folderPath);
          return `✅ Folder '${folderPath}' created.`;
        } catch (error) {
          return `Error creating folder: ${error}`;
        }
      },
    }),

    delete_folder: tool({
      description: 'Delete a folder and optionally its contents',
      inputSchema: z.object({
        path: z.string().describe('Folder path to delete'),
        recursive: z.boolean().optional().describe('Delete contents recursively (default: false)'),
      }),
      execute: async ({ path: folderPath, recursive = false }: { path: string; recursive?: boolean }) => {
        try {
          await ctx.notesDir.deleteFolder(folderPath, recursive);
          return `✅ Folder '${folderPath}' deleted.`;
        } catch (error) {
          return `Error deleting folder: ${error}`;
        }
      },
    }),

    rename_folder: tool({
      description: 'Rename a folder',
      inputSchema: z.object({
        oldPath: z.string().describe('Current folder path'),
        newPath: z.string().describe('New folder path'),
      }),
      execute: async ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
        try {
          await ctx.notesDir.renameFolder(oldPath, newPath);
          return `✅ Folder renamed from '${oldPath}' to '${newPath}'.`;
        } catch (error) {
          return `Error renaming folder: ${error}`;
        }
      },
    }),
  };
}
