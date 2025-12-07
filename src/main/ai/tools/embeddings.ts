import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from '../context';
import { semanticSearch } from '../../database/embeddings';

const MIN_SIMILARITY_THRESHOLD = 0.50; // 50% minimum similarity

export function createEmbeddingTools(_ctx: ToolContext) {
  return {
    semantic_search: tool({
      description: 'Search for notes by meaning/semantic similarity using AI embeddings. Use this when you need to find notes conceptually related to a topic, even if they don\'t contain exact keywords. Returns the most semantically similar note chunks with at least 50% similarity.',
      inputSchema: z.object({
        query: z.string().describe('The search query - describe what you\'re looking for conceptually'),
        limit: z.number().optional().describe('Maximum number of results to return (default: 5)'),
      }),
      execute: async ({ query, limit = 5 }: { query: string; limit?: number }) => {
        try {
          const results = await semanticSearch(query, limit);
          
          // Filter results with similarity >= 50%
          const relevantResults = results.filter(r => r.similarity >= MIN_SIMILARITY_THRESHOLD);
          
          if (relevantResults.length === 0) {
            return 'No notes found with sufficient semantic similarity (≥50%). The indexed notes may not contain relevant information about this topic.';
          }
          
          // Format results with clear source attribution
          const formattedResults = relevantResults.map((r, i) => {
            const noteName = r.notePath.split('/').pop()?.replace('.md', '') || r.notePath;
            const similarity = (r.similarity * 100).toFixed(1);
            const preview = r.chunkText.slice(0, 300).trim();
            const truncated = r.chunkText.length > 300 ? '...' : '';
            
            return `### ${i + 1}. ${noteName}\n**Relevancia:** ${similarity}%\n**Contenido:**\n> ${preview}${truncated}`;
          }).join('\n\n');
          
          // Add sources section
          const sources = relevantResults.map(r => {
            const noteName = r.notePath.split('/').pop()?.replace('.md', '') || r.notePath;
            return `- [[${noteName}]]`;
          });
          const uniqueSources = [...new Set(sources)];
          
          return `${formattedResults}\n\n---\n**📚 Fuentes consultadas:**\n${uniqueSources.join('\n')}`;
        } catch (error) {
          console.error('Semantic search error:', error);
          return `Error performing semantic search: ${error}. Notes may not be indexed yet - try using search_notes instead.`;
        }
      },
    }),
  };
}
