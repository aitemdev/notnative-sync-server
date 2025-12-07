import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../../stores/app-store';
import Sidebar from '../sidebar/Sidebar';
import Editor from '../editor/Editor';
import StatusBar from '../common/StatusBar';
import { Chat } from '../chat/Chat';
import QuickNoteModal from '../common/QuickNoteModal';
import { useNotes } from '../../hooks/useNotes';
import { X } from 'lucide-react';

// Breakpoint for responsive behavior
const MOBILE_BREAKPOINT = 1024;
const TABLET_BREAKPOINT = 768;

export default function MainLayout() {
  const { 
    sidebarOpen, 
    sidebarWidth, 
    rightPanelOpen, 
    rightPanelWidth, 
    toggleRightPanel, 
    toggleSidebar,
    currentNote, 
    setCurrentNote, 
    setCurrentNoteContent 
  } = useAppStore();
  const { loadNotes, loadFolders, loadTags } = useNotes();
  
  // Responsive state
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Use ref to access current note in event listener without re-creating listener
  const currentNoteRef = useRef(currentNote);
  currentNoteRef.current = currentNote;

  // Handle window resize for responsive behavior
  const handleResize = useCallback(() => {
    const width = window.innerWidth;
    const newIsMobile = width < TABLET_BREAKPOINT;
    const newIsTablet = width < MOBILE_BREAKPOINT;
    console.log('Resize:', { width, isMobile: newIsMobile, isTablet: newIsTablet });
    setIsMobile(newIsMobile);
    setIsTablet(newIsTablet);
    
    // Auto-collapse sidebar on smaller screens
    if (width < MOBILE_BREAKPOINT && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    } else if (width >= MOBILE_BREAKPOINT && sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    // Initial check
    handleResize();
    
    // Add resize listener
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

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

    // Listen for keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+C - Toggle chat panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'c') {
        e.preventDefault();
        toggleRightPanel();
      }
      
      // Ctrl+, - Open settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        const { isSettingsOpen, setIsSettingsOpen } = useAppStore.getState();
        setIsSettingsOpen(!isSettingsOpen);
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

  // Calculate responsive widths
  const effectiveSidebarWidth = isMobile 
    ? '100%' 
    : isTablet 
      ? (sidebarCollapsed ? 0 : 'clamp(200px, 25vw, 280px)')
      : sidebarWidth;
      
  const effectiveChatWidth = isMobile 
    ? '100%' 
    : isTablet 
      ? 'clamp(280px, 35vw, 380px)'
      : rightPanelWidth;

  return (
    <div className="flex flex-col h-screen bg-base text-text overflow-hidden">
      {/* Main content area */}
      <div className={`flex flex-1 relative ${isTablet ? '' : 'overflow-hidden'}`}>
        {/* Sidebar - Responsive */}
        {sidebarOpen && (
          <>
            {/* Overlay for mobile/tablet */}
            {isTablet && (
              <div 
                className="fixed inset-0 bg-black/50 z-40 animate-fade-in"
                onClick={toggleSidebar}
              />
            )}
            <div 
              className={`
                flex-shrink-0 border-r border-surface0 animate-slide-in-left bg-base
                ${isTablet ? 'fixed inset-y-0 left-0 z-50 w-[280px]' : ''}
              `}
              style={{ 
                width: isTablet ? 280 : effectiveSidebarWidth 
              }}
            >
              <Sidebar onClose={isTablet ? toggleSidebar : undefined} />
            </div>
          </>
        )}

        {/* Editor area - Takes remaining space */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Editor />
        </div>

        {/* Right Panel - Chat (Responsive) */}
        {rightPanelOpen && (
          <>
            {/* Overlay for mobile/tablet */}
            {isTablet && (
              <div 
                className="absolute inset-0 bg-black/50 z-20 animate-fade-in"
                onClick={toggleRightPanel}
              />
            )}
            <div 
              className={`
                flex-shrink-0 border-l border-surface0 bg-base animate-slide-in-right
                ${isTablet ? 'absolute inset-y-0 right-0 z-30' : ''}
              `}
              style={{ width: effectiveChatWidth }}
            >
              <div className="flex flex-col h-full">
                {/* Close button for mobile/tablet */}
                {isTablet && (
                  <div className="flex items-center justify-between px-3 py-2 border-b border-surface0">
                    <span className="text-sm font-medium">AI Chat</span>
                    <button 
                      onClick={toggleRightPanel}
                      className="p-1 rounded hover:bg-surface0 transition-colors"
                      aria-label="Close chat"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                <Chat />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Status bar */}
      <StatusBar />
      <QuickNoteModal />
    </div>
  );
}
