import { useEffect } from 'react';
import { Link2, FileText, Folder, Loader2, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLinks } from '../../hooks/useLinks';
import { useAppStore } from '../../stores/app-store';

export function BacklinksPanel() {
  const { t } = useTranslation();
  const { currentNote, setCurrentNote, setCurrentNoteContent } = useAppStore();
  const { backlinks, outgoingLinks, isLoading, error, refetch } = useLinks(currentNote?.id || null);

  // Refetch when note content is saved (to update links)
  useEffect(() => {
    if (currentNote) {
      const unsubscribe = window.electron.notes_events.onContentUpdated((data) => {
        if (data.id === currentNote.id) {
          // Debounce the refetch slightly to allow database to update
          setTimeout(() => {
            refetch();
          }, 500);
        }
      });

      return unsubscribe;
    }
  }, [currentNote, refetch]);

  const handleBacklinkClick = async (backlink: typeof backlinks[0]) => {
    try {
      const note = await window.electron.notes.readById(backlink.noteId);
      if (note) {
        setCurrentNote(note);
        setCurrentNoteContent(note.content);
      }
    } catch (err) {
      console.error('Error opening backlink:', err);
    }
  };

  const handleOutgoingLinkClick = async (link: typeof outgoingLinks[0]) => {
    try {
      const note = await window.electron.notes.readById(link.targetNoteId);
      if (note) {
        setCurrentNote(note);
        setCurrentNoteContent(note.content);
      }
    } catch (err) {
      console.error('Error opening link:', err);
    }
  };

  if (!currentNote) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4 text-center">
        <Link2 size={48} className="text-overlay0 mb-3" />
        <p className="text-sm text-subtext0">
          {t('backlinks.noNoteSelected', 'Selecciona una nota para ver sus enlaces')}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-base">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-surface0 bg-mantle">
        <div className="flex items-center gap-2">
          <Link2 size={16} className="text-lavender" />
          <h2 className="text-sm font-semibold text-text">
            {t('backlinks.title', 'Enlaces')}
          </h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={24} className="animate-spin text-lavender" />
          </div>
        ) : error ? (
          <div className="p-4">
            <div className="text-sm text-red bg-red/10 rounded p-3">
              {t('backlinks.error', 'Error al cargar enlaces')}: {error}
            </div>
          </div>
        ) : (
          <>
            {/* Backlinks (Incoming) */}
            <div className="p-4 border-b border-surface0">
              <h3 className="text-xs font-semibold text-subtext0 uppercase mb-2 flex items-center gap-2">
                <ChevronRight size={12} />
                {t('backlinks.incoming', 'Referencias')} ({backlinks.length})
              </h3>
              
              {backlinks.length === 0 ? (
                <p className="text-xs text-subtext1 italic py-2">
                  {t('backlinks.noBacklinks', 'No hay notas que referencien esta nota')}
                </p>
              ) : (
                <div className="space-y-2">
                  {backlinks.map((backlink) => (
                    <button
                      key={backlink.noteId}
                      onClick={() => handleBacklinkClick(backlink)}
                      className="w-full text-left p-2 rounded hover:bg-surface0 transition-colors group"
                    >
                      <div className="flex items-start gap-2">
                        <FileText size={14} className="text-blue mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-text font-medium group-hover:text-lavender transition-colors truncate">
                            {backlink.noteName}
                          </div>
                          {backlink.noteFolder && (
                            <div className="flex items-center gap-1 text-xs text-subtext0 mt-0.5">
                              <Folder size={10} />
                              <span className="truncate">{backlink.noteFolder}</span>
                            </div>
                          )}
                          {backlink.context && (
                            <div className="text-xs text-subtext1 mt-1 line-clamp-2 font-mono bg-surface0 px-2 py-1 rounded">
                              {backlink.context}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing Links */}
            <div className="p-4">
              <h3 className="text-xs font-semibold text-subtext0 uppercase mb-2 flex items-center gap-2">
                <ChevronRight size={12} />
                {t('backlinks.outgoing', 'Enlaces salientes')} ({outgoingLinks.length})
              </h3>
              
              {outgoingLinks.length === 0 ? (
                <p className="text-xs text-subtext1 italic py-2">
                  {t('backlinks.noOutgoing', 'Esta nota no enlaza a otras notas')}
                </p>
              ) : (
                <div className="space-y-2">
                  {outgoingLinks.map((link) => (
                    <button
                      key={link.id}
                      onClick={() => handleOutgoingLinkClick(link)}
                      className="w-full text-left p-2 rounded hover:bg-surface0 transition-colors group"
                    >
                      <div className="flex items-start gap-2">
                        <FileText size={14} className="text-green mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-text font-medium group-hover:text-lavender transition-colors truncate">
                            {link.targetName}
                          </div>
                          {link.targetFolder && (
                            <div className="flex items-center gap-1 text-xs text-subtext0 mt-0.5">
                              <Folder size={10} />
                              <span className="truncate">{link.targetFolder}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer with stats */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-surface0 bg-mantle">
        <div className="text-xs text-subtext0 flex items-center justify-between">
          <span>
            {backlinks.length} {t('backlinks.references', 'referencias')}
          </span>
          <span>
            {outgoingLinks.length} {t('backlinks.links', 'enlaces')}
          </span>
        </div>
      </div>
    </div>
  );
}

export default BacklinksPanel;
