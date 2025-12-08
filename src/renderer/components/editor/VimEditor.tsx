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
import { createWikilinkExtension } from '../../lib/editor/wikilink-extension';
import { useAppStore } from '../../stores/app-store';
import SelectionBubble from './SelectionBubble';

// Global ref to access editor view from outside
let globalEditorView: EditorView | null = null;

export function getGlobalEditorView(): EditorView | null {
  return globalEditorView;
}

export default function VimEditor({ 
  initialContent, 
  onSave, 
  onChange,
  onModeChange,
  onScroll,
  noteId,
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
  const noteIdRef = useRef<number | null>(noteId ?? null);
  
  // Flag to suppress onChange when updating from external props
  const isExternalUpdateRef = useRef(false);
  
  // Selection bubble state
  const [showBubble, setShowBubble] = useState(false);
  const [bubblePosition, setBubblePosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ from: number; to: number } | null>(null);
  const bubbleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    noteIdRef.current = noteId ?? null;
  }, [noteId]);

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

    const insertMarkdownAt = (view: EditorView, markdown: string, position?: number) => {
      const pos = typeof position === 'number' ? position : view.state.selection.main.from;
      const doc = view.state.doc.toString();
      const needsPrefix = pos > 0 && doc[pos - 1] !== '\n';
      const insertText = `${needsPrefix ? '\n' : ''}${markdown}\n`;
      view.dispatch({
        changes: {
          from: pos,
          to: pos,
          insert: insertText,
        },
        selection: { anchor: pos + insertText.length },
      });
      view.focus();
      return insertText.length;
    };

    const getFileIcon = (fileName: string): string => {
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      const iconMap: Record<string, string> = {
        pdf: '📄',
        doc: '📝', docx: '📝',
        xls: '📊', xlsx: '📊',
        ppt: '📊', pptx: '📊',
        zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
        mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
        mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬', webm: '🎬',
        txt: '📃', md: '📃',
        js: '📜', ts: '📜', jsx: '📜', tsx: '📜',
        py: '🐍', java: '☕', cpp: '⚙️', c: '⚙️',
        html: '🌐', css: '🎨', json: '🔧',
      };
      return iconMap[ext] || '📎';
    };

    const saveFilesAndInsert = async (files: File[], view: EditorView, position?: number) => {
      const currentNoteId = noteIdRef.current;
      if (!currentNoteId) {
        console.warn('Skipping file insert: no note id');
        return;
      }

      let cursor = position ?? view.state.selection.main.from;

      for (const file of files) {
        try {
          // Check file size (max 50MB)
          const maxSize = 50 * 1024 * 1024;
          if (file.size > maxSize) {
            console.warn(`File ${file.name} exceeds 50MB limit, skipping`);
            continue;
          }

          // Block executables
          const ext = file.name.split('.').pop()?.toLowerCase() || '';
          const blockedExts = ['exe', 'sh', 'bat', 'cmd', 'app', 'dmg', 'msi'];
          if (blockedExts.includes(ext)) {
            console.warn(`File type .${ext} is not allowed, skipping ${file.name}`);
            continue;
          }

          const arrayBuffer = await file.arrayBuffer();
          const data = new Uint8Array(arrayBuffer);
          const response = await window.electron.images.save(currentNoteId, file.name || 'file', data);
          const relPath = response.relativePath.replace(/\\/g, '/');
          
          // If it's an image, use image syntax, otherwise use link with icon
          const isImage = file.type.startsWith('image/');
          let markdown: string;
          if (isImage) {
            const alt = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
            markdown = `![${alt}](${relPath})`;
          } else {
            const icon = getFileIcon(file.name);
            markdown = `[${icon} ${file.name}](${relPath})`;
          }
          
          const inserted = insertMarkdownAt(view, markdown, cursor);
          cursor += inserted;
        } catch (error) {
          console.error('Error saving file', error);
        }
      }
    };

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
      
      // Wikilink extension with autocompletion and decorations
      createWikilinkExtension(
        useAppStore.getState().notes,
        (target) => {
          // Handle wikilink click - open the note
          console.log('🔗 Wikilink clicked:', target);
          const notes = useAppStore.getState().notes;
          const targetNote = notes.find(n => 
            n.name === target || 
            (target.includes('/') && `${n.folder}/${n.name}` === target) ||
            n.name.toLowerCase() === target.toLowerCase()
          );
          
          if (targetNote) {
            const { setCurrentNote, setCurrentNoteContent } = useAppStore.getState();
            window.electron.notes.readById(targetNote.id).then(note => {
              if (note) {
                setCurrentNote(note);
                setCurrentNoteContent(note.content);
              }
            });
          }
        }
      ),
      
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
          
          // Only trigger onChange if this is NOT an external update (from props)
          if (!isExternalUpdateRef.current) {
            onChange?.(content);
          }
          // Note: Don't hide bubble here - let the bubble handle its own lifecycle
          // The bubble should only close when the user explicitly closes it or accepts a change
        }
        
        // Track cursor position
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        setCursorPos({
          line: line.number,
          col: pos - line.from + 1,
        });
        
        // Track selection changes - update selection range but DON'T auto-show bubble
        const selection = update.state.selection.main;
        if (selection.from !== selection.to) {
          const text = update.state.doc.sliceString(selection.from, selection.to);
          if (text.trim().length > 0) {
            setSelectedText(text);
            setSelectionRange({ from: selection.from, to: selection.to });
          }
        }
        // Note: Don't hide bubble when selection is lost - user might be interacting with the bubble
        
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
        paste: (event, view) => {
          const files = Array.from(event.clipboardData?.files || []);
          if (!files.length) return false;
          event.preventDefault();
          event.stopPropagation();
          void saveFilesAndInsert(files, view);
          return true;
        },
        drop: (event, view) => {
          event.preventDefault();
          event.stopPropagation();
          
          const files = Array.from(event.dataTransfer?.files || []);
          if (!files.length) return false;
          
          const position = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
          view.dispatch({ selection: { anchor: position } });
          void saveFilesAndInsert(files, view, position);
          return true;
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
    globalEditorView = view;
    initialContentRef.current = initialContent;

    // Focus editor
    view.focus();

    return () => {
      globalEditorView = null;
      view.destroy();
    };
  }, []); // Only run once on mount

  // Update content when initialContent changes (new note selected or AI update)
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
      console.log('📝 VimEditor: Updating editor content from external source');
      
      // Set flag to prevent onChange from firing during this update
      isExternalUpdateRef.current = true;
      
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: initialContent,
        },
      });
      initialContentRef.current = initialContent;
      contentRef.current = initialContent;
      
      // Reset flag after a microtask to ensure the update is processed
      queueMicrotask(() => {
        isExternalUpdateRef.current = false;
      });
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

  // Handle AI actions from selection bubble
  const handleAIAction = useCallback(async (text: string, action: 'chat' | 'improve' | 'explain' | 'replace') => {
    const { setRightPanelOpen, setActiveRightPanel } = useAppStore.getState();
    
    if (action === 'chat' || action === 'explain') {
      // Open chat panel and send message
      setRightPanelOpen(true);
      setActiveRightPanel('chat');
      
      // Prepare the message based on action
      let message = '';
      if (action === 'chat') {
        message = `Quiero preguntarte sobre este texto:\n\n"${text}"`;
      } else if (action === 'explain') {
        message = `Por favor, explícame este texto:\n\n"${text}"`;
      }
      
      // Send message to chat (we'll emit an event that chat can listen to)
      window.dispatchEvent(new CustomEvent('ai-chat-message', { 
        detail: { message, autoSend: true } 
      }));
      
      setShowBubble(false);
    } else if (action === 'improve') {
      // Improve text directly and replace
      try {
        const response = await window.electron.ai.sendMessage(
          null, 
          `Mejora el siguiente texto, haciéndolo más claro, conciso y bien redactado. Devuelve SOLO el texto mejorado, sin explicaciones ni comentarios adicionales:\n\n${text}`
        );
        
        if (response?.message?.content && selectionRange && viewRef.current) {
          viewRef.current.dispatch({
            changes: {
              from: selectionRange.from,
              to: selectionRange.to,
              insert: response.message.content,
            },
          });
        }
      } catch (error) {
        console.error('Error improving text:', error);
      }
      setShowBubble(false);
    } else if (action === 'replace') {
      // Custom instruction - the text already includes the instruction
      try {
        const response = await window.electron.ai.sendMessage(
          null,
          `${text}\n\nDevuelve SOLO el texto modificado según las instrucciones, sin explicaciones adicionales.`
        );
        
        if (response?.message?.content && selectionRange && viewRef.current) {
          viewRef.current.dispatch({
            changes: {
              from: selectionRange.from,
              to: selectionRange.to,
              insert: response.message.content,
            },
          });
        }
      } catch (error) {
        console.error('Error with custom edit:', error);
      }
      setShowBubble(false);
    }
  }, [selectionRange]);

  // Handle text replacement from bubble
  const handleReplaceText = useCallback((newText: string) => {
    if (selectionRange && viewRef.current) {
      viewRef.current.dispatch({
        changes: {
          from: selectionRange.from,
          to: selectionRange.to,
          insert: newText,
        },
      });
      setShowBubble(false);
      // Return focus to editor
      setTimeout(() => viewRef.current?.focus(), 50);
    }
  }, [selectionRange]);

  // Handle bubble close - return focus to editor
  const handleBubbleClose = useCallback(() => {
    setShowBubble(false);
    setTimeout(() => viewRef.current?.focus(), 50);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (bubbleTimeoutRef.current) {
        clearTimeout(bubbleTimeoutRef.current);
      }
    };
  }, []);

  // Handle Ctrl+K to show bubble for current selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !e.shiftKey && !e.altKey) {
        const view = viewRef.current;
        if (view) {
          const selection = view.state.selection.main;
          if (selection.from !== selection.to) {
            e.preventDefault();
            e.stopPropagation();
            const text = view.state.doc.sliceString(selection.from, selection.to);
            const coords = view.coordsAtPos(selection.to);
            if (coords && text.trim().length > 0) {
              // Cancel any pending bubble timeout
              if (bubbleTimeoutRef.current) {
                clearTimeout(bubbleTimeoutRef.current);
              }
              setSelectedText(text);
              setSelectionRange({ from: selection.from, to: selection.to });
              setBubblePosition({ x: coords.left, y: coords.bottom + 8 });
              setShowBubble(true);
            }
          }
        }
      }
    };

    // Use capture phase to intercept before CodeMirror/Vim
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

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
      
      {/* Selection bubble for AI actions */}
      {showBubble && selectedText && (
        <SelectionBubble
          selectedText={selectedText}
          noteContent={contentRef.current}
          position={bubblePosition}
          onClose={handleBubbleClose}
          onAskAI={handleAIAction}
          onReplaceText={handleReplaceText}
        />
      )}
    </div>
  );
}

// Export for use in other components
export { EditorMode };
