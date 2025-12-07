import { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/app-store';
import Sidebar from '../sidebar/Sidebar';
import Editor from '../editor/Editor';
import StatusBar from '../common/StatusBar';
import { Chat } from '../chat/Chat';
import { useNotes } from '../../hooks/useNotes';

export default function MainLayout() {
  const { sidebarOpen, sidebarWidth, rightPanelOpen, rightPanelWidth, toggleRightPanel, currentNote, setCurrentNote, setCurrentNoteContent } = useAppStore();
  const { loadNotes, loadFolders, loadTags } = useNotes();
  
  // Use ref to access current note in event listener without re-creating listener
  const currentNoteRef = useRef(currentNote);
  currentNoteRef.current = currentNote;

  useEffect(() => {
    // Load initial data
    loadNotes();
    loadFolders();
    loadTags();

    // Listen for file changes (from watcher)
    const unsubscribeFiles = window.electron.files.onChanged(async (type, noteName) => {
      console.log(`File ${type}: ${noteName}`);
      // Reload notes list on any change
      loadNotes();
      loadFolders();
    });

    // Listen for note content updates (from AI tools)
    const unsubscribeContent = window.electron.notes_events.onContentUpdated((data) => {
      console.log('📝 Note content updated:', data.name, 'id:', data.id);
      const current = currentNoteRef.current;
      
      // Check if the updated note is currently open (by id or name)
      if (current && (current.id === data.id || current.name === data.name)) {
        console.log('📝 Updating editor content, length:', data.content.length);
        setCurrentNoteContent(data.content);
      }
      
      // Also reload notes list to update sidebar
      loadNotes();
    });

    // Listen for note rename events (from AI tools)
    const unsubscribeRename = window.electron.notes_events.onRenamed((data) => {
      console.log('📝 Note renamed:', data.oldName, '->', data.newName);
      const current = currentNoteRef.current;
      
      // If the renamed note is currently open, update currentNote
      if (current && (current.id === data.id || current.name === data.oldName)) {
        console.log('📝 Updating currentNote with new name');
        setCurrentNote({
          ...current,
          name: data.newName,
          path: data.newPath,
        });
      }
      
      // Reload notes list to update sidebar
      loadNotes();
    });

    // Listen for keyboard shortcut to toggle chat
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        toggleRightPanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribeFiles();
      unsubscribeContent();
      unsubscribeRename();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [loadNotes, loadFolders, loadTags, toggleRightPanel, setCurrentNote, setCurrentNoteContent]);

  return (
    <div className="flex flex-col h-screen bg-base text-text">
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div 
            className="flex-shrink-0 border-r border-surface0"
            style={{ width: sidebarWidth }}
          >
            <Sidebar />
          </div>
        )}

        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Editor />
        </div>

        {/* Right Panel - Chat */}
        {rightPanelOpen && (
          <div 
            className="flex-shrink-0 border-l border-surface0"
            style={{ width: rightPanelWidth }}
          >
            <Chat />
          </div>
        )}
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  );
}
