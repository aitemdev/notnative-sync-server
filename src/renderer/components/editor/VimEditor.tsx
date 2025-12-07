import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { EditorState, Extension } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { vim, Vim, getCM } from '@replit/codemirror-vim';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorMode, type VimEditorProps } from '../../lib/editor/types';
import { notnativeDark, notnativeSyntax } from '../../lib/editor/themes';
import { useAppStore } from '../../stores/app-store';

export default function VimEditor({ 
  initialContent, 
  onSave, 
  onChange,
  onModeChange,
  onScroll,
  readOnly = false,
  className = '',
}: VimEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [commandBuffer, setCommandBuffer] = useState('');
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const contentRef = useRef(initialContent);
  const initialContentRef = useRef(initialContent);
  const lastModeRef = useRef<EditorMode>(EditorMode.Normal);

  // Define vim ex commands
  const setupVimCommands = useCallback(() => {
    const { cycleViewMode } = useAppStore.getState();
    
    // :w - Save
    Vim.defineEx('write', 'w', () => {
      const content = viewRef.current?.state.doc.toString() || '';
      onSave(content);
    });

    // :q - Quit (close note)
    Vim.defineEx('quit', 'q', () => {
      // Could emit an event to close the note
      console.log('Quit command');
    });

    // :wq - Save and quit
    Vim.defineEx('wq', '', () => {
      const content = viewRef.current?.state.doc.toString() || '';
      onSave(content);
    });

    // :e - Edit file (open note)
    Vim.defineEx('edit', 'e', (_cm: unknown, params: { args?: string[] }) => {
      const filename = params.args?.[0];
      if (filename) {
        console.log('Open note:', filename);
        // Could emit an event to open a note
      }
    });
    
    // :preview / :pre - Toggle preview mode
    Vim.defineEx('preview', 'pre', () => {
      cycleViewMode();
    });
  }, [onSave]);

  // Map vim mode to our enum
  const mapVimMode = (vimState: any): EditorMode => {
    if (!vimState) return EditorMode.Normal;
    
    const mode = vimState.mode;
    const subMode = vimState.visualMode;
    
    if (mode === 'insert' || mode === 'replace') {
      return EditorMode.Insert;
    }
    if (mode === 'visual' || subMode) {
      return EditorMode.Visual;
    }
    return EditorMode.Normal;
  };

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current) return;

    setupVimCommands();

    const extensions: Extension[] = [
      // Vim mode (must be first)
      vim(),
      
      // Markdown support with syntax highlighting for code blocks
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      
      // Syntax highlighting
      notnativeSyntax,
      
      // Theme
      notnativeDark,
      
      // History (undo/redo)
      history(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...closeBracketsKeymap,
        ...searchKeymap,
      ]),
      
      // UI features
      lineNumbers(),
      highlightActiveLine(),
      drawSelection(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      
      // Read-only mode
      EditorState.readOnly.of(readOnly),
      
      // Update listener
      EditorView.updateListener.of((update) => {
        // Track content changes
        if (update.docChanged) {
          const content = update.state.doc.toString();
          contentRef.current = content;
          onChange?.(content);
        }
        
        // Track cursor position
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        setCursorPos({
          line: line.number,
          col: pos - line.from + 1,
        });
        
        // Track vim mode changes
        const cm = getCM(update.view);
        if (cm) {
          const vimState = (cm as any).state?.vim;
          const newMode = mapVimMode(vimState);
          if (newMode !== lastModeRef.current) {
            console.log('🎯 Vim mode changed:', lastModeRef.current, '->', newMode);
            lastModeRef.current = newMode;
            onModeChange?.(newMode);
          }
        }
      }),
      
      // Editor styling
      EditorView.theme({
        '&': {
          height: '100%',
          width: '100%',
        },
        '.cm-scroller': {
          overflow: 'auto',
          overflowX: 'hidden',
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        },
        '.cm-content': {
          maxWidth: '100%',
        },
        '.cm-line': {
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        },
      }),
      
      // Scroll event listener for sync and keyup for mode detection
      EditorView.domEventHandlers({
        scroll: (event) => {
          if (onScroll) {
            const target = event.target as HTMLElement;
            onScroll(target.scrollTop, target.scrollHeight, target.clientHeight);
          }
          return false;
        },
        keyup: (event, view) => {
          // Check vim mode after key release (especially for ESC)
          const cm = getCM(view);
          if (cm) {
            const vimState = (cm as any).state?.vim;
            const newMode = mapVimMode(vimState);
            if (newMode !== lastModeRef.current) {
              console.log('🎯 Vim mode changed (keyup):', lastModeRef.current, '->', newMode);
              lastModeRef.current = newMode;
              onModeChange?.(newMode);
            }
          }
          return false;
        },
      }),
      
      // Enable line wrapping
      EditorView.lineWrapping,
    ];

    const state = EditorState.create({
      doc: initialContent,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
    initialContentRef.current = initialContent;

    // Focus editor
    view.focus();

    return () => {
      view.destroy();
    };
  }, []); // Only run once on mount

  // Update content when initialContent changes (new note selected)
  useEffect(() => {
    if (!viewRef.current) {
      console.log('📝 VimEditor: No view ref');
      return;
    }
    
    console.log('📝 VimEditor: initialContent changed', { 
      initialContent: initialContent?.substring(0, 50),
      initialContentRef: initialContentRef.current?.substring(0, 50),
    });
    
    // Only update if content actually changed from external source
    const currentContent = viewRef.current.state.doc.toString();
    
    // Check if the new content is different from what's in the editor
    if (initialContent !== currentContent) {
      console.log('📝 VimEditor: Updating editor content');
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: initialContent,
        },
      });
      initialContentRef.current = initialContent;
      contentRef.current = initialContent;
    }
  }, [initialContent]);

  // Get current content
  const getContent = useCallback(() => {
    return viewRef.current?.state.doc.toString() || contentRef.current;
  }, []);

  // Force save
  const forceSave = useCallback(() => {
    onSave(getContent());
  }, [onSave, getContent]);

  return (
    <div className={`vim-editor flex flex-col h-full ${className}`}>
      {/* Editor container */}
      <div 
        ref={editorRef} 
        className="flex-1 overflow-hidden"
        onKeyDown={(e) => {
          // Ctrl+S to save
          if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            forceSave();
          }
        }}
      />
    </div>
  );
}

// Export for use in other components
export { EditorMode };
