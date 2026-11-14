import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertTriangle, X, Folder, FileText, MessageSquare } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  itemName?: string;
  itemType?: 'file' | 'folder' | 'history' | 'general';
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  itemName,
  itemType = 'general',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isDestructive = true,
  onConfirm,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onConfirm, onClose]);

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
            className="fixed inset-0 bg-black/55 backdrop-blur-md"
          />

          {/* Dialog Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="relative z-10 w-full max-w-sm sm:max-w-md bg-white dark:bg-[#141926] border border-black/[0.08] dark:border-white/[0.1] rounded-[28px] sm:rounded-[32px] p-6 shadow-2xl overflow-hidden"
          >
            {/* Top Close Button */}
            <button
              onClick={onClose}
              className="apple-press absolute top-5 right-5 p-1.5 rounded-full text-[#64748B] hover:text-[#0F1115] dark:text-[#94A3B8] dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header Icon + Details */}
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                isDestructive 
                  ? 'bg-rose-500/10 dark:bg-rose-500/15 text-rose-500 border border-rose-500/20' 
                  : 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-500 border border-amber-500/20'
              }`}>
                {isDestructive ? (
                  <Trash2 className="w-5 h-5 text-rose-500 stroke-[2.2]" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500 stroke-[2.2]" />
                )}
              </div>

              <div className="min-w-0 pr-4">
                <h3 className="font-display font-black text-base sm:text-lg text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
                  {title}
                </h3>
                <p className="text-xs sm:text-[13px] text-[#64748B] dark:text-[#94A3B8] mt-1 leading-relaxed">
                  {message}
                </p>
              </div>
            </div>

            {/* Highlighted Item Pill */}
            {itemName && (
              <div className="mt-4 px-3.5 py-2.5 rounded-2xl bg-[#F8FAFC] dark:bg-[#1A2030] border border-black/[0.05] dark:border-white/[0.06] flex items-center gap-2.5">
                <span className="text-[#64748B] dark:text-[#94A3B8]">
                  {itemType === 'folder' ? (
                    <Folder className="w-3.5 h-3.5" />
                  ) : itemType === 'file' ? (
                    <FileText className="w-3.5 h-3.5" />
                  ) : (
                    <MessageSquare className="w-3.5 h-3.5" />
                  )}
                </span>
                <span className="text-xs font-mono font-medium text-[#0F1115] dark:text-[#E2E8F0] truncate flex-1">
                  {itemName}
                </span>
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] text-[#64748B] dark:text-[#94A3B8]">
                  {itemType}
                </span>
              </div>
            )}

            {/* Actions Bar */}
            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="apple-press px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold text-[#475569] dark:text-[#CBD5E1] bg-black/[0.04] hover:bg-black/[0.08] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] transition-colors"
              >
                {cancelLabel}
              </button>

              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`apple-press px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-white transition-all shadow-sm ${
                  isDestructive
                    ? 'bg-rose-500 hover:bg-rose-600 active:bg-rose-700 shadow-rose-500/20'
                    : 'bg-[#0071E3] hover:bg-[#0077ED]'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
