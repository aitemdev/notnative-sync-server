import { create } from 'zustand';
import type { NoteMetadata, Tag } from '../../shared/types';
import { EditorMode } from '../lib/editor/types';

export type SidebarPanel = 'notes' | 'bases' | 'search' | 'chat';
export type Theme = 'light' | 'dark' | 'system';
export type ViewMode = 'edit' | 'preview' | 'split';

// Re-export EditorMode for convenience
export { EditorMode };

interface AppState {
  // Sidebar
  sidebarPanel: SidebarPanel;
  sidebarOpen: boolean;
  sidebarWidth: number;
  sidebarNavActive: boolean;
  sidebarNavSelectedIndex: number;
  quickNoteOpen: boolean;
  
  // Right Panel (Chat)
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  
  // Editor
  currentNote: NoteMetadata | null;
  currentNoteContent: string;
  editorMode: EditorMode;
  viewMode: ViewMode;
  isModified: boolean;
  
  // Theme (legacy - now managed by ThemeProvider)
  theme: Theme;
  
  // Settings modal
  isSettingsOpen: boolean;
  
  // Search
  searchQuery: string;
  searchResults: NoteMetadata[];
  
  // Notes list
  notes: NoteMetadata[];
  folders: string[];
  expandedFolders: Set<string>;
  
  // Tags
  tags: Tag[];
  selectedTags: string[];
  
  // Actions
  setSidebarPanel: (panel: SidebarPanel) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setSidebarNavActive: (active: boolean) => void;
  setSidebarNavSelectedIndex: (index: number) => void;
  toggleSidebarNav: () => void;
  setQuickNoteOpen: (open: boolean) => void;
  
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  
  setCurrentNote: (note: NoteMetadata | null) => void;
  setCurrentNoteContent: (content: string) => void;
  setEditorMode: (mode: EditorMode) => void;
  setViewMode: (mode: ViewMode) => void;
  cycleViewMode: () => void;
  setIsModified: (modified: boolean) => void;
  
  setTheme: (theme: Theme) => void;
  
  // Settings modal
  setIsSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
  
  setSearchQuery: (query: string) => void;
  setSearchResults: (results: NoteMetadata[]) => void;
  
  setNotes: (notes: NoteMetadata[]) => void;
  addNote: (note: NoteMetadata) => void;
  removeNote: (noteId: number) => void;
  updateNote: (noteId: number, updates: Partial<NoteMetadata>) => void;
  
  setFolders: (folders: string[]) => void;
  toggleFolder: (folder: string) => void;
  
  setTags: (tags: Tag[]) => void;
  toggleTagFilter: (tag: string) => void;
  clearTagFilters: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  sidebarPanel: 'notes',
  sidebarOpen: true,
  sidebarWidth: 280,
  sidebarNavActive: false,
  sidebarNavSelectedIndex: -1,
  quickNoteOpen: false,
  
  rightPanelOpen: false,
  rightPanelWidth: 400,
  
  currentNote: null,
  currentNoteContent: '',
  editorMode: EditorMode.Normal,
  viewMode: (localStorage.getItem('notnative-viewMode') as ViewMode) || 'edit',
  isModified: false,
  
  theme: 'system',
  
  // Settings modal
  isSettingsOpen: false,
  
  searchQuery: '',
  searchResults: [],
  
  notes: [],
  folders: [],
  expandedFolders: new Set(),
  
  tags: [],
  selectedTags: [],
  
  // Actions
  setSidebarPanel: (panel) => set({ sidebarPanel: panel }),
  toggleSidebar: () => set((state) => {
    const newSidebarOpen = !state.sidebarOpen;
    console.log('toggleSidebar called, current:', state.sidebarOpen, '-> new:', newSidebarOpen);
    // If closing sidebar, also deactivate nav
    if (!newSidebarOpen) {
      return { sidebarOpen: false, sidebarNavActive: false, sidebarNavSelectedIndex: -1 };
    }
    return { sidebarOpen: true };
  }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(500, width)) }),
  setSidebarNavActive: (active) => {
    console.log('setSidebarNavActive called with:', active, new Error().stack);
    set({ sidebarNavActive: active });
  },
  setSidebarNavSelectedIndex: (index) => set({ sidebarNavSelectedIndex: index }),
  toggleSidebarNav: () => set((state) => {
    // If activating, also open sidebar
    if (!state.sidebarNavActive && !state.sidebarOpen) {
      return { sidebarNavActive: true, sidebarOpen: true };
    }
    return { sidebarNavActive: !state.sidebarNavActive };
  }),
  setQuickNoteOpen: (open) => set({ quickNoteOpen: open }),
  
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightPanelWidth: (width) => set({ rightPanelWidth: Math.max(300, Math.min(600, width)) }),
  
  setCurrentNote: (note) => set({ currentNote: note, isModified: false }),
  setCurrentNoteContent: (content) => set({ currentNoteContent: content }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setViewMode: (mode) => {
    localStorage.setItem('notnative-viewMode', mode);
    set({ viewMode: mode });
  },
  cycleViewMode: () => {
    const current = get().viewMode;
    const next = current === 'edit' ? 'preview' : current === 'preview' ? 'split' : 'edit';
    localStorage.setItem('notnative-viewMode', next);
    set({ viewMode: next });
  },
  setIsModified: (modified) => set({ isModified: modified }),
  
  setTheme: (theme) => set({ theme }),
  
  // Settings modal
  setIsSettingsOpen: (open) => set({ isSettingsOpen: open }),
  toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSearchResults: (results) => set({ searchResults: results }),
  
  setNotes: (notes) => set({ notes }),
  addNote: (note) => set((state) => ({ notes: [...state.notes, note] })),
  removeNote: (noteId) => set((state) => ({
    notes: state.notes.filter(n => n.id !== noteId),
    currentNote: state.currentNote?.id === noteId ? null : state.currentNote,
  })),
  updateNote: (noteId, updates) => set((state) => ({
    notes: state.notes.map(n => n.id === noteId ? { ...n, ...updates } : n),
    currentNote: state.currentNote?.id === noteId 
      ? { ...state.currentNote, ...updates } 
      : state.currentNote,
  })),
  
  setFolders: (folders) => set({ folders }),
  toggleFolder: (folder) => set((state) => {
    const expanded = new Set(state.expandedFolders);
    if (expanded.has(folder)) {
      expanded.delete(folder);
    } else {
      expanded.add(folder);
    }
    return { expandedFolders: expanded };
  }),
  
  setTags: (tags) => set({ tags }),
  toggleTagFilter: (tag) => set((state) => {
    const selected = state.selectedTags.includes(tag)
      ? state.selectedTags.filter(t => t !== tag)
      : [...state.selectedTags, tag];
    return { selectedTags: selected };
  }),
  clearTagFilters: () => set({ selectedTags: [] }),
}));
