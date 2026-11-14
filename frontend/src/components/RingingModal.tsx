import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, CheckCircle } from 'lucide-react';

interface RingingModalProps {
  isOpen: boolean;
  ringSource: string;
  onDismiss: () => void;
}

export const RingingModal: React.FC<RingingModalProps> = ({
  isOpen,
  ringSource,
  onDismiss,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="ringing-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl"
        >
          <motion.div 
            key="ringing-modal"
            initial={{ opacity: 0, scale: 0.96, filter: 'blur(4px)', y: 6 }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 }}
            exit={{ opacity: 0, scale: 0.97, filter: 'blur(3px)', y: 4 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm bg-white dark:bg-[#13151B] border-2 border-red-500/40 rounded-3xl p-7 text-center text-[#0F1115] dark:text-[#F3F4F6] shadow-2xl transition-colors"
          >
            {/* Pulsing Alert Icon */}
            <motion.div 
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
              className="w-20 h-20 mx-auto rounded-3xl bg-red-500/15 text-red-500 flex items-center justify-center mb-4 shadow-sm"
            >
              <Volume2 className="w-10 h-10" />
            </motion.div>

            <h3 className="font-display text-2xl font-extrabold tracking-tight text-[#0F1115] dark:text-[#F3F4F6]">
              Device Alert!
            </h3>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1.5">
              Triggered by <span className="font-semibold text-red-500">{ringSource || 'Remote Device'}</span>
            </p>

            <button
              onClick={onDismiss}
              className="apple-press mt-6 w-full py-3 px-6 rounded-2xl font-bold text-sm bg-red-500 hover:bg-red-600 text-white shadow-lg transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>I Found It! (Stop Sound)</span>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
