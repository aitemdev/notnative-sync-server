import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore, type SidebarPanel } from '../../stores/app-store';
import NotesList from './NotesList';
import SearchPanel from './SearchPanel';
import { FileText, Search, Database, MessageSquare } from 'lucide-react';

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { sidebarPanel, setSidebarPanel } = useAppStore();
  const [showNewNoteInput, setShowNewNoteInput] = useState(false);

  const panels: { id: SidebarPanel; icon: React.ElementType; label: string }[] = [
    { id: 'notes', icon: FileText, label: t('sidebar.panels.notes') },
    { id: 'search', icon: Search, label: t('sidebar.panels.search') },
    { id: 'bases', icon: Database, label: t('sidebar.panels.bases') },
    { id: 'chat', icon: MessageSquare, label: t('sidebar.panels.chat') },
  ];

  return (
    <div className="flex flex-col h-full bg-mantle">
      {/* Panel tabs */}
      <div className="flex items-center justify-center h-10 border-b border-surface0 px-1 overflow-x-auto scrollbar-none">
        {panels.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setSidebarPanel(id)}
            className={`
              flex items-center h-full gap-1.5 px-2.5 text-xs whitespace-nowrap
              transition-colors flex-shrink-0 border-b-2
              ${sidebarPanel === id 
                ? 'text-lavender border-lavender' 
                : 'text-subtext0 hover:text-text border-transparent'
              }
            `}
            title={label}
          >
            <Icon size={14} className="flex-shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {sidebarPanel === 'notes' && <NotesList />}
        {sidebarPanel === 'search' && <SearchPanel />}
        {sidebarPanel === 'bases' && (
          <div className="p-3 sm:p-4 text-subtext0 text-xs sm:text-sm">
            {t('sidebar.basesComingSoon')}
          </div>
        )}
        {sidebarPanel === 'chat' && (
          <div className="p-3 sm:p-4 text-subtext0 text-xs sm:text-sm">
            {t('sidebar.chatComingSoon')}
          </div>
        )}
      </div>
    </div>
  );
}
