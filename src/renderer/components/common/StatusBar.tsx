import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../stores/app-store';
import { Settings, PanelLeftClose, PanelLeft, MessageSquare } from 'lucide-react';
import { EditorMode } from '../../lib/editor/types';

export default function StatusBar() {
  const { t } = useTranslation();
  const { 
    currentNote, 
    editorMode,
    sidebarOpen, 
    toggleSidebar,
    rightPanelOpen,
    toggleRightPanel,
    setIsSettingsOpen,
  } = useAppStore();

  const getModeDisplay = () => {
    switch (editorMode) {
      case EditorMode.Normal:
        return { text: t('editorModes.normal'), className: 'bg-blue text-crust' };
      case EditorMode.Insert:
        return { text: t('editorModes.insert'), className: 'bg-green text-crust' };
      case EditorMode.Visual:
        return { text: t('editorModes.visual'), className: 'bg-mauve text-crust' };
      case EditorMode.Command:
        return { text: t('editorModes.command'), className: 'bg-yellow text-crust' };
      case EditorMode.Search:
        return { text: t('editorModes.search'), className: 'bg-peach text-crust' };
      default:
        return { text: t('editorModes.normal'), className: 'bg-blue text-crust' };
    }
  };

  const { text: modeText, className: modeClassName } = getModeDisplay();

  return (
    <div className="h-7 flex items-center bg-mantle text-subtext0 text-xs sm:text-sm border-t border-surface0 select-none">
      {/* Left section */}
      <div className="flex items-center h-full">
        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          className="h-full px-2 hover:bg-surface0 hover:text-text transition-colors"
          title={sidebarOpen ? `${t('statusBar.hideSidebar')} (Ctrl+B)` : `${t('statusBar.showSidebar')} (Ctrl+B)`}
        >
          {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
        </button>

        {/* Mode indicator */}
        {currentNote && (
          <div className={`h-full px-2 sm:px-3 flex items-center font-bold text-xs ${modeClassName}`}>
            {modeText}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center h-full">
        {/* File info - hidden on mobile */}
        <span className="hidden sm:inline px-2">UTF-8</span>
        <span className="hidden sm:inline px-2">Markdown</span>
        
        {/* Chat toggle */}
        <button
          onClick={toggleRightPanel}
          className={`h-full px-2 flex items-center gap-1 sm:gap-1.5 transition-colors ${
            rightPanelOpen 
              ? 'bg-mauve text-crust' 
              : 'hover:bg-surface0 hover:text-text'
          }`}
          title={rightPanelOpen ? `${t('statusBar.hideChat')} (Ctrl+Shift+C)` : `${t('statusBar.showChat')} (Ctrl+Shift+C)`}
        >
          <MessageSquare size={14} />
          <span className="text-xs hidden sm:inline">AI</span>
        </button>

        {/* Settings */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="h-full px-2 hover:bg-surface0 hover:text-text transition-colors"
          title={`${t('statusBar.settings')} (Ctrl+,)`}
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
}
