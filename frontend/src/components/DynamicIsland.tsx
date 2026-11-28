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
  transferFileName?: string;
  transferSpeedMBs?: number;
  activeToast: ToastInfo | string | null;
  onOpenQR?: () => void;
  onRingPhone?: () => void;
  onPingMac?: () => void;
  isMac?: boolean;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  isTransferring,
  transferProgress,
  transferFileName,
  transferSpeedMBs,
  activeToast,
}) => {
  if (!isTransferring && !activeToast) return null;

  const toast: ToastInfo | null = typeof activeToast === 'string'
    ? {
        message: activeToast,
        type: /fail|error|denied|reject|timed out|abort/i.test(activeToast) ? 'error'
          : /success|beamed|synced|uploaded|unlocked|installed|received/i.test(activeToast) ? 'success'
          : /warning|incorrect|disconnected|caution/i.test(activeToast) ? 'warning'
          : 'info',
      }
    : activeToast;

  const toastIcon = {
    error: <AlertCircle className="w-3.5 h-3.5" />,
    success: <CheckCircle2 className="w-3.5 h-3.5" />,
    warning: <AlertTriangle className="w-3.5 h-3.5" />,
    info: <Info className="w-3.5 h-3.5" />,
  };

  const toastColor = {
    error: '#F87171',
    success: '#34D399',
    warning: '#FBBF24',
    info: '#60A5FA',
  };

  return (
    <div className="fixed top-3 inset-x-0 mx-auto w-fit z-50 pointer-events-auto px-4 max-w-full">
      <motion.div
        layout
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 440, damping: 28 }}
        className="backdrop-blur-2xl rounded-full overflow-hidden select-none font-sans shadow-lg"
        style={{
          background: 'rgba(17, 17, 19, 0.92)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#FAFAFA',
        }}
      >
        <AnimatePresence mode="wait">
          {isTransferring ? (
            <motion.div
              key="transfer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium"
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                <svg className="w-5 h-5 -rotate-90">
                  <circle cx="10" cy="10" r="8" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" fill="none" />
                  <circle cx="10" cy="10" r="8" stroke="#60A5FA" strokeWidth="2.5" fill="none"
                    strokeDasharray={50.2} strokeDashoffset={50.2 - (50.2 * transferProgress) / 100}
                    strokeLinecap="round" className="transition-[stroke-dashoffset] duration-150"
                  />
                </svg>
                <Upload className="w-2.5 h-2.5 absolute" />
              </div>
              <span className="font-semibold truncate max-w-[180px] sm:max-w-[240px]">
                {transferFileName ? `${transferFileName}` : 'Sending...'}
              </span>
              {transferSpeedMBs !== undefined && transferSpeedMBs > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[#34D399] font-mono text-[10px] font-semibold tabular-nums shrink-0">
                  {transferSpeedMBs} MB/s
                </span>
              )}
              <span className="font-bold font-mono tabular-nums shrink-0">{transferProgress}%</span>
            </motion.div>
          ) : toast ? (
            <motion.div
              key={`toast-${toast.message}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium max-w-[90vw] sm:max-w-lg"
            >
              <span style={{ color: toastColor[toast.type] }}>{toastIcon[toast.type]}</span>
              <span className="font-display font-medium truncate">{toast.message}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
