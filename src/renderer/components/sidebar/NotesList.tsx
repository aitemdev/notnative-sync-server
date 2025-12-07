import { useState, useMemo } from 'react';
import { useAppStore } from '../../stores/app-store';
import { useNotes } from '../../hooks/useNotes';
import { 
  FileText, 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import type { NoteMetadata } from '../../../shared/types';

export default function NotesList() {
  const { notes, folders, expandedFolders, toggleFolder, currentNote } = useAppStore();
  const { openNote, createNote, deleteNote } = useNotes();
  const [newNoteName, setNewNoteName] = useState('');
  const [showNewNoteInput, setShowNewNoteInput] = useState(false);
  const [newNoteFolder, setNewNoteFolder] = useState<string | null>(null);

  // Group notes by folder
  const notesByFolder = useMemo(() => {
    const grouped: Record<string, NoteMetadata[]> = { '': [] };
    
    // Initialize folders
    folders.forEach(f => {
      if (f) grouped[f] = [];
    });
    
    // Group notes
    notes.forEach(note => {
      const folder = note.folder || '';
      if (!grouped[folder]) {
        grouped[folder] = [];
      }
      grouped[folder].push(note);
    });
    
    return grouped;
  }, [notes, folders]);

  // Get root-level folders
  const rootFolders = useMemo(() => {
    return folders.filter(f => f && !f.includes('/'));
  }, [folders]);

  const handleCreateNote = async () => {
    if (!newNoteName.trim()) return;
    
    try {
      await createNote(newNoteName.trim(), undefined, newNoteFolder || undefined);
      setNewNoteName('');
      setShowNewNoteInput(false);
      setNewNoteFolder(null);
    } catch (error) {
      console.error('Error creating note:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateNote();
    } else if (e.key === 'Escape') {
      setShowNewNoteInput(false);
      setNewNoteName('');
      setNewNoteFolder(null);
    }
  };

  const renderNote = (note: NoteMetadata) => {
    const isActive = currentNote?.id === note.id;
    
    return (
      <button
        key={note.id}
        onClick={() => openNote(note)}
        className={`
          w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left
          transition-colors rounded-md mx-1 overflow-hidden
          ${isActive 
            ? 'bg-surface1 text-text' 
            : 'text-subtext1 hover:bg-surface0 hover:text-text'
          }
        `}
      >
        <span className="text-base flex-shrink-0">{note.icon || '📄'}</span>
        <span className="truncate min-w-0">{note.name}</span>
      </button>
    );
  };

  const renderFolder = (folderPath: string, depth = 0) => {
    const isExpanded = expandedFolders.has(folderPath);
    const folderNotes = notesByFolder[folderPath] || [];
    const folderName = folderPath.split('/').pop() || folderPath;
    
    // Get subfolders
    const subfolders = folders.filter(f => {
      const parts = f.split('/');
      const parentParts = folderPath.split('/');
      return parts.length === parentParts.length + 1 && f.startsWith(folderPath + '/');
    });

    return (
      <div key={folderPath}>
        <button
          onClick={() => toggleFolder(folderPath)}
          className={`
            w-full flex items-center gap-1 px-2 py-1.5 text-sm
            text-subtext1 hover:bg-surface0 hover:text-text
            transition-colors rounded-md mx-1
          `}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {isExpanded ? <FolderOpen size={16} className="text-yellow" /> : <Folder size={16} className="text-yellow" />}
          <span className="truncate">{folderName}</span>
        </button>
        
        {isExpanded && (
          <div className="ml-2">
            {subfolders.map(sf => renderFolder(sf, depth + 1))}
            {folderNotes.map(note => (
              <div key={note.id} style={{ paddingLeft: `${depth * 12}px` }}>
                {renderNote(note)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-medium text-subtext0">Notas</span>
        <button
          onClick={() => {
            setShowNewNoteInput(true);
            setNewNoteFolder(null);
          }}
          className="p-1 rounded hover:bg-surface0 text-subtext0 hover:text-text"
          title="Nueva nota"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* New note input */}
      {showNewNoteInput && (
        <div className="px-3 pb-2">
          <input
            type="text"
            value={newNoteName}
            onChange={(e) => setNewNoteName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nombre de la nota..."
            className="w-full px-2 py-1 text-sm bg-surface0 border border-surface1 rounded
                       focus:outline-none focus:border-lavender text-text placeholder-subtext0"
            autoFocus
          />
        </div>
      )}

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {/* Root folders */}
        {rootFolders.map(folder => renderFolder(folder))}
        
        {/* Root notes (no folder) */}
        {(notesByFolder[''] || []).map(note => renderNote(note))}
        
        {/* Empty state */}
        {notes.length === 0 && (
          <div className="px-4 py-8 text-center text-subtext0 text-sm">
            <FileText size={32} className="mx-auto mb-2 opacity-50" />
            <p>No hay notas</p>
            <button
              onClick={() => setShowNewNoteInput(true)}
              className="mt-2 text-lavender hover:underline"
            >
              Crear primera nota
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
