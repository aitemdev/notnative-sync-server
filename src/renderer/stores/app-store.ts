import { create } from 'zustand';
import type { NoteMetadata, Tag } from '../../shared/types';
import { EditorMode } from '../lib/editor/types';

export type SidebarPanel = 'notes' | 'bases' | 'search' | 'chat';
export type Theme = 'light' | 'dark' | 'system';

// Re-export EditorMode for convenience
export { EditorMode };

interface AppState {
  // Sidebar
  sidebarPanel: SidebarPanel;
  sidebarOpen: boolean;
  sidebarWidth: number;
  
  // Right Panel (Chat)
  rightPanelOpen: boolean;
  rightPanelWidth: number;
  
  // Editor
  currentNote: NoteMetadata | null;
  currentNoteContent: string;
  editorMode: EditorMode;
  isModified: boolean;
  
  // Theme
  theme: Theme;
  
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
  
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  
  setCurrentNote: (note: NoteMetadata | null) => void;
  setCurrentNoteContent: (content: string) => void;
  setEditorMode: (mode: EditorMode) => void;
  setIsModified: (modified: boolean) => void;
  
  setTheme: (theme: Theme) => void;
  
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
  
  rightPanelOpen: false,
  rightPanelWidth: 400,
  
  currentNote: null,
  currentNoteContent: '',
  editorMode: EditorMode.Normal,
  isModified: false,
  
  theme: 'system',
  
  searchQuery: '',
  searchResults: [],
  
  notes: [],
  folders: [],
  expandedFolders: new Set(),
  
  tags: [],
  selectedTags: [],
  
  // Actions
  setSidebarPanel: (panel) => set({ sidebarPanel: panel }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(500, width)) }),
  
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
  setRightPanelWidth: (width) => set({ rightPanelWidth: Math.max(300, Math.min(600, width)) }),
  
  setCurrentNote: (note) => set({ currentNote: note, isModified: false }),
  setCurrentNoteContent: (content) => set({ currentNoteContent: content }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setIsModified: (modified) => set({ isModified: modified }),
  
  setTheme: (theme) => set({ theme }),
  
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
