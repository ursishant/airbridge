import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload } from 'lucide-react';

interface DragDropPortalProps {
  isDragging: boolean;
}

export const DragDropPortal: React.FC<DragDropPortalProps> = ({ isDragging }) => {
  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-white/70 backdrop-blur-2xl"
        >
          {/* Animated concentric target rings */}
          <div className="relative flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="absolute w-80 h-80 rounded-full border-2 border-[#0071E3]/30"
            />
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.8, 0.4] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 0.2 }}
              className="absolute w-60 h-60 rounded-full border-2 border-[#34C759]/40"
            />

            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="relative z-10 w-28 h-28 rounded-3xl bg-gradient-to-tr from-[#0071E3] to-[#5AC8FA] flex flex-col items-center justify-center text-white shadow-[0_16px_50px_rgba(0,113,227,0.4)]"
            >
              <Upload className="w-12 h-12 stroke-[2.2] animate-bounce" />
            </motion.div>
          </div>

          <div className="absolute bottom-16 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-[#1D1D1F]">
              Release to Beam to Android
            </h2>
            <p className="text-sm text-[#6E6E73] mt-1">
              High-speed peer-to-peer Wi-Fi transfer
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
