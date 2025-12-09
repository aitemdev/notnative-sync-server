import React, { useState, useEffect } from 'react';
import { X, Clock, RotateCcw, Eye, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from './ConfirmDialog';
import { useAppStore } from '../../stores/app-store';

interface HistoryVersion {
  path: string;
  filename: string;
  timestamp: number;
  date: Date;
}

interface NoteHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteName: string;
  noteId: number;
}

export function NoteHistoryModal({ isOpen, onClose, noteName, noteId }: NoteHistoryModalProps) {
  const { t } = useTranslation();
  const { setCurrentNote, setCurrentNoteContent } = useAppStore();
  const [history, setHistory] = useState<HistoryVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<HistoryVersion | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    version: null as HistoryVersion | null,
  });

  useEffect(() => {
    if (isOpen && noteName) {
      loadHistory();
    }
  }, [isOpen, noteName]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const versions = await window.electron.notes.getHistory(noteName);
      setHistory(versions);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (version: HistoryVersion) => {
    try {
      const content = await window.electron.notes.getHistoryContent(version.path);
      setPreviewContent(content);
      setPreviewVersion(version);
    } catch (error) {
      console.error('Error loading preview:', error);
    }
  };

  const handleRestore = async (version: HistoryVersion) => {
    setConfirmDialog({
      isOpen: true,
      version,
    });
  };

  const confirmRestore = async () => {
    if (!confirmDialog.version) return;
    
    const version = confirmDialog.version;
    setRestoring(true);
    setConfirmDialog({ isOpen: false, version: null });
    
    try {
      await window.electron.notes.restoreFromHistory(noteName, version.path);
      
      // Reload the note content
      const updatedNote = await window.electron.notes.readById(noteId);
      if (updatedNote) {
        setCurrentNote(updatedNote);
        setCurrentNoteContent(updatedNote.content);
      }
      
      onClose();
    } catch (error) {
      console.error('Error restoring version:', error);
      alert(t('history.restoreError'));
    } finally {
      setRestoring(false);
    }
  };

  const closePreview = () => {
    setPreviewContent(null);
    setPreviewVersion(null);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Hace un momento';
    if (minutes < 60) return `Hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    if (hours < 24) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`;
    if (days < 30) return `Hace ${days} día${days > 1 ? 's' : ''}`;
    return formatDate(date);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className="w-full max-w-4xl max-h-[80vh] bg-base rounded-xl shadow-2xl border border-surface0 flex flex-col animate-scale-in"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface0">
            <div className="flex items-center gap-2">
              <Clock size={18} />
              <h2 className="text-lg font-semibold">
                {t('history.title') || 'Historial de versiones'}: {noteName}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-surface0 transition-colors"
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex">
            {/* Versions List */}
            <div className="w-1/3 border-r border-surface0 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-subtext0">{t('common.loading') || 'Cargando...'}</div>
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-subtext0">
                  <Clock size={32} className="mb-2 opacity-50" />
                  <p className="text-sm">
                    {t('history.noVersions') || 'No hay versiones anteriores'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((version, index) => (
                    <div
                      key={version.path}
                      className={`
                        p-3 rounded-lg border transition-all cursor-pointer
                        ${previewVersion?.path === version.path
                          ? 'border-lavender bg-lavender/10'
                          : 'border-surface1 hover:border-surface2 hover:bg-surface0'
                        }
                      `}
                      onClick={() => handlePreview(version)}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs font-medium text-lavender">
                          {t('history.version') || 'Versión'} {index + 1}
                        </span>
                        <Clock size={12} className="text-subtext0" />
                      </div>
                      <p className="text-sm text-text font-medium">
                        {getRelativeTime(version.date)}
                      </p>
                      <p className="text-xs text-subtext0 mt-1">
                        {formatDate(version.date)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Preview Panel */}
            <div className="flex-1 flex flex-col">
              {previewContent ? (
                <>
                  {/* Preview Header */}
                  <div className="px-4 py-3 border-b border-surface0 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Eye size={16} />
                      <span className="text-sm font-medium">
                        {t('history.preview') || 'Vista previa'}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRestore(previewVersion!)}
                      disabled={restoring}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-lavender text-base hover:bg-mauve transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <RotateCcw size={14} />
                      {restoring ? (t('history.restoring') || 'Restaurando...') : (t('history.restore') || 'Restaurar')}
                    </button>
                  </div>

                  {/* Preview Content */}
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="bg-mantle rounded-lg border border-surface0 p-4">
                      <pre className="text-sm text-text whitespace-pre-wrap font-mono">
                        {previewContent}
                      </pre>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-subtext0">
                  <div className="text-center">
                    <Eye size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">
                      {t('history.selectVersion') || 'Selecciona una versión para ver su contenido'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-surface0 bg-mantle">
            <div className="flex items-start gap-2 text-xs text-subtext0">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
              <p>
                {t('history.warning')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={t('history.restore')}
        message={t('history.confirmRestore')}
        confirmLabel={t('history.restore')}
        cancelLabel={t('common.cancel')}
        variant="warning"
        onConfirm={confirmRestore}
        onCancel={() => setConfirmDialog({ isOpen: false, version: null })}
      />
    </>
  );
}
