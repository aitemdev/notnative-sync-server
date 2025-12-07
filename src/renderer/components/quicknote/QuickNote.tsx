import { useState, useRef, useEffect } from 'react';
import { X, Minimize2, Pin, Send } from 'lucide-react';

export default function QuickNote() {
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleClose = () => {
    window.electron.window.closeQuickNote();
  };

  const handleSave = async () => {
    if (!content.trim()) return;
    
    // Generate note name from first line or timestamp
    const firstLine = content.split('\n')[0].trim();
    const name = firstLine.length > 0 && firstLine.length < 50
      ? firstLine.replace(/[#*`\[\]]/g, '').trim()
      : `Quick Note ${new Date().toISOString().replace(/[:.]/g, '-')}`;

    try {
      await window.electron.notes.create(name, content, 'Quick Notes');
      setContent('');
      if (!isPinned) {
        handleClose();
      }
    } catch (error) {
      console.error('Error saving quick note:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    // Escape to close
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-base text-text select-none">
      {/* Title bar (draggable) */}
      <div 
        className="flex items-center justify-between px-3 py-2 bg-mantle border-b border-surface0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-sm font-medium">📝 Nota Rápida</span>
        <div 
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => setIsPinned(!isPinned)}
            className={`p-1 rounded transition-colors ${
              isPinned ? 'bg-surface1 text-lavender' : 'hover:bg-surface0 text-subtext0'
            }`}
            title={isPinned ? 'Desanclar' : 'Anclar'}
          >
            <Pin size={14} />
          </button>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-red hover:text-base transition-colors text-subtext0"
            title="Cerrar"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full h-full resize-none bg-transparent text-sm 
                     focus:outline-none placeholder-subtext0"
          placeholder="Escribe una nota rápida...&#10;&#10;Ctrl+Enter para guardar&#10;Escape para cerrar"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-surface0 bg-mantle">
        <span className="text-xs text-subtext0">
          {content.length} caracteres
        </span>
        <button
          onClick={handleSave}
          disabled={!content.trim()}
          className={`flex items-center gap-1 px-3 py-1 rounded text-sm transition-colors ${
            content.trim()
              ? 'bg-lavender text-base hover:bg-blue'
              : 'bg-surface0 text-subtext0 cursor-not-allowed'
          }`}
        >
          <Send size={14} />
          Guardar
        </button>
      </div>
    </div>
  );
}
