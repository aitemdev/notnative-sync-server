import { useEffect, useCallback, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../stores/app-store';
import { useNotes } from '../../hooks/useNotes';
import { EDITOR_AUTOSAVE_DELAY } from '../../../shared/constants';
import { FileText, Save, Code, Eye, Columns2 } from 'lucide-react';
import VimEditor from './VimEditor';
import MarkdownPreview from './MarkdownPreview';
import { EditorMode } from '../../lib/editor/types';

export default function Editor() {
  const { t } = useTranslation();
  const { 
    currentNote, 
    currentNoteContent, 
    setCurrentNoteContent, 
    isModified, 
    setIsModified,
    editorMode,
    setEditorMode,
    viewMode,
    setViewMode,
    cycleViewMode,
    sidebarOpen,
    toggleSidebar,
    sidebarNavActive,
    toggleSidebarNav,
    toggleRightPanel,
    setQuickNoteOpen,
  } = useAppStore();
  const { updateNoteById } = useNotes();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  
  // Refs for scroll sync
  const previewRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<{ scrollTop: number; scrollHeight: number; clientHeight: number } | null>(null);
  const isScrollSyncing = useRef(false);
  
  // Refs to access current values in cleanup effects
  const currentNoteRef = useRef(currentNote);
  const currentNoteContentRef = useRef(currentNoteContent);
  const isModifiedRef = useRef(isModified);
  
  // Keep refs updated
  useEffect(() => {
    currentNoteRef.current = currentNote;
    currentNoteContentRef.current = currentNoteContent;
    isModifiedRef.current = isModified;
  }, [currentNote, currentNoteContent, isModified]);

  // Save note using ID (more reliable than name which can change)
  const saveNote = useCallback(async (content?: string) => {
    if (!currentNote) return;
    
    const contentToSave = content ?? currentNoteContent;
    
    try {
      await updateNoteById(currentNote.id, contentToSave);
      setIsModified(false);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving note:', error);
    }
  }, [currentNote, currentNoteContent, updateNoteById, setIsModified]);
  
  // Sync save function for use in effects (using refs)
  const saveNoteSync = useCallback((noteId: number, content: string) => {
    // Fire and forget - we use the sync version for cleanup
    window.electron.notes.updateById(noteId, content).catch(err => {
      console.error('Error in sync save:', err);
    });
  }, []);

  // Save pending changes when switching notes
  useEffect(() => {
    // This runs when currentNote changes
    return () => {
      // Clear any pending auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      
      // If there were unsaved changes, save them immediately
      const prevNote = currentNoteRef.current;
      const prevContent = currentNoteContentRef.current;
      const wasModified = isModifiedRef.current;
      
      if (prevNote && wasModified && prevContent !== undefined) {
        console.log('💾 Saving pending changes before switching note:', prevNote.name);
        saveNoteSync(prevNote.id, prevContent);
      }
    };
  }, [currentNote?.id, saveNoteSync]);

  // Save on window close/refresh and app quit
  useEffect(() => {
    const handleSaveBeforeClose = () => {
      // Clear any pending auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      
      // Save if modified
      const note = currentNoteRef.current;
      const content = currentNoteContentRef.current;
      const modified = isModifiedRef.current;
      
      if (note && modified && content !== undefined) {
        console.log('💾 Saving before close:', note.name);
        saveNoteSync(note.id, content);
      }
    };
    
    // Listen to browser beforeunload
    window.addEventListener('beforeunload', handleSaveBeforeClose);
    
    // Listen to Electron app quit signal
    const unsubQuit = window.electron.app_events.onBeforeQuit(() => {
      console.log('📢 Received app:before-quit signal');
      handleSaveBeforeClose();
    });
    
    return () => {
      window.removeEventListener('beforeunload', handleSaveBeforeClose);
      unsubQuit();
    };
  }, [saveNoteSync]);

  // Handle content change from editor
  const handleContentChange = useCallback((content: string) => {
    setCurrentNoteContent(content);
    setIsModified(true);
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new auto-save timeout
    saveTimeoutRef.current = setTimeout(() => {
      saveNote(content);
    }, EDITOR_AUTOSAVE_DELAY);
  }, [setCurrentNoteContent, setIsModified, saveNote]);

  // Handle mode change from VimEditor
  const handleModeChange = useCallback((mode: EditorMode) => {
    setEditorMode(mode);
  }, [setEditorMode]);

  // Handle scroll sync from editor to preview (throttled)
  const lastScrollSync = useRef<number>(0);
  const handleEditorScroll = useCallback((scrollTop: number, scrollHeight: number, clientHeight: number) => {
    if (viewMode !== 'split' || isScrollSyncing.current) return;
    
    const now = Date.now();
    if (now - lastScrollSync.current < 100) return; // Throttle 100ms
    lastScrollSync.current = now;
    
    editorScrollRef.current = { scrollTop, scrollHeight, clientHeight };
    
    if (previewRef.current) {
      const scrollPercentage = scrollTop / Math.max(1, scrollHeight - clientHeight);
      const previewScrollHeight = previewRef.current.scrollHeight - previewRef.current.clientHeight;
      
      isScrollSyncing.current = true;
      previewRef.current.scrollTop = scrollPercentage * previewScrollHeight;
      requestAnimationFrame(() => {
        isScrollSyncing.current = false;
      });
    }
  }, [viewMode]);

  // Ctrl+E keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'e' && !e.shiftKey && !e.altKey) {
        // Don't trigger if in an input/textarea (except our editor)
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        
        e.preventDefault();
        e.stopPropagation();
        cycleViewMode();
      }
    };
    
    // Use capture phase to intercept before CodeMirror/Vim
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [cycleViewMode]);

  // Ctrl+T keyboard shortcut - Open sidebar navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 't' && !e.shiftKey && !e.altKey) {
        // Don't trigger if in an input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        
        e.preventDefault();
        e.stopPropagation();
        
        // Read current state directly from store
        const state = useAppStore.getState();
        
        // Abrir sidebar si está cerrado y activar navegación
        if (!state.sidebarOpen) {
          useAppStore.setState({ sidebarOpen: true });
        }
        state.setSidebarNavActive(true);
      }
    };
    
    // Use capture phase to intercept before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // ESC closes sidebar even if navigation was deactivated (e.g., after Enter on a note)
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const state = useAppStore.getState();
      if (state.sidebarOpen || state.rightPanelOpen) {
        e.preventDefault();
        e.stopPropagation();
        useAppStore.setState({ sidebarOpen: false, sidebarNavActive: false, sidebarNavSelectedIndex: -1, rightPanelOpen: false });
        const editorEl = document.querySelector('.cm-content') as HTMLElement;
        if (editorEl) editorEl.focus();
      }
    };

    window.addEventListener('keydown', handleEsc, true);
    return () => window.removeEventListener('keydown', handleEsc, true);
  }, []);

  // Ctrl+Shift+C toggles AI chat panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'c' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        e.stopPropagation();
        toggleRightPanel();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [toggleRightPanel]);

  // Ctrl+Shift+N opens quick note modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'n' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        e.stopPropagation();
        setQuickNoteOpen(true);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [setQuickNoteOpen]);

  // Empty state
  if (!currentNote) {
    return (
      <div className="flex-1 flex flex-col bg-base">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-subtext0">
            <FileText size={64} className="mx-auto mb-4 opacity-30" />
            <h2 className="text-xl font-medium mb-2">{t('editor.noNoteSelected')}</h2>
            <p className="text-sm">{t('editor.selectOrCreate')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-base">
      {/* Editor header */}
      <div className="flex items-center justify-between h-10 px-4 border-b border-surface0 bg-mantle">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm flex-shrink-0">{currentNote.icon || '📄'}</span>
          <h1 className="text-sm font-medium text-text truncate">{currentNote.name}</h1>
          {isModified && (
            <span className="w-2 h-2 rounded-full bg-yellow flex-shrink-0" title={t('editor.unsaved')} />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-subtext0 flex-shrink-0">
          {lastSaved && (
            <span className="hidden sm:inline">{t('editor.saved')}: {lastSaved.toLocaleTimeString()}</span>
          )}
          
          {/* View mode toggle buttons */}
          <div className="flex items-center border border-surface1 rounded overflow-hidden">
            <button
              onClick={() => setViewMode('edit')}
              className={`p-1.5 transition-colors ${
                viewMode === 'edit' 
                  ? 'bg-lavender text-crust' 
                  : 'hover:bg-surface0 text-subtext0 hover:text-text'
              }`}
              title={`${t('editor.editMode')} (Ctrl+E)`}
            >
              <Code size={14} />
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`p-1.5 transition-colors border-x border-surface1 ${
                viewMode === 'split' 
                  ? 'bg-lavender text-crust' 
                  : 'hover:bg-surface0 text-subtext0 hover:text-text'
              }`}
              title={`${t('editor.splitMode')} (Ctrl+E)`}
            >
              <Columns2 size={14} />
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`p-1.5 transition-colors ${
                viewMode === 'preview' 
                  ? 'bg-lavender text-crust' 
                  : 'hover:bg-surface0 text-subtext0 hover:text-text'
              }`}
              title={`${t('editor.previewMode')} (Ctrl+E)`}
            >
              <Eye size={14} />
            </button>
          </div>
          
          <button
            onClick={() => saveNote()}
            disabled={!isModified}
            className={`p-1.5 rounded transition-colors ${
              isModified 
                ? 'hover:bg-surface0 text-lavender' 
                : 'text-subtext0 opacity-50 cursor-not-allowed'
            }`}
            title={`${t('common.save')} (Ctrl+S)`}
          >
            <Save size={16} />
          </button>
        </div>
      </div>

      {/* Editor / Preview area */}
      <div className="flex-1 overflow-hidden flex">
        {/* VimEditor - show in edit and split modes */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className={`overflow-hidden ${viewMode === 'split' ? 'w-1/2 border-r border-surface0' : 'flex-1'}`}>
            <VimEditor
              initialContent={currentNoteContent}
              onSave={saveNote}
              onChange={handleContentChange}
              onModeChange={handleModeChange}
              onScroll={handleEditorScroll}
            />
          </div>
        )}
        
        {/* MarkdownPreview - show in preview and split modes */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className={`overflow-hidden ${viewMode === 'split' ? 'w-1/2' : 'flex-1'}`}>
            <MarkdownPreview 
              key={currentNote?.id}
              ref={previewRef}
              content={currentNoteContent} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
