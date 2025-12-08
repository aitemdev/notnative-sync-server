import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ExternalLink, Eye, Trash2, File } from 'lucide-react';

interface Attachment {
  name: string;
  path: string;
  size?: number;
  type: string;
}

interface AttachmentsPopoverProps {
  attachments: Attachment[];
  isOpen: boolean;
  onClose: () => void;
  onPreview: (attachment: Attachment) => void;
  onDelete: (attachment: Attachment) => void;
  anchorEl: HTMLElement | null;
  notePath?: string;
}

export default function AttachmentsPopover({
  attachments,
  isOpen,
  onClose,
  onPreview,
  onDelete,
  anchorEl,
  notePath,
}: AttachmentsPopoverProps) {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ bottom: 0, right: 0 });

  // Calculate position based on anchor element
  useEffect(() => {
    if (!anchorEl || !isOpen) return;

    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect();
      setPosition({
        bottom: window.innerHeight - rect.top + 8, // 8px gap
        right: window.innerWidth - rect.right,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [anchorEl, isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, anchorEl]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const formatFileSize = (bytes?: number): string => {
    if (bytes === undefined || bytes === null) return '—';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const resolveAbsolute = (attachment: Attachment) => {
    const isAbsolute = attachment.path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(attachment.path);
    if (isAbsolute) return attachment.path;
    if (!notePath) return attachment.path;
    const base = notePath.slice(0, notePath.lastIndexOf('/')); // notePath uses /
    return `${base}/${attachment.path}`.replace(/\\/g, '/');
  };

  const handleOpenExternal = async (attachment: Attachment) => {
    try {
      const target = resolveAbsolute(attachment);
      const result = await window.electron.shell.openPath(target);
      if (!result.success) {
        console.error('Failed to open file:', result.error);
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-mantle border border-surface0 rounded-lg shadow-2xl overflow-hidden"
      style={{
        bottom: `${position.bottom}px`,
        right: `${position.right}px`,
        width: '320px',
        maxHeight: '400px',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface0 bg-surface0/50">
        <div className="flex items-center gap-2">
          <File size={16} className="text-lavender" />
          <span className="text-sm font-medium text-text">
            {t('attachments.title', 'Adjuntos')} ({attachments.length})
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-surface1 text-subtext0 hover:text-text transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* List */}
      <div className="overflow-y-auto max-h-[340px]">
        {attachments.length === 0 ? (
          <div className="px-4 py-8 text-center text-subtext0 text-sm">
            {t('attachments.empty', 'No hay archivos adjuntos')}
          </div>
        ) : (
          <div className="py-1">
            {attachments.map((attachment, index) => (
              <div
                key={index}
                className="flex items-center gap-3 px-3 py-2 hover:bg-surface0 transition-colors group"
              >
                {/* Extension badge */}
                <span className="flex-shrink-0 px-2 py-1 rounded-md bg-surface1 border border-surface2 text-[11px] text-subtext0 uppercase tracking-wide">
                  {attachment.name.includes('.') ? attachment.name.split('.').pop()?.toUpperCase() : 'FILE'}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text truncate" title={attachment.name}>
                    {attachment.name}
                  </p>
                  <p className="text-xs text-subtext0">
                    {formatFileSize(attachment.size)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      handleOpenExternal(attachment);
                      onClose();
                    }}
                    className="p-1.5 rounded hover:bg-surface1 text-subtext0 hover:text-blue transition-colors"
                    title={t('attachments.preview', 'Vista previa')}
                  >
                    <Eye size={14} />
                  </button>
                  <button
                    onClick={() => handleOpenExternal(attachment)}
                    className="p-1.5 rounded hover:bg-surface1 text-subtext0 hover:text-lavender transition-colors"
                    title={t('attachments.openExternal', 'Abrir con app externa')}
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(attachment)}
                    className="p-1.5 rounded hover:bg-surface1 text-subtext0 hover:text-red transition-colors"
                    title={t('attachments.delete', 'Eliminar')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
