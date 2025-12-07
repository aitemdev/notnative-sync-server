import { useState } from 'react';
import { useAppStore, type SidebarPanel } from '../../stores/app-store';
import NotesList from './NotesList';
import SearchPanel from './SearchPanel';
import { FileText, Search, Database, MessageSquare } from 'lucide-react';

export default function Sidebar() {
  const { sidebarPanel, setSidebarPanel } = useAppStore();
  const [showNewNoteInput, setShowNewNoteInput] = useState(false);

  const panels: { id: SidebarPanel; icon: React.ElementType; label: string }[] = [
    { id: 'notes', icon: FileText, label: 'Notas' },
    { id: 'search', icon: Search, label: 'Buscar' },
    { id: 'bases', icon: Database, label: 'Bases' },
    { id: 'chat', icon: MessageSquare, label: 'Chat AI' },
  ];

  return (
    <div className="flex flex-col h-full bg-mantle">
      {/* Panel tabs */}
      <div className="flex items-center border-b border-surface0 px-2">
        {panels.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setSidebarPanel(id)}
            className={`
              flex items-center gap-1.5 px-3 py-2 text-sm
              transition-colors
              ${sidebarPanel === id 
                ? 'text-lavender border-b-2 border-lavender' 
                : 'text-subtext0 hover:text-text'
              }
            `}
            title={label}
          >
            <Icon size={16} />
            <span className="hidden lg:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {sidebarPanel === 'notes' && <NotesList />}
        {sidebarPanel === 'search' && <SearchPanel />}
        {sidebarPanel === 'bases' && (
          <div className="p-4 text-subtext0 text-sm">
            Bases de datos (próximamente)
          </div>
        )}
        {sidebarPanel === 'chat' && (
          <div className="p-4 text-subtext0 text-sm">
            Chat AI (próximamente)
          </div>
        )}
      </div>
    </div>
  );
}
