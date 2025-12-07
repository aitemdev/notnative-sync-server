import { EditorMode } from '../../lib/editor/types';

interface VimStatusBarProps {
  mode: EditorMode;
  noteName?: string;
  line?: number;
  column?: number;
  isModified?: boolean;
  fileType?: string;
}

export default function VimStatusBar({
  mode,
  noteName = '',
  line = 1,
  column = 1,
  isModified = false,
  fileType = 'Markdown',
}: VimStatusBarProps) {
  const getModeDisplay = () => {
    switch (mode) {
      case EditorMode.Normal:
        return { text: 'NORMAL', className: 'bg-blue text-crust' };
      case EditorMode.Insert:
        return { text: 'INSERT', className: 'bg-green text-crust' };
      case EditorMode.Visual:
        return { text: 'VISUAL', className: 'bg-mauve text-crust' };
      case EditorMode.Command:
        return { text: 'COMMAND', className: 'bg-yellow text-crust' };
      case EditorMode.Search:
        return { text: 'SEARCH', className: 'bg-peach text-crust' };
      default:
        return { text: 'NORMAL', className: 'bg-blue text-crust' };
    }
  };

  const { text, className } = getModeDisplay();

  return (
    <div className="vim-status-bar flex items-center h-7 bg-mantle text-subtext0 text-sm border-t border-surface0 select-none">
      {/* Left section */}
      <div className="flex items-center">
        {/* Mode indicator */}
        <div className={`px-3 py-0.5 font-bold ${className}`}>
          {text}
        </div>
        
        {/* Note name */}
        <div className="px-3 flex items-center gap-1">
          <span className="text-text">{noteName}</span>
          {isModified && (
            <span className="text-yellow">[+]</span>
          )}
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center gap-4 px-3">
        {/* File type */}
        <span>{fileType}</span>
        
        {/* Encoding */}
        <span>UTF-8</span>
        
        {/* Cursor position */}
        <span className="font-mono">
          Ln {line}, Col {column}
        </span>
      </div>
    </div>
  );
}
