import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, ShieldCheck } from 'lucide-react';

interface DragDropPortalProps {
  isDragging: boolean;
  targetCount?: number;
}

export const DragDropPortal: React.FC<DragDropPortalProps> = ({ isDragging, targetCount = 0 }) => {
  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 pointer-events-none flex flex-col items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.92)' }}
        >
          {/* Dark mode override */}
          <style>{`.dark .ab-drop-bg { background: rgba(17,17,19,0.94) !important; }`}</style>
          <div className="ab-drop-bg fixed inset-0 -z-10 dark:bg-[#111113]/94 backdrop-blur-sm" />

          {/* Concentric rings */}
          <div className="relative flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.35, 0.15] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
              className="absolute w-64 h-64 rounded-full"
              style={{ border: '1.5px dashed var(--accent)', opacity: 0.25 }}
            />
            <motion.div
              animate={{ scale: [1, 1.08, 1], opacity: [0.25, 0.5, 0.25] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut', delay: 0.1 }}
              className="absolute w-44 h-44 rounded-full"
              style={{ border: '1px solid var(--accent)', opacity: 0.3 }}
            />

            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 26 }}
              className="relative z-10 w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: 'var(--text-primary)', color: 'var(--surface)' }}
            >
              <Upload className="w-8 h-8 stroke-[2]" />
            </motion.div>
          </div>

          <div className="mt-10 text-center space-y-2 px-6">
            {targetCount > 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--border)' }}
              >
                <ShieldCheck className="w-3 h-3" />
                <span>Private → {targetCount} peer{targetCount > 1 ? 's' : ''}</span>
              </div>
            )}
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {targetCount > 0 ? 'Release to send privately' : 'Release to send'}
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Direct LAN · folder trees preserved · up to 10 GB
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
