import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../../stores/app-store';
import { useNotes } from '../../hooks/useNotes';
import { Search, FileText, X } from 'lucide-react';
import type { NoteSearchResult } from '../../../shared/types';

export default function SearchPanel() {
  const { searchQuery, setSearchQuery } = useAppStore();
  const { searchNotes, openNote } = useNotes();
  const [results, setResults] = useState<NoteSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const searchResults = await searchNotes(query);
      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchNotes]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  const handleResultClick = async (result: NoteSearchResult) => {
    // Load the note metadata and open it
    const notes = await window.electron.notes.list();
    const note = notes.find(n => n.name === result.noteName);
    if (note) {
      openNote(note);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search size={16} className="absolute left-2 top-1/2 -translate-y-1/2 text-subtext0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar notas..."
            className="w-full pl-8 pr-8 py-1.5 text-sm bg-surface0 border border-surface1 rounded
                       focus:outline-none focus:border-lavender text-text placeholder-subtext0"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-subtext0 hover:text-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isSearching ? (
          <div className="px-4 py-8 text-center text-subtext0 text-sm">
            Buscando...
          </div>
        ) : results.length > 0 ? (
          <div className="py-1">
            {results.map((result, index) => (
              <button
                key={`${result.noteId}-${index}`}
                onClick={() => handleResultClick(result)}
                className="w-full px-3 py-2 text-left hover:bg-surface0 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm text-text">
                  <FileText size={14} className="text-lavender flex-shrink-0" />
                  <span className="truncate font-medium">{result.noteName}</span>
                </div>
                {result.snippet && (
                  <div 
                    className="mt-1 text-xs text-subtext0 line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                )}
              </button>
            ))}
          </div>
        ) : searchQuery ? (
          <div className="px-4 py-8 text-center text-subtext0 text-sm">
            <Search size={32} className="mx-auto mb-2 opacity-50" />
            <p>No se encontraron resultados</p>
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-subtext0 text-sm">
            <Search size={32} className="mx-auto mb-2 opacity-50" />
            <p>Escribe para buscar</p>
          </div>
        )}
      </div>

      {/* Search tips */}
      {!searchQuery && (
        <div className="px-3 py-2 border-t border-surface0 text-xs text-subtext0">
          <p>Tip: Usa <kbd className="px-1 py-0.5 bg-surface0 rounded">Ctrl+P</kbd> para búsqueda rápida</p>
        </div>
      )}
    </div>
  );
}
