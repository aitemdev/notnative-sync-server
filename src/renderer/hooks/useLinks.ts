import { useState, useEffect, useCallback } from 'react';
import type { BacklinkInfo, NoteLinkWithMetadata } from '../../shared/types';

interface UseLinksReturn {
  backlinks: BacklinkInfo[];
  outgoingLinks: NoteLinkWithMetadata[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage links for a note
 */
export function useLinks(noteId: number | null): UseLinksReturn {
  const [backlinks, setBacklinks] = useState<BacklinkInfo[]>([]);
  const [outgoingLinks, setOutgoingLinks] = useState<NoteLinkWithMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    if (!noteId) {
      setBacklinks([]);
      setOutgoingLinks([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [incomingLinks, outLinks] = await Promise.all([
        window.electron.links.getIncoming(noteId),
        window.electron.links.getOutgoing(noteId),
      ]);

      setBacklinks(incomingLinks);
      setOutgoingLinks(outLinks);
    } catch (err) {
      console.error('Error fetching links:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch links');
      setBacklinks([]);
      setOutgoingLinks([]);
    } finally {
      setIsLoading(false);
    }
  }, [noteId]);

  // Fetch links when noteId changes
  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  return {
    backlinks,
    outgoingLinks,
    isLoading,
    error,
    refetch: fetchLinks,
  };
}
