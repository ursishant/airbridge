import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload } from 'lucide-react';

interface DynamicIslandProps {
  isConnected?: boolean;
  macCount?: number;
  androidCount?: number;
  isTransferring: boolean;
  transferProgress: number;
  activeToast: string | null;
  onOpenQR?: () => void;
  onRingPhone?: () => void;
  onPingMac?: () => void;
  isMac?: boolean;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  isTransferring,
  transferProgress,
  activeToast,
}) => {
  // Pure Apple HUD: Only appears during active transfers or system toasts
  if (!isTransferring && !activeToast) {
    return null;
  }

  return (
    <div className="fixed top-3 inset-x-0 mx-auto w-fit z-50 pointer-events-auto">
      <motion.div
        layout
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        className="relative bg-[#0F1115]/95 dark:bg-[#13151B]/95 text-white rounded-full shadow-[0_10px_35px_rgba(0,0,0,0.35)] backdrop-blur-2xl border border-white/[0.12] overflow-hidden select-none font-sans"
      >
        <AnimatePresence mode="wait">
          {/* State 1: Active File Transfer Progress */}
          {isTransferring ? (
            <motion.div
              key="transferring"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3 px-4 py-2 text-xs font-medium"
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                <svg className="w-5 h-5 -rotate-90">
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="2.5"
                    fill="none"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    stroke="#38BDF8"
                    strokeWidth="2.5"
                    fill="none"
                    strokeDasharray={50.2}
                    strokeDashoffset={50.2 - (50.2 * transferProgress) / 100}
                    strokeLinecap="round"
                    className="transition-[stroke-dashoffset] duration-150"
                  />
                </svg>
                <Upload className="w-2.5 h-2.5 text-white absolute" />
              </div>
              <span className="text-white font-semibold font-mono tabular-nums">Beaming... {transferProgress}%</span>
            </motion.div>
          ) : activeToast ? (
            /* State 2: Active Toast */
            <motion.div
              key="toast"
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium"
            >
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
              <span className="text-white tracking-tight">{activeToast}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
