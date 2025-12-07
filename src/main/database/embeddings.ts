import { getDatabase, dateToSqliteTimestamp, sqliteTimestampToDate } from './connection';
import { getAIClient } from '../ai/client';
import { EMBEDDING_CHUNK_SIZE, EMBEDDING_CHUNK_OVERLAP, SEMANTIC_SEARCH_LIMIT } from '../../shared/constants';
import { createHash } from 'crypto';

// Maximum chunks per note to avoid excessive API costs
const MAX_CHUNKS_PER_NOTE = 10;

export interface EmbeddingRecord {
  id: number;
  notePath: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  tokenCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SemanticSearchResult {
  notePath: string;
  chunkText: string;
  similarity: number;
  chunkIndex: number;
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into overlapping chunks
 */
export function chunkText(text: string, maxTokens = EMBEDDING_CHUNK_SIZE, overlapTokens = EMBEDDING_CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  
  // Split by paragraphs first for more natural boundaries
  const paragraphs = text.split(/\n\n+/);
  
  let currentChunk = '';
  let currentTokens = 0;
  
  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);
    
    // If single paragraph exceeds max, split by sentences
    if (paragraphTokens > maxTokens) {
      // First, save current chunk if any
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentTokens = 0;
      }
      
      // Split long paragraph by sentences
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const sentenceTokens = estimateTokens(sentence);
        
        if (currentTokens + sentenceTokens > maxTokens && currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          // Keep overlap from the end
          const words = currentChunk.split(/\s+/);
          const overlapWords = Math.ceil(overlapTokens / 1.5); // ~1.5 tokens per word
          currentChunk = words.slice(-overlapWords).join(' ') + ' ' + sentence;
          currentTokens = estimateTokens(currentChunk);
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
          currentTokens += sentenceTokens;
        }
      }
    } else if (currentTokens + paragraphTokens > maxTokens) {
      // Save current chunk and start new one with overlap
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        // Keep some overlap
        const words = currentChunk.split(/\s+/);
        const overlapWords = Math.ceil(overlapTokens / 1.5);
        currentChunk = words.slice(-overlapWords).join(' ') + '\n\n' + paragraph;
        currentTokens = estimateTokens(currentChunk);
      } else {
        currentChunk = paragraph;
        currentTokens = paragraphTokens;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentTokens += paragraphTokens;
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  // Limit to MAX_CHUNKS_PER_NOTE
  return chunks.slice(0, MAX_CHUNKS_PER_NOTE);
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Generate content hash to check if re-indexing is needed
 */
export function contentHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * Get all embeddings for a note
 */
export function getEmbeddingsForNote(notePath: string): EmbeddingRecord[] {
  const db = getDatabase();
  if (!db) return [];
  
  const rows = db.prepare(`
    SELECT id, note_path, chunk_index, chunk_text, embedding, token_count, created_at, updated_at
    FROM note_embeddings
    WHERE note_path = ?
    ORDER BY chunk_index
  `).all(notePath) as {
    id: number;
    note_path: string;
    chunk_index: number;
    chunk_text: string;
    embedding: Buffer;
    token_count: number;
    created_at: number;
    updated_at: number;
  }[];
  
  return rows.map(row => ({
    id: row.id,
    notePath: row.note_path,
    chunkIndex: row.chunk_index,
    chunkText: row.chunk_text,
    embedding: JSON.parse(row.embedding.toString()),
    tokenCount: row.token_count,
    createdAt: sqliteTimestampToDate(row.created_at),
    updatedAt: sqliteTimestampToDate(row.updated_at),
  }));
}

/**
 * Get all embeddings from the database
 */
export function getAllEmbeddings(): EmbeddingRecord[] {
  const db = getDatabase();
  if (!db) return [];
  
  const rows = db.prepare(`
    SELECT id, note_path, chunk_index, chunk_text, embedding, token_count, created_at, updated_at
    FROM note_embeddings
    ORDER BY note_path, chunk_index
  `).all() as {
    id: number;
    note_path: string;
    chunk_index: number;
    chunk_text: string;
    embedding: Buffer;
    token_count: number;
    created_at: number;
    updated_at: number;
  }[];
  
  return rows.map(row => ({
    id: row.id,
    notePath: row.note_path,
    chunkIndex: row.chunk_index,
    chunkText: row.chunk_text,
    embedding: JSON.parse(row.embedding.toString()),
    tokenCount: row.token_count,
    createdAt: sqliteTimestampToDate(row.created_at),
    updatedAt: sqliteTimestampToDate(row.updated_at),
  }));
}

/**
 * Get the content hash for a note's embeddings
 */
export function getEmbeddingsHash(notePath: string): string | null {
  const db = getDatabase();
  if (!db) return null;
  
  const row = db.prepare(`
    SELECT content_hash FROM note_embeddings WHERE note_path = ? LIMIT 1
  `).get(notePath) as { content_hash: string | null } | undefined;
  
  return row?.content_hash || null;
}

/**
 * Delete embeddings for a note
 */
export function deleteEmbeddings(notePath: string): void {
  const db = getDatabase();
  if (!db) return;
  
  db.prepare('DELETE FROM note_embeddings WHERE note_path = ?').run(notePath);
}

/**
 * Delete embeddings for notes matching a pattern (e.g., from .history folder)
 */
export function deleteEmbeddingsMatching(pattern: string): number {
  const db = getDatabase();
  if (!db) return 0;
  
  const result = db.prepare('DELETE FROM note_embeddings WHERE note_path LIKE ?').run(`%${pattern}%`);
  return result.changes;
}

/**
 * Index a note's content - generates embeddings for all chunks
 * Only re-indexes if content has changed (based on hash)
 */
export async function indexNote(notePath: string, content: string): Promise<void> {
  const db = getDatabase();
  const aiClient = getAIClient();
  
  if (!db || !aiClient) {
    console.warn('Cannot index note: database or AI client not initialized');
    return;
  }
  
  // Skip if content is too short
  if (content.trim().length < 50) {
    console.log(`Skipping indexing for ${notePath}: content too short`);
    deleteEmbeddings(notePath);
    return;
  }
  
  // Check if content has changed using hash
  const newHash = contentHash(content);
  const existingHash = getEmbeddingsHash(notePath);
  
  if (existingHash === newHash) {
    // Content hasn't changed, skip re-indexing
    console.log(`⏭️ Skipping ${notePath}: content unchanged`);
    return;
  }
  
  const chunks = chunkText(content);
  
  if (chunks.length === 0) {
    deleteEmbeddings(notePath);
    return;
  }
  
  console.log(`📊 Indexing ${notePath}: ${chunks.length} chunks`);
  
  try {
    // Generate embeddings for all chunks
    const embeddings = await aiClient.embedMany(chunks);
    
    const now = dateToSqliteTimestamp(new Date());
    
    // Delete old embeddings for this note
    deleteEmbeddings(notePath);
    
    // Insert new embeddings with content hash
    const insertStmt = db.prepare(`
      INSERT INTO note_embeddings (note_path, chunk_index, chunk_text, embedding, token_count, content_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const transaction = db.transaction(() => {
      chunks.forEach((chunk, index) => {
        insertStmt.run(
          notePath,
          index,
          chunk,
          Buffer.from(JSON.stringify(embeddings[index])),
          estimateTokens(chunk),
          newHash,
          now,
          now
        );
      });
    });
    
    transaction();
    
    console.log(`✅ Indexed ${notePath}: ${chunks.length} chunks`);
  } catch (error) {
    console.error(`❌ Failed to index ${notePath}:`, error);
    throw error;
  }
}

/**
 * Semantic search across all notes
 */
export async function semanticSearch(query: string, limit = SEMANTIC_SEARCH_LIMIT): Promise<SemanticSearchResult[]> {
  const aiClient = getAIClient();
  
  if (!aiClient) {
    console.warn('Cannot search: AI client not initialized');
    return [];
  }
  
  // Get query embedding
  const queryEmbedding = await aiClient.embed(query);
  
  // Get all embeddings
  const allEmbeddings = getAllEmbeddings();
  
  if (allEmbeddings.length === 0) {
    return [];
  }
  
  // Calculate similarities
  const results: SemanticSearchResult[] = allEmbeddings.map(record => ({
    notePath: record.notePath,
    chunkText: record.chunkText,
    similarity: cosineSimilarity(queryEmbedding, record.embedding),
    chunkIndex: record.chunkIndex,
  }));
  
  // Sort by similarity (descending) and take top results
  results.sort((a, b) => b.similarity - a.similarity);
  
  // Deduplicate by note path (keep highest similarity chunk per note)
  const seenPaths = new Set<string>();
  const deduped: SemanticSearchResult[] = [];
  
  for (const result of results) {
    if (!seenPaths.has(result.notePath)) {
      seenPaths.add(result.notePath);
      deduped.push(result);
      if (deduped.length >= limit) break;
    }
  }
  
  return deduped;
}

/**
 * Reindex all notes
 */
export async function reindexAllNotes(notesDirectory: string): Promise<{ indexed: number; errors: number }> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  let indexed = 0;
  let errors = 0;
  
  // Folders to skip during indexing
  const skipFolders = ['.history', '.trash', '.git', 'node_modules'];
  
  async function processDirectory(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip hidden and system folders
        if (skipFolders.includes(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        await processDirectory(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          await indexNote(fullPath, content);
          indexed++;
        } catch (err) {
          console.error(`Failed to index ${fullPath}:`, err);
          errors++;
        }
      }
    }
  }
  
  try {
    await processDirectory(notesDirectory);
  } catch (err) {
    console.error('Failed to reindex notes:', err);
  }
  
  return { indexed, errors };
}

/**
 * Get indexing stats
 */
export function getIndexingStats(): { totalNotes: number; totalChunks: number; lastUpdated: Date | null } {
  const db = getDatabase();
  if (!db) return { totalNotes: 0, totalChunks: 0, lastUpdated: null };
  
  const stats = db.prepare(`
    SELECT 
      COUNT(DISTINCT note_path) as total_notes,
      COUNT(*) as total_chunks,
      MAX(updated_at) as last_updated
    FROM note_embeddings
  `).get() as { total_notes: number; total_chunks: number; last_updated: number | null };
  
  return {
    totalNotes: stats.total_notes,
    totalChunks: stats.total_chunks,
    lastUpdated: stats.last_updated ? sqliteTimestampToDate(stats.last_updated) : null,
  };
}
