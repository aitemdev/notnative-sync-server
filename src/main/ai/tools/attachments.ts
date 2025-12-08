import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from '../context';

export function createAttachmentTools(ctx: ToolContext) {
  return {
    // === List Attachments ===
    list_attachments: tool({
      description: 'List all attachments in the notes database. Returns filename, note path, file size, and attachment URL. Use this to discover available files.',
      inputSchema: z.object({
        noteName: z.string().optional().describe('Optional: filter by note name (without .md extension). Leave empty to list all attachments.'),
      }),
      execute: async ({ noteName }: { noteName?: string }) => {
        let attachments;
        
        if (noteName) {
          // Find note by name
          const note = ctx.notesDb.getNoteByName(noteName);
          if (!note) {
            return `Note "${noteName}" not found.`;
          }
          attachments = ctx.attachmentsDb.getAttachmentsByNote(note.path);
        } else {
          // Get all attachments
          attachments = ctx.attachmentsDb.getAllAttachments();
        }

        if (attachments.length === 0) {
          return noteName 
            ? `No attachments found in note "${noteName}".`
            : 'No attachments found in the database.';
        }

        // Format attachments with attachment:// URLs (one per line without bullet points)
        const formatted = attachments.map(att => {
          const sizeMB = (att.fileSize / 1024 / 1024).toFixed(2);
          const sizeKB = (att.fileSize / 1024).toFixed(2);
          const sizeStr = att.fileSize > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
          
          const noteName = att.notePath.split('/').pop()?.replace('.md', '') || 'Unknown';
          return `[📎 ${att.fileName}](attachment://${att.filePath})\n*Nota: ${noteName} • Tamaño: ${sizeStr}*`;
        }).join('\n\n');

        const totalSize = attachments.reduce((acc, att) => acc + att.fileSize, 0);
        const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
        
        return `Encontré **${attachments.length} archivo(s) adjunto(s)** (Total: ${totalSizeMB} MB)\n\n${formatted}`;
      },
    }),

    // === Search Attachments by Name ===
    search_attachments_by_name: tool({
      description: 'Search for attachments by filename using SQL LIKE pattern matching. Use % as wildcard. Returns matching files with their note locations and attachment URLs.',
      inputSchema: z.object({
        query: z.string().describe('Search query for filename (case-insensitive). Use % as wildcard (e.g., "%.pdf", "image%", "%report%")'),
        limit: z.number().optional().default(50).describe('Maximum number of results to return (default: 50)'),
      }),
      execute: async ({ query, limit = 50 }: { query: string; limit?: number }) => {
        const attachments = ctx.attachmentsDb.searchAttachmentsByName(query, limit);

        if (attachments.length === 0) {
          return `No attachments found matching "${query}".`;
        }

        // Format results with attachment:// URLs (one per line without bullet points)
        const formatted = attachments.map(att => {
          const sizeMB = (att.fileSize / 1024 / 1024).toFixed(2);
          const sizeKB = (att.fileSize / 1024).toFixed(2);
          const sizeStr = att.fileSize > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
          
          const noteName = att.notePath.split('/').pop()?.replace('.md', '') || 'Unknown';
          return `[📎 ${att.fileName}](attachment://${att.filePath})\n*Nota: ${noteName} • Tamaño: ${sizeStr}*`;
        }).join('\n\n');

        const totalSize = attachments.reduce((acc, att) => acc + att.fileSize, 0);
        const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
        
        return `Encontré **${attachments.length} archivo(s) que coincide(n) con "${query}"** (Total: ${totalSizeMB} MB)\n\n${formatted}`;
      },
    }),

    // === Get Attachment Stats ===
    get_attachment_stats: tool({
      description: 'Get statistics about attachments in the database: total count, total size, and number of orphaned attachments (files that no longer exist on disk).',
      inputSchema: z.object({}),
      execute: async () => {
        const stats = ctx.attachmentsDb.getStats();
        
        const totalSizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
        const totalSizeGB = (stats.totalSize / 1024 / 1024 / 1024).toFixed(2);
        const sizeStr = stats.totalSize > 1024 * 1024 * 1024 
          ? `${totalSizeGB} GB` 
          : `${totalSizeMB} MB`;

        let result = `**Attachment Statistics**\n\n`;
        result += `- Total attachments: ${stats.totalAttachments}\n`;
        result += `- Total size: ${sizeStr}\n`;
        result += `- Orphaned attachments: ${stats.orphanedAttachments.length}`;

        if (stats.orphanedAttachments.length > 0) {
          result += `\n\n**Orphaned files (missing from disk):**\n`;
          result += stats.orphanedAttachments
            .map(att => `- ${att.fileName} (from note: ${att.notePath})`)
            .join('\n');
        }

        return result;
      },
    }),
  };
}
