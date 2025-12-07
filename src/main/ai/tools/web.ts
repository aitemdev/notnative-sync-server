import { tool } from 'ai';
import { z } from 'zod';
import { getBraveApiKey } from '../../settings/store';

interface WebResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchBrave(query: string, maxResults: number, apiKey?: string): Promise<WebResult[]> {
  if (!apiKey) return [];
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', Math.min(maxResults, 10).toString());

  const resp = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.warn('[web_search] Brave search failed:', resp.status, text);
    return [];
  }

  const data = await resp.json() as any;
  const results = data?.web?.results || [];
  return results.slice(0, maxResults).map((r: any) => ({
    title: r.title || r.url || 'Untitled',
    url: r.url,
    snippet: r.description || r.meta_description || '',
  }));
}

async function searchDdgJina(query: string, maxResults: number): Promise<WebResult[]> {
  const url = new URL('https://ddg-api.jina.ai/search');
  url.searchParams.set('q', query);
  url.searchParams.set('max_results', Math.min(maxResults, 10).toString());

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const text = await resp.text();
    console.warn('[web_search] Jina DDG failed:', resp.status, text);
    return [];
  }

  const data = await resp.json() as any;
  const results = Array.isArray(data?.results) ? data.results : [];
  return results.slice(0, maxResults).map((r: any) => ({
    title: r.title || r.url || 'Untitled',
    url: r.url,
    snippet: r.description || r.body || '',
  }));
}

export function createWebTools() {
  return {
    web_search: tool({
      description: 'Search the web for up-to-date information. Returns a short list of titles, snippets, and links.',
      inputSchema: z.object({
        query: z.string().describe('Search query to look up on the web'),
        maxResults: z.number().int().min(1).max(10).optional().describe('Maximum number of results to return (default 5)'),
      }),
      execute: async ({ query, maxResults = 5 }: { query: string; maxResults?: number }) => {
        try {
          const braveKey = getBraveApiKey();

          // Try Brave if key available; fallback to DDG via Jina proxy
          let results: WebResult[] = [];
          if (braveKey) {
            results = await searchBrave(query, maxResults, braveKey);
          }
          if (!results.length) {
            results = await searchDdgJina(query, maxResults);
          }

          if (!results.length) {
            return 'No web results found.';
          }

          const lines = results.map((r, idx) => {
            const snippet = r.snippet ? ` — ${r.snippet}` : '';
            return `- ${idx + 1}. ${r.title}${snippet}\n  ${r.url}`;
          });

          return lines.join('\n');
        } catch (error) {
          return `Error performing web search: ${error}`;
        }
      },
    }),
  };
}
