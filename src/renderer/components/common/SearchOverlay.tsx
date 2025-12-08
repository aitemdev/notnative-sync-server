import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, ChevronUp, ChevronDown, FileText } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';
import { useNotes } from '../../hooks/useNotes';
import { getGlobalEditorView } from '../editor/VimEditor';
import type { NoteSearchResult } from '../../../shared/types';

export type SearchMode = 'global' | 'note';

interface NoteMatch {
  line: number;
  col: number;
  text: string;
  from: number;
  to: number;
}

interface SearchOverlayProps {
  isOpen: boolean;
  mode: SearchMode;
  onClose: () => void;
}

export function SearchOverlay({ 
  isOpen, 
  mode, 
  onClose, 
}: SearchOverlayProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [globalResults, setGlobalResults] = useState<NoteSearchResult[]>([]);
  const [noteMatches, setNoteMatches] = useState<NoteMatch[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const resultItemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  
  const { searchNotes, openNote } = useNotes();
  const { currentNoteContent } = useAppStore();

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isOpen, mode]);

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setGlobalResults([]);
      setNoteMatches([]);
      setSelectedIndex(0);
      setCurrentMatchIndex(0);
    }
  }, [isOpen]);

  // Find matches in the current note content
  const findNoteMatches = useCallback((searchQuery: string): NoteMatch[] => {
    if (!searchQuery.trim() || !currentNoteContent) {
      return [];
    }

    const results: NoteMatch[] = [];
    const searchLower = searchQuery.toLowerCase();
    const lines = currentNoteContent.split('\n');
    
    let lineStart = 0;
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      const lineLower = line.toLowerCase();
      let searchPos = 0;
      
      while (true) {
        const index = lineLower.indexOf(searchLower, searchPos);
        if (index === -1) break;
        
        const from = lineStart + index;
        const to = from + searchQuery.length;
        
        // Get context around the match
        const contextStart = Math.max(0, index - 15);
        const contextEnd = Math.min(line.length, index + searchQuery.length + 30);
        let context = line.slice(contextStart, contextEnd);
        
        if (contextStart > 0) context = '...' + context;
        if (contextEnd < line.length) context = context + '...';
        
        results.push({
          line: lineNum + 1,
          col: index + 1,
          text: context,
          from,
          to,
        });
        
        searchPos = index + 1;
      }
      
      lineStart += line.length + 1; // +1 for newline
    }
    
    return results;
  }, [currentNoteContent]);

  // Global search with debounce
  useEffect(() => {
    if (mode !== 'global' || !query.trim()) {
      setGlobalResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchNotes(query);
        setGlobalResults(results);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Search error:', error);
        setGlobalResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, mode, searchNotes]);

  // Note search - find matches
  useEffect(() => {
    if (mode !== 'note') {
      setNoteMatches([]);
      return;
    }

    const timer = setTimeout(() => {
      const matches = findNoteMatches(query);
      setNoteMatches(matches);
      setCurrentMatchIndex(0);
      
      // Navigate to first match
      if (matches.length > 0) {
        navigateToMatch(matches[0]);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [query, mode, findNoteMatches]);

  // Navigate to a match in the editor
  const navigateToMatch = useCallback((match: NoteMatch) => {
    const editorView = getGlobalEditorView();
    if (!editorView || !match) return;

    editorView.dispatch({
      selection: { anchor: match.from, head: match.to },
      scrollIntoView: true,
    });
  }, []);

  // Go to a specific match by index
  const goToMatchByIndex = useCallback((index: number) => {
    if (noteMatches.length === 0) return;
    
    // Wrap around
    let newIndex = index;
    if (newIndex < 0) newIndex = noteMatches.length - 1;
    if (newIndex >= noteMatches.length) newIndex = 0;
    
    setCurrentMatchIndex(newIndex);
    navigateToMatch(noteMatches[newIndex]);
  }, [noteMatches, navigateToMatch]);

  // Scroll selected item into view and focus it
  useEffect(() => {
    if (mode === 'global' && resultItemsRef.current[selectedIndex]) {
      resultItemsRef.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, mode]);

  // Handle keyboard navigation in input
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      setTimeout(() => {
        const editorView = getGlobalEditorView();
        editorView?.focus();
      }, 50);
      return;
    }

    if (mode === 'global') {
      if (e.key === 'ArrowDown' && globalResults.length > 0) {
        e.preventDefault();
        setSelectedIndex(0);
        // Focus the first result item
        resultItemsRef.current[0]?.focus();
      } else if (e.key === 'Enter' && globalResults.length > 0) {
        e.preventDefault();
        handleSelectGlobalResult(globalResults[selectedIndex]);
      }
    } else {
      // Note search navigation
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        goToMatchByIndex(currentMatchIndex + 1);
      } else if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        goToMatchByIndex(currentMatchIndex - 1);
      }
    }
  }, [mode, globalResults, selectedIndex, currentMatchIndex, onClose, goToMatchByIndex]);

  // Handle keyboard navigation in results list
  const handleResultKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      setTimeout(() => {
        const editorView = getGlobalEditorView();
        editorView?.focus();
      }, 50);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIndex = Math.min(index + 1, globalResults.length - 1);
      setSelectedIndex(newIndex);
      resultItemsRef.current[newIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index === 0) {
        // Go back to input
        inputRef.current?.focus();
      } else {
        const newIndex = index - 1;
        setSelectedIndex(newIndex);
        resultItemsRef.current[newIndex]?.focus();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSelectGlobalResult(globalResults[index]);
    }
  }, [globalResults, onClose]);

  // Handle selecting a global search result
  const handleSelectGlobalResult = async (result: NoteSearchResult) => {
    try {
      const notes = await window.electron.notes.list();
      const note = notes.find(n => n.name === result.noteName);
      if (note) {
        openNote(note);
        onClose();
      }
    } catch (error) {
      console.error('Error opening note:', error);
    }
  };

  if (!isOpen) return null;

  const totalMatches = mode === 'global' ? globalResults.length : noteMatches.length;
  const currentMatch = mode === 'global' ? selectedIndex + 1 : currentMatchIndex + 1;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center pt-16 pointer-events-none">
      <div 
        className="bg-mantle border border-surface0 rounded-lg shadow-2xl overflow-hidden pointer-events-auto"
        style={{ width: 'min(90vw, 500px)' }}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-surface0">
          <Search size={16} className="text-subtext0 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={mode === 'global' 
              ? t('search.searchNotes', 'Buscar en todas las notas...') 
              : t('search.searchInNote', 'Buscar en la nota actual...')
            }
            className="flex-1 bg-transparent text-sm text-text placeholder-subtext0 focus:outline-none"
          />
          
          {/* Match counter */}
          {query && (
            <span className="text-xs text-subtext0 flex-shrink-0">
              {totalMatches > 0 ? `${currentMatch}/${totalMatches}` : t('search.noMatches', '0 resultados')}
            </span>
          )}
          
          {/* Navigation buttons for note search */}
          {mode === 'note' && totalMatches > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToMatchByIndex(currentMatchIndex - 1)}
                className="p-1 rounded hover:bg-surface0 text-subtext0 hover:text-text transition-colors"
                title={t('search.previousMatch', 'Anterior (Shift+Enter)')}
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => goToMatchByIndex(currentMatchIndex + 1)}
                className="p-1 rounded hover:bg-surface0 text-subtext0 hover:text-text transition-colors"
                title={t('search.nextMatch', 'Siguiente (Enter)')}
              >
                <ChevronDown size={14} />
              </button>
            </div>
          )}
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface0 text-subtext0 hover:text-text transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Mode indicator */}
        <div className="px-3 py-1 bg-surface0/50 border-b border-surface0">
          <span className="text-xs text-subtext0">
            {mode === 'global' 
              ? t('search.globalMode', '🔍 Búsqueda global (Ctrl+F)')
              : t('search.noteMode', '📄 Buscar en nota (Alt+F)')
            }
          </span>
        </div>

        {/* Global search results */}
        {mode === 'global' && (
          <div 
            ref={resultsRef}
            className="max-h-80 overflow-y-auto"
          >
            {isSearching ? (
              <div className="px-4 py-8 text-center text-subtext0 text-sm">
                {t('search.searching', 'Buscando...')}
              </div>
            ) : globalResults.length > 0 ? (
              <div className="py-1">
                {globalResults.map((result, index) => (
                  <button
                    key={`${result.noteId}-${index}`}
                    ref={(el) => { resultItemsRef.current[index] = el; }}
                    onClick={() => handleSelectGlobalResult(result)}
                    onKeyDown={(e) => handleResultKeyDown(e, index)}
                    onFocus={() => setSelectedIndex(index)}
                    className={`w-full px-3 py-2 text-left transition-colors outline-none ${
                      index === selectedIndex 
                        ? 'bg-lavender/20 text-text ring-1 ring-inset ring-lavender/50' 
                        : 'hover:bg-surface0 text-subtext1'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <FileText size={14} className="text-lavender flex-shrink-0" />
                      <span className="truncate font-medium">{result.noteName}</span>
                    </div>
                    {result.snippet && (
                      <div 
                        className="mt-1 text-xs text-subtext0 line-clamp-2 ml-5"
                        dangerouslySetInnerHTML={{ __html: result.snippet }}
                      />
                    )}
                  </button>
                ))}
              </div>
            ) : query ? (
              <div className="px-4 py-8 text-center text-subtext0 text-sm">
                <Search size={32} className="mx-auto mb-2 opacity-50" />
                <p>{t('search.noResults', 'No se encontraron resultados')}</p>
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-subtext0 text-sm">
                <p>{t('search.typeToSearch', 'Escribe para buscar...')}</p>
              </div>
            )}
          </div>
        )}

        {/* Note search - just show message, no list needed */}
        {mode === 'note' && !query && (
          <div className="px-4 py-6 text-center text-subtext0 text-sm">
            <p>{t('search.typeToSearchNote', 'Escribe para buscar en la nota...')}</p>
          </div>
        )}

        {mode === 'note' && query && noteMatches.length === 0 && (
          <div className="px-4 py-6 text-center text-subtext0 text-sm">
            <p>{t('search.noMatches', 'No se encontraron coincidencias')}</p>
          </div>
        )}

        {/* Keyboard hints */}
        <div className="px-3 py-2 border-t border-surface0 bg-surface0/30">
          <div className="flex items-center justify-between text-xs text-subtext0">
            <div className="flex items-center gap-3">
              {mode === 'global' ? (
                <>
                  <span><kbd className="px-1 py-0.5 bg-surface0 rounded text-[10px]">↑↓</kbd> navegar</span>
                  <span><kbd className="px-1 py-0.5 bg-surface0 rounded text-[10px]">Enter</kbd> abrir</span>
                </>
              ) : (
                <>
                  <span><kbd className="px-1 py-0.5 bg-surface0 rounded text-[10px]">Enter</kbd> siguiente</span>
                  <span><kbd className="px-1 py-0.5 bg-surface0 rounded text-[10px]">Shift+Enter</kbd> anterior</span>
                </>
              )}
            </div>
            <span><kbd className="px-1 py-0.5 bg-surface0 rounded text-[10px]">Esc</kbd> cerrar</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SearchOverlay;
