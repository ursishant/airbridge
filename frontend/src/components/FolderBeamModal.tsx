import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck } from 'lucide-react';
import type { TraversedFile } from '../utils/folderUpload';
import { M3FolderIcon, M3AirDropIcon } from './M3Icons';

export interface FolderBeamModalProps {
  isOpen: boolean;
  folderName: string;
  files: TraversedFile[];
  onConfirm: (selectedFiles: TraversedFile[]) => void;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const FolderBeamModal: React.FC<FolderBeamModalProps> = ({
  isOpen,
  folderName,
  files,
  onConfirm,
  onClose,
}) => {
  const totalBytes = React.useMemo(() => {
    return files.reduce((acc, curr) => acc + (curr.file?.size || 0), 0);
  }, [files]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(files);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, files, onConfirm, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-x-hidden overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
            className="ab-modal-backdrop"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            className="ab-modal max-w-md p-6 overflow-hidden"
          >
            <button
              onClick={onClose}
              className="apple-press absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <M3AirDropIcon className="w-5 h-5" filled />
              </div>

              <div className="min-w-0 pr-6">
                <span className="ab-kicker block">Folder Transfer</span>
                <h3 className="font-display text-base sm:text-lg font-bold mt-1 leading-snug" style={{ color: 'var(--text-primary)' }}>
                  Send {files.length.toLocaleString()} files?
                </h3>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Transfers <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>&lsquo;{folderName}&rsquo;</span> with folder structure preserved.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              <div
                className="p-3.5 rounded-xl flex items-center justify-between gap-3"
                style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    <M3FolderIcon className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-xs sm:text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                      {folderName}
                    </p>
                    <p className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                      Tree preserved
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-xs font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {files.length.toLocaleString()} files
                  </p>
                  <p className="font-mono text-[11px] tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                    {formatBytes(totalBytes)}
                  </p>
                </div>
              </div>

              <div
                className="p-3 rounded-xl flex items-center gap-2.5 text-xs"
                style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
              >
                <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--success)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>
                  Direct LAN transfer · stored in <span className="font-mono">~/Downloads/AirBridge</span>
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="ab-btn ab-btn-ghost w-full sm:w-auto px-4 text-xs"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => onConfirm(files)}
                className="ab-btn ab-btn-primary w-full sm:flex-1 px-5 text-xs"
              >
                <M3AirDropIcon className="w-4 h-4" filled />
                <span>Send ({formatBytes(totalBytes)})</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
