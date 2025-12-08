import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../stores/app-store';
import { useNotes } from '../../hooks/useNotes';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { 
  FileText, 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown,
  Plus,
  FolderPlus,
  Trash2,
  GripVertical,
  Pencil,
} from 'lucide-react';
import type { NoteMetadata } from '../../../shared/types';

// Drag & drop types
type DragItemType = 'note' | 'folder';
interface DragItem {
  type: DragItemType;
  id?: number;  // For notes
  name: string;
  path?: string; // For folders
  sourceFolder: string | null;
}

interface DropTarget {
  type: 'folder' | 'root';
  path: string | null;
}

// Navigation item for keyboard nav
interface NavItem {
  type: 'note' | 'folder';
  id: string; // note.id or folderPath
  note?: NoteMetadata;
  folderPath?: string;
}

export default function NotesList() {
  const { t } = useTranslation();
  const { 
    notes, 
    folders, 
    expandedFolders, 
    toggleFolder, 
    currentNote, 
    sidebarOpen, 
    toggleSidebar,
    sidebarNavActive,
    sidebarNavSelectedIndex,
    setSidebarNavActive,
    setSidebarNavSelectedIndex,
  } = useAppStore();
  const { openNote, createNote, deleteNote, moveNote, renameNote, loadNotes, loadFolders } = useNotes();
  
  // Refs
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  
  // UI state
  const [newNoteName, setNewNoteName] = useState('');
  const [showNewNoteInput, setShowNewNoteInput] = useState(false);
  const [newNoteFolder, setNewNoteFolder] = useState<string | null>(null);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
  
  // Rename note state
  const [renamingNote, setRenamingNote] = useState<NoteMetadata | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  
  // Keyboard navigation uses global store state (sidebarNavActive, sidebarNavSelectedIndex)
  
  // Drag & drop state
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: { type: 'note' | 'folder'; note?: NoteMetadata; folderPath?: string };
  } | null>(null);

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Build flat list of navigable items
  const navItems = useMemo(() => {
    const items: NavItem[] = [];
    
    const addFolderItems = (folderPath: string) => {
      items.push({ type: 'folder', id: `folder:${folderPath}`, folderPath });
      
      if (expandedFolders.has(folderPath)) {
        // Add subfolders
        const subfolders = folders.filter(f => {
          const parts = f.split('/');
          const parentParts = folderPath.split('/');
          return parts.length === parentParts.length + 1 && f.startsWith(folderPath + '/');
        });
        subfolders.forEach(sf => addFolderItems(sf));
        
        // Add notes in folder
        const folderNotes = notes.filter(n => n.folder === folderPath);
        folderNotes.forEach(note => {
          items.push({ type: 'note', id: `note:${note.id}`, note });
        });
      }
    };
    
    // Root folders
    const rootFolders = folders.filter(f => f && !f.includes('/'));
    rootFolders.forEach(f => addFolderItems(f));
    
    // Root notes (no folder)
    const rootNotes = notes.filter(n => !n.folder);
    rootNotes.forEach(note => {
      items.push({ type: 'note', id: `note:${note.id}`, note });
    });
    
    return items;
  }, [notes, folders, expandedFolders]);

  // Helper function to focus editor and close navigation
  const focusEditor = useCallback(() => {
    console.log('focusEditor called, current sidebarNavActive:', useAppStore.getState().sidebarNavActive);
    // Use the actions from the store
    setSidebarNavActive(false);
    setSidebarNavSelectedIndex(-1);
    console.log('After set, sidebarNavActive:', useAppStore.getState().sidebarNavActive);
    // Return focus to editor or preview (if in preview-only mode)
    setTimeout(() => {
      // First try the CodeMirror editor
      const editor = document.querySelector('.cm-content') as HTMLElement;
      if (editor) {
        editor.focus();
        return;
      }
      // Fallback to preview pane (for preview-only mode)
      const preview = document.querySelector('.prose-container') as HTMLElement;
      if (preview) {
        preview.focus();
      }
    }, 50);
  }, [setSidebarNavActive, setSidebarNavSelectedIndex]);

  // If sidebar closes, ensure keyboard nav is off and selection reset
  useEffect(() => {
    if (!sidebarOpen && sidebarNavActive) {
      setSidebarNavActive(false);
      setSidebarNavSelectedIndex(-1);
    }
  }, [sidebarOpen, sidebarNavActive, setSidebarNavActive, setSidebarNavSelectedIndex]);

  // Keyboard navigation handler
  useEffect(() => {
    if (!sidebarNavActive || !sidebarOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showNewNoteInput || showNewFolderInput) return;
      
      // Don't capture keys when confirm dialog is open
      if (confirmDialog.isOpen) return;
      
      // Don't capture keys when typing in an input or the search overlay
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      
      // Check if search overlay is open
      const { searchOverlayOpen } = useAppStore.getState();
      if (searchOverlayOpen) return;
      
      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          setSidebarNavSelectedIndex(Math.min(sidebarNavSelectedIndex + 1, navItems.length - 1));
          // Auto-load note on navigation
          const downItem = navItems[Math.min(sidebarNavSelectedIndex + 1, navItems.length - 1)];
          if (downItem?.type === 'note' && downItem.note) {
            openNote(downItem.note);
          }
          break;
          
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          setSidebarNavSelectedIndex(Math.max(sidebarNavSelectedIndex - 1, 0));
          // Auto-load note on navigation
          const upItem = navItems[Math.max(sidebarNavSelectedIndex - 1, 0)];
          if (upItem?.type === 'note' && upItem.note) {
            openNote(upItem.note);
          }
          break;
          
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          const currentItem = navItems[sidebarNavSelectedIndex];
          if (currentItem?.type === 'folder' && currentItem.folderPath) {
            // Expand folder if collapsed
            if (!expandedFolders.has(currentItem.folderPath)) {
              toggleFolder(currentItem.folderPath);
            }
          } else if (currentItem?.type === 'note') {
            // Focus editor when pressing right on a note
            focusEditor();
          }
          break;
          
        case 'ArrowLeft':
        case 'h':
          e.preventDefault();
          const currentItem2 = navItems[sidebarNavSelectedIndex];
          if (currentItem2?.type === 'folder' && currentItem2.folderPath) {
            if (expandedFolders.has(currentItem2.folderPath)) {
              toggleFolder(currentItem2.folderPath);
            }
          }
          break;
          
        case 'Enter':
          e.preventDefault();
          const enterItem = navItems[sidebarNavSelectedIndex];
          if (enterItem?.type === 'folder' && enterItem.folderPath) {
            toggleFolder(enterItem.folderPath);
          } else if (enterItem?.type === 'note') {
            // Focus editor when pressing enter on a note
            focusEditor();
          }
          break;
          
        case 'Escape':
          e.preventDefault();
          // Close nav, close sidebar, and return focus to editor
          setSidebarNavActive(false);
          setSidebarNavSelectedIndex(-1);
          if (sidebarOpen) toggleSidebar();
          focusEditor();
          break;
          
        case 'Delete':
          e.preventDefault();
          const deleteItem = navItems[sidebarNavSelectedIndex];
          if (deleteItem?.type === 'note' && deleteItem.note) {
            const noteName = deleteItem.note.name;
            setConfirmDialog({
              isOpen: true,
              title: t('common.confirm'),
              message: t('notesList.confirmDeleteNote', { name: noteName }),
              onConfirm: async () => {
                try {
                  await deleteNote(noteName);
                  await loadNotes();
                } catch (error) {
                  console.error('Error deleting note:', error);
                }
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
              },
            });
          } else if (deleteItem?.type === 'folder' && deleteItem.folderPath) {
            const folderPath = deleteItem.folderPath;
            setConfirmDialog({
              isOpen: true,
              title: t('common.confirm'),
              message: t('notesList.deleteFolder', { folder: folderPath }),
              onConfirm: async () => {
                try {
                  await window.electron.folders.delete(folderPath);
                  await loadFolders();
                  await loadNotes();
                } catch (error) {
                  console.error('Error deleting folder:', error);
                }
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
              },
            });
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [sidebarNavActive, sidebarOpen, sidebarNavSelectedIndex, navItems, expandedFolders, toggleFolder, openNote, showNewNoteInput, showNewFolderInput, focusEditor, setSidebarNavActive, setSidebarNavSelectedIndex, toggleSidebar, deleteNote, loadNotes, loadFolders, setConfirmDialog, t, confirmDialog.isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (sidebarNavSelectedIndex >= 0 && navItems[sidebarNavSelectedIndex]) {
      const item = navItems[sidebarNavSelectedIndex];
      const element = itemRefs.current.get(item.id);
      element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [sidebarNavSelectedIndex, navItems]);

  // Track previous sidebarNavActive value
  const prevSidebarNavActiveRef = useRef(sidebarNavActive);

  // When sidebarNavActive becomes true (not just stays true), select current note and focus list
  useEffect(() => {
    const wasActive = prevSidebarNavActiveRef.current;
    prevSidebarNavActiveRef.current = sidebarNavActive;
    
    // Only focus when transitioning from false to true
    if (sidebarNavActive && !wasActive) {
      const currentNoteIndex = navItems.findIndex(
        item => item.type === 'note' && item.note?.id === currentNote?.id
      );
      setSidebarNavSelectedIndex(currentNoteIndex >= 0 ? currentNoteIndex : 0);
      // Small delay to ensure state is updated before focusing
      setTimeout(() => {
        listRef.current?.focus();
      }, 10);
    }
  }, [sidebarNavActive, navItems, currentNote, setSidebarNavSelectedIndex]);

  // Deactivate keyboard nav when clicking elsewhere
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        setSidebarNavActive(false);
        setSidebarNavSelectedIndex(-1);
      }
    };
    
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [setSidebarNavActive, setSidebarNavSelectedIndex]);

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

  // ============== CREATE NOTE ==============
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

  // ============== CREATE FOLDER ==============
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const folderPath = newFolderParent 
        ? `${newFolderParent}/${newFolderName.trim()}`
        : newFolderName.trim();
      await window.electron.folders.create(folderPath);
      await loadFolders();
      setNewFolderName('');
      setShowNewFolderInput(false);
      setNewFolderParent(null);
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  // ============== DELETE FOLDER ==============
  const handleDeleteFolder = async (folderPath: string) => {
    setConfirmDialog({
      isOpen: true,
      title: t('common.confirm'),
      message: t('notesList.deleteFolder', { folder: folderPath }),
      onConfirm: async () => {
        try {
          await window.electron.folders.delete(folderPath);
          await loadFolders();
          await loadNotes();
        } catch (error) {
          console.error('Error deleting folder:', error);
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
    });
  };

  // ============== RENAME NOTE ==============
  const startRenameNote = (note: NoteMetadata) => {
    setRenamingNote(note);
    setRenameValue(note.name);
    // Focus input after render
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const handleRenameNote = async () => {
    // Prevent double execution
    if (!renamingNote) return;
    
    const noteToRename = renamingNote;
    const newName = renameValue.trim();
    
    // Clear state first to prevent double execution
    setRenamingNote(null);
    
    if (!newName) {
      return;
    }
    
    if (newName === noteToRename.name) {
      return;
    }
    
    try {
      await renameNote(noteToRename.name, newName);
      await loadNotes();
    } catch (error) {
      console.error('Error renaming note:', error);
    }
  };

  const cancelRename = () => {
    setRenamingNote(null);
    setRenameValue('');
  };

  // ============== MOVE FOLDER ==============
  const handleMoveFolder = useCallback(async (sourcePath: string, targetFolder: string | null) => {
    const folderName = sourcePath.split('/').pop() || sourcePath;
    const newPath = targetFolder ? `${targetFolder}/${folderName}` : folderName;
    
    if (sourcePath === newPath) return;
    if (newPath.startsWith(sourcePath + '/')) {
      console.error('Cannot move folder into itself');
      return;
    }
    
    try {
      await window.electron.folders.rename(sourcePath, newPath);
      await loadFolders();
      await loadNotes();
    } catch (error) {
      console.error('Error moving folder:', error);
    }
  }, [loadFolders, loadNotes]);

  // ============== DRAG & DROP HANDLERS ==============
  const handleDragStart = useCallback((e: React.DragEvent, item: DragItem) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(item));
    setDragItem(item);
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragItem(null);
    setDropTarget(null);
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, target: DropTarget) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDropTarget(null);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, target: DropTarget) => {
    e.preventDefault();
    e.stopPropagation();
    
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    
    try {
      const item: DragItem = JSON.parse(data);
      
      if (item.sourceFolder === target.path) return;
      
      if (item.type === 'note') {
        await moveNote(item.name, target.path || '');
        await loadFolders();
      } else if (item.type === 'folder' && item.path) {
        await handleMoveFolder(item.path, target.path);
      }
    } catch (error) {
      console.error('Drop error:', error);
    } finally {
      setDragItem(null);
      setDropTarget(null);
      setIsDragging(false);
    }
  }, [moveNote, loadFolders, handleMoveFolder]);

  // ============== CONTEXT MENU ==============
  const handleContextMenu = useCallback((
    e: React.MouseEvent, 
    item: { type: 'note' | 'folder'; note?: NoteMetadata; folderPath?: string }
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ============== KEY HANDLERS ==============
  const handleNoteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateNote();
    } else if (e.key === 'Escape') {
      setShowNewNoteInput(false);
      setNewNoteName('');
      setNewNoteFolder(null);
    }
  };

  const handleFolderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      setShowNewFolderInput(false);
      setNewFolderName('');
      setNewFolderParent(null);
    }
  };

  // ============== RENDER NOTE ==============
  const renderNote = (note: NoteMetadata, depth = 0) => {
    const isActive = currentNote?.id === note.id;
    const isDraggedItem = dragItem?.type === 'note' && dragItem.id === note.id;
    const navId = `note:${note.id}`;
    const isKeyboardSelected = sidebarNavActive && navItems[sidebarNavSelectedIndex]?.id === navId;
    
    return (
      <div
        key={note.id}
        ref={(el) => {
          if (el) itemRefs.current.set(navId, el);
          else itemRefs.current.delete(navId);
        }}
        draggable
        onDragStart={(e) => handleDragStart(e, {
          type: 'note',
          id: note.id,
          name: note.name,
          sourceFolder: note.folder || null,
        })}
        onDragEnd={handleDragEnd}
        onContextMenu={(e) => handleContextMenu(e, { type: 'note', note })}
        className={`
          group flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer
          transition-colors rounded-md mx-1 overflow-hidden
          ${isActive 
            ? 'bg-surface1 text-text' 
            : 'text-subtext1 hover:bg-surface0 hover:text-text'
          }
          ${isDraggedItem ? 'opacity-50' : ''}
          ${isKeyboardSelected ? 'ring-2 ring-lavender ring-inset' : ''}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => openNote(note)}
      >
        <GripVertical 
          size={12} 
          className="flex-shrink-0 opacity-0 group-hover:opacity-50 cursor-grab" 
        />
        <span className="text-base flex-shrink-0">{note.icon || '📄'}</span>
        {renamingNote?.id === note.id ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleRenameNote();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelRename();
              }
              e.stopPropagation();
            }}
            onBlur={() => {
              // Use setTimeout to allow click events to process first
              setTimeout(() => handleRenameNote(), 0);
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-surface0 border border-surface2 rounded px-1 py-0.5 text-sm text-text focus:outline-none focus:border-lavender"
            autoFocus
          />
        ) : (
          <span 
            className="truncate min-w-0 flex-1"
            onDoubleClick={(e) => {
              e.stopPropagation();
              startRenameNote(note);
            }}
          >
            {note.name}
          </span>
        )}
      </div>
    );
  };

  // ============== RENDER FOLDER ==============
  const renderFolder = (folderPath: string, depth = 0) => {
    const isExpanded = expandedFolders.has(folderPath);
    const folderNotes = notesByFolder[folderPath] || [];
    const folderName = folderPath.split('/').pop() || folderPath;
    
    const subfolders = folders.filter(f => {
      const parts = f.split('/');
      const parentParts = folderPath.split('/');
      return parts.length === parentParts.length + 1 && f.startsWith(folderPath + '/');
    });

    const isDropTarget = dropTarget?.path === folderPath;
    const isDraggedItem = dragItem?.type === 'folder' && dragItem.path === folderPath;
    const navId = `folder:${folderPath}`;
    const isKeyboardSelected = sidebarNavActive && navItems[sidebarNavSelectedIndex]?.id === navId;

    return (
      <div key={folderPath}>
        <div
          ref={(el) => {
            if (el) itemRefs.current.set(navId, el);
            else itemRefs.current.delete(navId);
          }}
          draggable
          onDragStart={(e) => handleDragStart(e, {
            type: 'folder',
            name: folderName,
            path: folderPath,
            sourceFolder: folderPath.includes('/') 
              ? folderPath.split('/').slice(0, -1).join('/') 
              : null,
          })}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, { type: 'folder', path: folderPath })}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, { type: 'folder', path: folderPath })}
          onContextMenu={(e) => handleContextMenu(e, { type: 'folder', folderPath })}
          className={`
            group flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer
            text-subtext1 hover:bg-surface0 hover:text-text
            transition-all rounded-md mx-1
            ${isDropTarget ? 'bg-lavender/20 ring-1 ring-lavender' : ''}
            ${isDraggedItem ? 'opacity-50' : ''}
            ${isKeyboardSelected ? 'ring-2 ring-lavender ring-inset' : ''}
          `}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => toggleFolder(folderPath)}
        >
          <GripVertical 
            size={12} 
            className="flex-shrink-0 opacity-0 group-hover:opacity-50 cursor-grab" 
          />
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {isExpanded 
            ? <FolderOpen size={16} className="text-yellow flex-shrink-0" /> 
            : <Folder size={16} className="text-yellow flex-shrink-0" />
          }
          <span className="truncate flex-1">{folderName}</span>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowNewNoteInput(true);
              setNewNoteFolder(folderPath);
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-surface1 rounded"
            title={t('notesList.newNoteInFolder')}
          >
            <Plus size={12} />
          </button>
        </div>
        
        {isExpanded && (
          <div>
            {subfolders.map(sf => renderFolder(sf, depth + 1))}
            {folderNotes.map(note => renderNote(note, depth + 1))}
            
            {subfolders.length === 0 && folderNotes.length === 0 && (
              <div 
                className="text-xs text-subtext0/50 py-2 text-center italic"
                style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
              >
                {t('notesList.emptyFolder')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const isRootDropTarget = dropTarget?.type === 'root';

  // Debug: log sidebarNavActive on each render
  console.log('NotesList render, sidebarNavActive:', sidebarNavActive);

  return (
    <div 
      ref={listRef}
      className={`flex flex-col h-full overflow-hidden ${sidebarNavActive ? 'outline-none' : ''}`}
      onClick={closeContextMenu}
      tabIndex={-1}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-subtext0">{t('notesList.title')}</span>
          {sidebarNavActive && (
            <span className="text-xs px-1.5 py-0.5 bg-lavender/20 text-lavender rounded">
              Nav
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowNewFolderInput(true);
              setNewFolderParent(null);
            }}
            className="p-1 rounded hover:bg-surface0 text-subtext0 hover:text-text"
            title={t('notesList.newFolder')}
          >
            <FolderPlus size={16} />
          </button>
          <button
            onClick={() => {
              setShowNewNoteInput(true);
              setNewNoteFolder(null);
            }}
            className="p-1 rounded hover:bg-surface0 text-subtext0 hover:text-text"
            title={t('notesList.newNote')}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* New folder input */}
      {showNewFolderInput && (
        <div className="px-3 py-2 border-b border-surface0">
          <div className="flex items-center gap-2">
            <Folder size={14} className="text-yellow flex-shrink-0" />
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={handleFolderKeyDown}
              placeholder={t('notesList.folderNamePlaceholder')}
              className="flex-1 px-2 py-1 text-sm bg-surface0 border border-surface1 rounded
                         focus:outline-none focus:border-lavender text-text placeholder-subtext0"
              autoFocus
            />
          </div>
          {newFolderParent && (
            <div className="text-xs text-subtext0 mt-1 ml-5">
              {t('notesList.inFolder', { folder: newFolderParent })}
            </div>
          )}
        </div>
      )}

      {/* New note input */}
      {showNewNoteInput && (
        <div className="px-3 py-2 border-b border-surface0">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-lavender flex-shrink-0" />
            <input
              type="text"
              value={newNoteName}
              onChange={(e) => setNewNoteName(e.target.value)}
              onKeyDown={handleNoteKeyDown}
              placeholder={t('notesList.noteNamePlaceholder')}
              className="flex-1 px-2 py-1 text-sm bg-surface0 border border-surface1 rounded
                         focus:outline-none focus:border-lavender text-text placeholder-subtext0"
              autoFocus
            />
          </div>
          {newNoteFolder && (
            <div className="text-xs text-subtext0 mt-1 ml-5">
              {t('notesList.inFolder', { folder: newNoteFolder })}
            </div>
          )}
        </div>
      )}

      {/* Notes list with root drop zone */}
      <div 
        className={`
          flex-1 overflow-y-auto overflow-x-hidden py-1
          ${isRootDropTarget ? 'bg-lavender/10' : ''}
        `}
        onDragOver={(e) => handleDragOver(e, { type: 'root', path: null })}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, { type: 'root', path: null })}
      >
        {/* Root folders */}
        {rootFolders.map(folder => renderFolder(folder))}
        
        {/* Root notes (no folder) */}
        {(notesByFolder[''] || []).map(note => renderNote(note))}
        
        {/* Empty state */}
        {notes.length === 0 && folders.length === 0 && (
          <div className="px-4 py-8 text-center text-subtext0 text-sm">
            <FileText size={32} className="mx-auto mb-2 opacity-50" />
            <p>{t('notesList.noNotes')}</p>
            <button
              onClick={() => setShowNewNoteInput(true)}
              className="mt-2 text-lavender hover:underline"
            >
              {t('notesList.createFirst')}
            </button>
          </div>
        )}

        {/* Drop indicator at bottom */}
        {isDragging && (
          <div className={`
            mx-2 my-1 py-3 border-2 border-dashed rounded-md text-center text-xs
            ${isRootDropTarget 
              ? 'border-lavender text-lavender bg-lavender/10' 
              : 'border-surface1 text-subtext0'
            }
          `}>
            {t('notesList.dropToRoot')}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-mantle border border-surface0 rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.item.type === 'note' && contextMenu.item.note && (
            <>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-surface0 flex items-center gap-2"
                onClick={() => {
                  openNote(contextMenu.item.note!);
                  closeContextMenu();
                }}
              >
                <FileText size={14} />
                {t('notesList.open')}
              </button>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-surface0 flex items-center gap-2"
                onClick={() => {
                  startRenameNote(contextMenu.item.note!);
                  closeContextMenu();
                }}
              >
                <Pencil size={14} />
                {t('common.rename')}
              </button>
              <hr className="my-1 border-surface0" />
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-surface0 flex items-center gap-2 text-red"
                onClick={() => {
                  const noteName = contextMenu.item.note!.name;
                  closeContextMenu();
                  setConfirmDialog({
                    isOpen: true,
                    title: t('common.confirm'),
                    message: t('notesList.confirmDeleteNote', { name: noteName }),
                    onConfirm: async () => {
                      await deleteNote(noteName);
                      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                    },
                  });
                }}
              >
                <Trash2 size={14} />
                {t('notesList.delete')}
              </button>
            </>
          )}
          {contextMenu.item.type === 'folder' && contextMenu.item.folderPath && (
            <>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-surface0 flex items-center gap-2"
                onClick={() => {
                  setShowNewNoteInput(true);
                  setNewNoteFolder(contextMenu.item.folderPath!);
                  closeContextMenu();
                }}
              >
                <Plus size={14} />
                {t('notesList.newNoteHere')}
              </button>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-surface0 flex items-center gap-2"
                onClick={() => {
                  setShowNewFolderInput(true);
                  setNewFolderParent(contextMenu.item.folderPath!);
                  closeContextMenu();
                }}
              >
                <FolderPlus size={14} />
                {t('notesList.newSubfolder')}
              </button>
              <hr className="my-1 border-surface0" />
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-surface0 flex items-center gap-2 text-red"
                onClick={() => {
                  handleDeleteFolder(contextMenu.item.folderPath!);
                  closeContextMenu();
                }}
              >
                <Trash2 size={14} />
                {t('notesList.deleteThisFolder')}
              </button>
            </>
          )}
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={t('common.delete')}
        variant="danger"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

