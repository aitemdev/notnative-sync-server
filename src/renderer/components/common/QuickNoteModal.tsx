import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../stores/app-store';
import { useNotes } from '../../hooks/useNotes';
import { Plus, X } from 'lucide-react';

export function QuickNoteModal() {
  const { t } = useTranslation();
  const { quickNoteOpen, setQuickNoteOpen, folders } = useAppStore();
  const { createNote, loadFolders } = useNotes();

  const [name, setName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFolderSuggestions, setShowFolderSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  const folderOptions = useMemo(() => {
    // Suggest only the next segment under the typed path instead of showing full paths
    const uniqueFolders = Array.from(new Set(folders));
    const input = folderPath.trim();
    const hasTrailingSlash = folderPath.endsWith('/');
    const parts = input.split('/').filter(Boolean);
    const baseParts = hasTrailingSlash ? parts : parts.slice(0, -1);
    const queryPart = hasTrailingSlash ? '' : (parts[parts.length - 1] || '');
    const suggestions = new Set<string>();

    uniqueFolders.forEach((f) => {
      const segments = f.split('/').filter(Boolean);
      if (segments.length === 0 || segments.length <= baseParts.length) return;
      const matchesBase = baseParts.every((p, idx) => segments[idx]?.toLowerCase() === p.toLowerCase());
      if (!matchesBase) return;
      const nextSegment = segments[baseParts.length];
      if (nextSegment.toLowerCase().includes(queryPart.toLowerCase())) {
        const suggestion = [...baseParts, nextSegment].join('/');
        suggestions.add(suggestion);
      }
    });

    return Array.from(suggestions).sort();
  }, [folders, folderPath]);

  // Ensure folders list is ready when opening
  useEffect(() => {
    if (quickNoteOpen && folders.length === 0) {
      loadFolders().catch((err) => console.error('Error loading folders for quick note:', err));
    }
  }, [quickNoteOpen, folders.length, loadFolders]);

  // Close helpers
  const close = useCallback(() => {
    setQuickNoteOpen(false);
    setError(null);
    setLoading(false);
    setName('');
    setFolderPath('');
    // Return focus to editor after closing
    setTimeout(() => {
      const editorEl = document.querySelector('.cm-content') as HTMLElement | null;
      editorEl?.focus();
    }, 0);
  }, [setQuickNoteOpen]);

  // ESC to close
  useEffect(() => {
    if (!quickNoteOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', handleEsc, true);
    return () => window.removeEventListener('keydown', handleEsc, true);
  }, [quickNoteOpen, close]);

  // Keep highlighted suggestion in range when options change
  useEffect(() => {
    if (selectedSuggestion >= folderOptions.length) {
      setSelectedSuggestion(0);
    }
  }, [folderOptions.length, selectedSuggestion]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('common.error') + ': ' + t('notesList.noteNamePlaceholder'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const folderClean = folderPath.trim() || undefined;
      await createNote(name.trim(), undefined, folderClean);
      close();
    } catch (err: any) {
      console.error('Error creating quick note:', err);
      setError(err?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const selectFolderSuggestion = useCallback(
    (folder: string) => {
      setFolderPath(folder);
      setShowFolderSuggestions(false);
      setSelectedSuggestion(0);
    },
    []
  );

  if (!quickNoteOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[420px] max-w-[90vw] bg-base border border-surface0 rounded-lg shadow-xl animate-scale-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface0">
          <div className="flex items-center gap-2 text-text">
            <Plus size={18} />
            <span className="text-sm font-semibold">{t('notesList.newNote')}</span>
          </div>
          <button
            onClick={close}
            className="p-1 rounded hover:bg-surface0 text-subtext0 hover:text-text"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-subtext0" htmlFor="quick-note-name">
              {t('notesList.noteNamePlaceholder')}
            </label>
            <input
              id="quick-note-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded border border-surface1 bg-surface0 text-text focus:outline-none focus:border-lavender"
              placeholder={t('notesList.noteNamePlaceholder') || 'Nombre de la nota...'}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-subtext0" htmlFor="quick-note-folder">
              {t('notesList.inFolder')}
            </label>
            <div className="relative">
              <input
                id="quick-note-folder"
                type="text"
                value={folderPath}
                onFocus={() => {
                  setShowFolderSuggestions(true);
                  setSelectedSuggestion(0);
                }}
                onBlur={() => setTimeout(() => setShowFolderSuggestions(false), 100)}
                onChange={(e) => {
                  setFolderPath(e.target.value);
                  setSelectedSuggestion(0);
                  setShowFolderSuggestions(true);
                }}
                onKeyDown={(e) => {
                  if (!showFolderSuggestions || folderOptions.length === 0) return;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedSuggestion((prev) => (prev + 1) % folderOptions.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedSuggestion((prev) => (prev - 1 + folderOptions.length) % folderOptions.length);
                  } else if (e.key === 'Enter' || e.key === 'Tab') {
                    if (folderOptions[selectedSuggestion]) {
                      e.preventDefault();
                      selectFolderSuggestion(folderOptions[selectedSuggestion]);
                    }
                  }
                }}
                className="w-full px-3 py-2 rounded border border-surface1 bg-surface0 text-text focus:outline-none focus:border-lavender"
                placeholder={t('notesList.folderNamePlaceholder') || 'Carpeta (opcional)'}
              />
              {showFolderSuggestions && folderOptions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-lg border bg-surface0 border-surface1 max-h-[200px] overflow-y-auto">
                  {folderOptions.map((f, idx) => (
                    <button
                      type="button"
                      key={f}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors text-text ${
                        idx === selectedSuggestion ? 'bg-surface1' : 'bg-transparent'
                      }`}
                      onMouseEnter={() => setSelectedSuggestion(idx)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        selectFolderSuggestion(f);
                      }}
                    >
                      <span className="text-mauve">@</span>
                      <span>{f}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-subtext0">{t('notesList.newNoteHere')}</p>
          </div>

          {error && (
            <div className="text-[12px] text-red bg-red/10 border border-red/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              className="px-3 py-2 rounded border border-surface1 text-subtext0 hover:text-text hover:border-surface2"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-3 py-2 rounded text-crust bg-lavender hover:bg-lavender/90 disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {loading ? t('common.loading') : t('notesList.newNote')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default QuickNoteModal;
