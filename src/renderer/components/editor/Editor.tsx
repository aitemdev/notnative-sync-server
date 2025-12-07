import { useEffect, useCallback, useState, useRef } from 'react';
import { useAppStore } from '../../stores/app-store';
import { useNotes } from '../../hooks/useNotes';
import { EDITOR_AUTOSAVE_DELAY } from '../../../shared/constants';
import { FileText, Save } from 'lucide-react';
import VimEditor from './VimEditor';
import { EditorMode } from '../../lib/editor/types';

export default function Editor() {
  const { 
    currentNote, 
    currentNoteContent, 
    setCurrentNoteContent, 
    isModified, 
    setIsModified,
    editorMode,
    setEditorMode,
  } = useAppStore();
  const { updateNoteById } = useNotes();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  
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

  // Empty state
  if (!currentNote) {
    return (
      <div className="flex-1 flex flex-col bg-base">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-subtext0">
            <FileText size={64} className="mx-auto mb-4 opacity-30" />
            <h2 className="text-xl font-medium mb-2">No hay nota seleccionada</h2>
            <p className="text-sm">Selecciona una nota de la barra lateral o crea una nueva</p>
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
            <span className="w-2 h-2 rounded-full bg-yellow flex-shrink-0" title="Sin guardar" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-subtext0 flex-shrink-0">
          {lastSaved && (
            <span className="hidden sm:inline">Guardado: {lastSaved.toLocaleTimeString()}</span>
          )}
          <button
            onClick={() => saveNote()}
            disabled={!isModified}
            className={`p-1.5 rounded transition-colors ${
              isModified 
                ? 'hover:bg-surface0 text-lavender' 
                : 'text-subtext0 opacity-50 cursor-not-allowed'
            }`}
            title="Guardar (Ctrl+S)"
          >
            <Save size={16} />
          </button>
        </div>
      </div>

      {/* VimEditor */}
      <div className="flex-1 overflow-hidden">
        <VimEditor
          initialContent={currentNoteContent}
          onSave={saveNote}
          onChange={handleContentChange}
          onModeChange={handleModeChange}
        />
      </div>
    </div>
  );
}
