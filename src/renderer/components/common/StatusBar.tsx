import { useAppStore } from '../../stores/app-store';
import { Settings, PanelLeftClose, PanelLeft, MessageSquare } from 'lucide-react';
import { EditorMode } from '../../lib/editor/types';

export default function StatusBar() {
  const { 
    currentNote, 
    editorMode,
    sidebarOpen, 
    toggleSidebar,
    rightPanelOpen,
    toggleRightPanel,
  } = useAppStore();

  const getModeDisplay = () => {
    switch (editorMode) {
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

  const { text: modeText, className: modeClassName } = getModeDisplay();

  return (
    <div className="h-7 flex items-center bg-mantle text-subtext0 text-sm border-t border-surface0 select-none">
      {/* Left section */}
      <div className="flex items-center h-full">
        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          className="h-full px-2 hover:bg-surface0 hover:text-text transition-colors"
          title={sidebarOpen ? 'Ocultar sidebar (Ctrl+B)' : 'Mostrar sidebar (Ctrl+B)'}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
        </button>

        {/* Mode indicator */}
        {currentNote && (
          <div className={`h-full px-3 flex items-center font-bold text-xs ${modeClassName}`}>
            {modeText}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center h-full">
        {/* File info */}
        <span className="px-2">UTF-8</span>
        <span className="px-2">Markdown</span>
        
        {/* Chat toggle */}
        <button
          onClick={toggleRightPanel}
          className={`h-full px-2 flex items-center gap-1.5 transition-colors ${
            rightPanelOpen 
              ? 'bg-mauve text-crust' 
              : 'hover:bg-surface0 hover:text-text'
          }`}
          title={rightPanelOpen ? 'Ocultar chat (Ctrl+Shift+C)' : 'Mostrar chat (Ctrl+Shift+C)'}
        >
          <MessageSquare size={14} />
          <span className="text-xs">AI</span>
        </button>

        {/* Settings */}
        <button
          onClick={() => window.electron.app.setSettings({})}
          className="h-full px-2 hover:bg-surface0 hover:text-text transition-colors"
          title="Configuración"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}
