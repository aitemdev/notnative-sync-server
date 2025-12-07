import { tool } from 'ai';
import { z } from 'zod';
import path from 'path';
import type { ToolContext } from '../context';

// Normalize a folder path to a safe relative form; return null if it escapes root
function normalizeFolderPath(folderPath: string): string | null {
  const trimmed = folderPath.trim();
  if (!trimmed) return '';
  const normalized = path.normalize(trimmed).replace(/\\/g, '/');
  if (path.isAbsolute(trimmed) || normalized.startsWith('..')) return null;
  return normalized.replace(/^\.\//, '').replace(/\/+$/, '');
}

export function createFolderTools(ctx: ToolContext) {
  return {
    list_folders: tool({
      description: 'List all folders in the notes directory',
      inputSchema: z.object({}),
      execute: async () => {
        // Use notesDir.listAllFolders() to get ALL folders (including empty ones)
        const folders = await ctx.notesDir.listAllFolders();
        if (folders.length === 0) {
          return 'No folders found.';
        }
        return `Folders:\n${folders.map(f => `- ${f}`).join('\n')}`;
      },
    }),

    create_folder: tool({
      description: 'Create a new folder. Supports nested paths - parent folders are created automatically if they don\'t exist.',
      inputSchema: z.object({
        path: z.string().describe('Folder path relative to notes root. Use "/" for nesting (e.g., "Projects", "Projects/Web", "Work/2024/Reports")'),
      }),
      execute: async ({ path: folderPath }: { path: string }) => {
        const safePath = normalizeFolderPath(folderPath);
        if (safePath === null) {
          return `Error creating folder: path '${folderPath}' is not allowed (must be relative inside notes root).`;
        }
        try {
          await ctx.notesDir.createFolder(safePath);
          return `✅ Folder '${safePath}' created.`;
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
        const safePath = normalizeFolderPath(folderPath);
        if (safePath === null) {
          return `Error deleting folder: path '${folderPath}' is not allowed (must be relative inside notes root).`;
        }
        try {
          await ctx.notesDir.deleteFolder(safePath, recursive);
          return `✅ Folder '${safePath}' deleted.`;
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
        const safeOld = normalizeFolderPath(oldPath);
        const safeNew = normalizeFolderPath(newPath);
        if (safeOld === null || safeNew === null) {
          return `Error renaming folder: paths must stay inside notes root.`;
        }
        try {
          await ctx.notesDir.renameFolder(safeOld, safeNew);
          return `✅ Folder renamed from '${safeOld}' to '${safeNew}'.`;
        } catch (error) {
          return `Error renaming folder: ${error}`;
        }
      },
    }),

    move_folder: tool({
      description: 'Move a folder to a new parent path (alias of rename_folder, but keeps the same folder name)',
      inputSchema: z.object({
        folder: z.string().describe('Folder path to move'),
        newParent: z.string().describe('Target parent folder (use empty string for root)'),
      }),
      execute: async ({ folder, newParent }: { folder: string; newParent: string }) => {
        const safeFolder = normalizeFolderPath(folder);
        const safeParent = normalizeFolderPath(newParent);
        if (safeFolder === null || safeParent === null) {
          return `Error moving folder: paths must stay inside notes root.`;
        }

        const folderName = safeFolder.split('/').filter(Boolean).pop();
        if (!folderName) {
          return `Error moving folder: invalid folder path '${folder}'.`;
        }
        const targetPath = safeParent ? `${safeParent}/${folderName}` : folderName;
        try {
          await ctx.notesDir.renameFolder(safeFolder, targetPath);
          return `✅ Folder moved from '${safeFolder}' to '${targetPath}'.`;
        } catch (error) {
          return `Error moving folder: ${error}`;
        }
      },
    }),
  };
}
