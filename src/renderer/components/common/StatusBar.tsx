import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/app-store';
import { Settings, PanelLeftClose, PanelLeft, MessageSquare, Paperclip } from 'lucide-react';
import { EditorMode } from '../../lib/editor/types';
import AttachmentsPopover from './AttachmentsPopover';

interface Attachment {
  name: string;
  path: string;
  size: number;
  type: string;
}

export default function StatusBar() {
  const { t } = useTranslation();
  const { 
    currentNote,
    currentNoteContent,
    editorMode,
    sidebarOpen, 
    toggleSidebar,
    rightPanelOpen,
    toggleRightPanel,
    setIsSettingsOpen,
  } = useAppStore();

  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const attachmentsButtonRef = useRef<HTMLButtonElement>(null);

  // Extract attachments from markdown content
  const rawAttachments = useMemo(() => {
    if (!currentNote || !currentNoteContent) return [];
    
    const results: Attachment[] = [];
    // Match markdown links: [text](path)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    
    while ((match = linkRegex.exec(currentNoteContent)) !== null) {
      const path = match[2];
      const text = match[1];
      
      // Skip images (they start with !)
      const beforeMatch = currentNoteContent.slice(Math.max(0, match.index - 1), match.index);
      if (beforeMatch === '!') continue;
      
      // Skip external URLs
      if (path.startsWith('http://') || path.startsWith('https://')) continue;
      
      // Skip wiki-style links
      if (path.startsWith('[[') || path.endsWith(']]')) continue;
      
      // This is likely a file attachment
      // Clean name: remove emoji and bullet-like chars/diamonds
      const cleaned = text
        .replace(/^[📎📄📝📊📦🎵🎬📃📜🐍☕⚙️🌐🎨🔧]\s*/, '')
        .replace(/^[\s*•·▪●◆◇◈◊❖▪︎▫︎◾◾️◽️◼️◻️-]+/, '')
        .trim();

      const fallbackName = path.split(/[\\/]/).pop() || cleaned;
      const finalName = cleaned || fallbackName;
      
      results.push({
        name: finalName,
        path: path,
        size: undefined,
        type: '',
      });
    }
    
    return results;
  }, [currentNote, currentNoteContent]);

  const [attachments, setAttachments] = useState<Attachment[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadSizes = async () => {
      if (!currentNote) {
        setAttachments([]);
        return;
      }

      const notePath = currentNote.path;
      const enriched = await Promise.all(
        rawAttachments.map(async (att) => {
          try {
            const res = await window.electron.files.getSize(att.path, notePath);
            if (res.success && typeof res.size === 'number') {
              return { ...att, size: res.size } as Attachment;
            }
          } catch (err) {
            console.warn('Failed to stat attachment', att.path, err);
          }
          return att;
        })
      );

      if (!cancelled) {
        setAttachments(enriched);
      }
    };

    void loadSizes();
    return () => {
      cancelled = true;
    };
  }, [rawAttachments, currentNote]);

  const handlePreview = (attachment: Attachment) => {
    // TODO: Implement preview modal
    console.log('Preview:', attachment);
    setAttachmentsOpen(false);
  };

  const handleDelete = (attachment: Attachment) => {
    // TODO: Implement delete with confirmation
    console.log('Delete:', attachment);
  };

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
    <>
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
          
          {/* Attachments button - only show if note has attachments */}
          {currentNote && attachments.length > 0 && (
            <button
              ref={attachmentsButtonRef}
              onClick={() => setAttachmentsOpen(!attachmentsOpen)}
              className={`h-full px-2 flex items-center gap-1 transition-colors relative ${
                attachmentsOpen
                  ? 'bg-lavender text-crust'
                  : 'hover:bg-surface0 hover:text-text'
              }`}
              title={t('statusBar.attachments', 'Archivos adjuntos')}
            >
              <Paperclip size={14} />
              <span className="text-xs">{attachments.length}</span>
            </button>
          )}
          
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

      {/* Attachments Popover */}
      <AttachmentsPopover
        attachments={attachments}
        isOpen={attachmentsOpen}
        onClose={() => setAttachmentsOpen(false)}
        onPreview={handlePreview}
        onDelete={handleDelete}
        anchorEl={attachmentsButtonRef.current}
        notePath={currentNote?.path}
      />
    </>
  );
}
