// Editor types
export enum EditorMode {
  Normal = 'normal',
  Insert = 'insert',
  Visual = 'visual',
  Command = 'command',
  Search = 'search',
}

export interface EditorState {
  mode: EditorMode;
  content: string;
  cursorPosition: { line: number; column: number };
  selection: { start: number; end: number } | null;
  commandBuffer: string;
  searchQuery: string;
  isModified: boolean;
}

export interface VimEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  onChange?: (content: string) => void;
  onModeChange?: (mode: EditorMode) => void;
  onScroll?: (scrollTop: number, scrollHeight: number, clientHeight: number) => void;
  readOnly?: boolean;
  className?: string;
}
