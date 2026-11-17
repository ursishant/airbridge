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
  // Total byte size across all files
  const totalBytes = React.useMemo(() => {
    return files.reduce((acc, curr) => acc + (curr.file?.size || 0), 0);
  }, [files]);

  // Keyboard accessibility (Escape to dismiss, Enter to proceed)
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
          {/* Frosted Glass Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xl"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="relative z-10 w-full max-w-lg bg-white dark:bg-[#141926] border border-black/[0.08] dark:border-white/[0.1] rounded-[32px] p-6 sm:p-7 shadow-2xl text-[#0F1115] dark:text-[#F3F4F6] overflow-hidden"
          >
            {/* Top Close Button */}
            <button
              onClick={onClose}
              className="apple-press absolute top-5 right-5 p-2 rounded-full text-[#64748B] hover:text-[#0F1115] dark:text-[#94A3B8] dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-13 h-13 rounded-2xl bg-[#0071E3]/10 dark:bg-[#C6F432]/15 text-[#0071E3] dark:text-[#C6F432] flex items-center justify-center shrink-0 shadow-inner">
                <M3AirDropIcon className="w-7 h-7 text-inherit" filled />
              </div>

              <div className="min-w-0 pr-6">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#0071E3]/10 dark:bg-[#C6F432]/15 text-[#0071E3] dark:text-[#C6F432]">
                  AirBridge Transfer Confirmation
                </span>
                <h3 className="font-display font-bold text-lg sm:text-xl text-[#0F1115] dark:text-white tracking-tight mt-1.5 leading-snug">
                  Upload {files.length.toLocaleString()} files to this site?
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 leading-relaxed">
                  This will upload all files from <span className="font-semibold text-[#0F1115] dark:text-white">&apos;{folderName}&apos;</span> to your AirBridge shared storage.
                </p>
              </div>
            </div>

            {/* Folder Details Bento */}
            <div className="mt-5 space-y-2.5">
              {/* Folder Summary Card */}
              <div className="p-3.5 rounded-2xl bg-[#F8FAFC] dark:bg-[#181E2E] border border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#F59E0B]/10 text-[#F59E0B] flex items-center justify-center shrink-0">
                    <M3FolderIcon className="w-5 h-5 text-inherit" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-xs sm:text-sm font-bold text-[#0F1115] dark:text-white truncate">
                      {folderName}
                    </p>
                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                      Full directory hierarchy preserved
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-xs font-bold text-[#0F1115] dark:text-white">
                    {files.length.toLocaleString()} files
                  </p>
                  <p className="font-mono text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                    {formatBytes(totalBytes)}
                  </p>
                </div>
              </div>

              {/* Security & Link Card */}
              <div className="p-3 rounded-2xl bg-[#10B981]/[0.06] dark:bg-[#C6F432]/[0.06] border border-[#10B981]/20 dark:border-[#C6F432]/20 flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-[#10B981]/15 dark:bg-[#C6F432]/15 text-[#10B981] dark:text-[#C6F432] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-inherit" />
                </div>
                <div className="min-w-0 text-xs">
                  <p className="font-bold text-[#0F1115] dark:text-white">
                    Direct Gigabit LAN Transfer
                  </p>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                    Zero cloud hops • Stored in ~/Downloads/AirBridge
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="apple-press w-full sm:w-auto px-5 py-3 rounded-2xl text-xs font-bold text-[#64748B] hover:text-[#0F1115] dark:text-[#94A3B8] dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => onConfirm(files)}
                className="apple-press flex-1 w-full flex items-center justify-center gap-2 py-3 px-6 rounded-2xl text-xs font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-[#C6F432] dark:hover:bg-[#B5E22B] dark:text-[#0A0D14] shadow-md transition-all"
              >
                <M3AirDropIcon className="w-4 h-4 text-inherit" filled />
                <span>Upload ({files.length.toLocaleString()} files • {formatBytes(totalBytes)})</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
