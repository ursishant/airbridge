import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

export interface ToastInfo {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  id?: number;
}

interface DynamicIslandProps {
  isConnected?: boolean;
  macCount?: number;
  androidCount?: number;
  isTransferring: boolean;
  transferProgress: number;
  activeToast: ToastInfo | string | null;
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

  const toast: ToastInfo | null = typeof activeToast === 'string'
    ? {
        message: activeToast,
        type: /fail|error|denied|reject|timed out|abort/i.test(activeToast)
          ? 'error'
          : /success|beamed|synced|uploaded|unlocked|installed|received/i.test(activeToast)
          ? 'success'
          : /warning|incorrect|disconnected|caution/i.test(activeToast)
          ? 'warning'
          : 'info',
      }
    : activeToast;

  return (
    <div className="fixed top-3 inset-x-0 mx-auto w-fit z-50 pointer-events-auto px-4 max-w-full">
      <motion.div
        layout
        initial={{ opacity: 0, y: -12, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, scale: 0.94 }}
        transition={{ type: "spring", stiffness: 440, damping: 28 }}
        className={`relative backdrop-blur-2xl rounded-full overflow-hidden select-none font-sans transition-colors duration-200 ${
          isTransferring
            ? 'bg-[#0F1115]/95 dark:bg-[#13151B]/95 text-white border border-white/[0.14] shadow-[0_12px_40px_rgba(0,0,0,0.4)]'
            : toast?.type === 'error'
            ? 'bg-[#181116]/95 text-white border border-rose-500/40 shadow-[0_12px_40px_rgba(244,63,94,0.3)]'
            : toast?.type === 'success'
            ? 'bg-[#0F151B]/95 text-white border border-[#10B981]/35 dark:border-[#C6F432]/40 shadow-[0_12px_40px_rgba(16,185,129,0.22)]'
            : toast?.type === 'warning'
            ? 'bg-[#181410]/95 text-white border border-amber-500/40 shadow-[0_12px_40px_rgba(245,158,11,0.25)]'
            : 'bg-[#0F1115]/95 dark:bg-[#13151B]/95 text-white border border-[#0071E3]/35 dark:border-white/15 shadow-[0_12px_40px_rgba(0,113,227,0.2)]'
        }`}
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
          ) : toast ? (
            /* State 2: Active Alert Toast (AirBridge Design System) */
            <motion.div
              key={`toast-${toast.type}-${toast.message}`}
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.96 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium max-w-[90vw] sm:max-w-lg"
            >
              {/* Type-specific Icon Badge */}
              {toast.type === 'error' && (
                <div className="w-5 h-5 rounded-full bg-rose-500/20 border border-rose-500/35 flex items-center justify-center shrink-0 text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5 stroke-[2.4]" />
                </div>
              )}

              {toast.type === 'success' && (
                <div className="w-5 h-5 rounded-full bg-[#10B981]/20 dark:bg-[#C6F432]/20 border border-[#10B981]/35 dark:border-[#C6F432]/35 flex items-center justify-center shrink-0 text-[#10B981] dark:text-[#C6F432]">
                  <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.4]" />
                </div>
              )}

              {toast.type === 'warning' && (
                <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/35 flex items-center justify-center shrink-0 text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 stroke-[2.4]" />
                </div>
              )}

              {toast.type === 'info' && (
                <div className="w-5 h-5 rounded-full bg-[#0071E3]/20 border border-[#0071E3]/35 flex items-center justify-center shrink-0 text-[#0071E3] dark:text-[#38BDF8]">
                  <Info className="w-3.5 h-3.5 stroke-[2.4]" />
                </div>
              )}

              {/* Message text */}
              <span className={`font-display font-medium text-xs tracking-tight truncate ${
                toast.type === 'error' ? 'text-rose-100' :
                toast.type === 'warning' ? 'text-amber-100' :
                'text-white'
              }`}>
                {toast.message}
              </span>

              {/* Status pill tag */}
              <span className={`font-mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border shrink-0 ${
                toast.type === 'error' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                toast.type === 'success' ? 'bg-[#10B981]/20 dark:bg-[#C6F432]/20 text-[#10B981] dark:text-[#C6F432] border-[#10B981]/30 dark:border-[#C6F432]/30' :
                toast.type === 'warning' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                'bg-white/10 text-slate-300 border-white/20'
              }`}>
                {toast.type === 'error' ? 'ALERT' : toast.type === 'success' ? 'READY' : toast.type === 'warning' ? 'NOTICE' : 'INFO'}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
