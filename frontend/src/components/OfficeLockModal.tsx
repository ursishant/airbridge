import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { M3ShieldLockIcon, M3KeyIcon } from './M3Icons';
import { Loader2, Users, ArrowLeft } from 'lucide-react';
import { getDeviceId, getDeviceName, getAuthHeaders } from '../utils/device';

interface OfficeLockModalProps {
  isOpen: boolean;
  onVerifyPin: (pin: string) => Promise<{ success: boolean; pendingApproval?: boolean; message?: string } | boolean>;
  showToast: (msg: string) => void;
  serverInfo?: any;
}

export const OfficeLockModal: React.FC<OfficeLockModalProps> = ({
  isOpen,
  onVerifyPin,
  showToast,
  serverInfo,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);

  // Auto-detect if server already reported pending approval or if security is disabled
  useEffect(() => {
    if (serverInfo?.officeSecurity && !serverInfo.officeSecurity.enabled) {
      setIsWaitingApproval(false);
      return;
    }
    if (serverInfo?.officeSecurity?.isPendingApproval) {
      setIsWaitingApproval(true);
    }
  }, [serverInfo?.officeSecurity?.isPendingApproval, serverInfo?.officeSecurity?.enabled]);

  // Polling for approval resolution while waiting
  useEffect(() => {
    if (!isOpen || !isWaitingApproval) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const headers = getAuthHeaders();
        const res = await fetch('/api/office/approval-status', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.approved && isMounted) {
            setIsWaitingApproval(false);
            showToast('Host Approved Access! Workspace Unlocked');
            window.location.reload();
          }
        }
      } catch {}
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, isWaitingApproval, showToast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = pinInput.trim();
    if (!clean) {
      setErrorMsg('Please enter the 4-digit Room PIN');
      return;
    }

    setIsVerifying(true);
    setErrorMsg('');

    try {
      const result = await onVerifyPin(clean);
      if (typeof result === 'object' && result.pendingApproval) {
        setIsWaitingApproval(true);
        setErrorMsg('');
      } else if (result === true || (typeof result === 'object' && result.success)) {
        setIsWaitingApproval(false);
        showToast('Office Room Access Granted');
        setPinInput('');
      } else {
        const msg = typeof result === 'object' && result.message ? result.message : 'Invalid PIN. Check the code on the host screen.';
        setErrorMsg(msg);
      }
    } catch {
      setErrorMsg('Failed to verify PIN. Check connection.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="office-lock-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090C12]/75 backdrop-blur-xl"
        >
          <motion.div
            key="office-lock-card"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="bento-modal max-w-sm p-6 sm:p-7"
          >
            {isWaitingApproval ? (
              /* State 2: Waiting for Host Approval */
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-[#2563EB]/10 text-[#2563EB] dark:text-[#60A5FA] flex items-center justify-center">
                    <Users className="w-7 h-7" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-white dark:bg-[#12151C] p-1 rounded-full">
                    <Loader2 className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA] animate-spin" />
                  </div>
                </div>

                <div>
                  <h3 className="font-display text-lg font-bold text-[#0F172A] dark:text-white">
                    Waiting for Host Approval
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1.5 leading-relaxed">
                    PIN verified. A connection request was sent to the host computer for approval.
                  </p>
                </div>

                <div className="w-full p-3 rounded-xl bg-[#F8FAFC] dark:bg-[#0E1117] border border-[#E2E8F0] dark:border-white/[0.08] text-left">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Your Device:</span>
                    <span className="font-semibold text-[#0F172A] dark:text-white">{getDeviceName()}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#64748B] dark:text-[#94A3B8] mt-1">
                    <span>Device ID:</span>
                    <span className="font-mono">{getDeviceId()}</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsWaitingApproval(false)}
                  className="apple-press flex items-center justify-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#0F172A] dark:text-[#94A3B8] dark:hover:text-white transition-colors pt-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Re-enter PIN</span>
                </button>
              </div>
            ) : (
              /* State 1: PIN Input Form */
              <>
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-[#2563EB]/10 text-[#2563EB] dark:text-[#60A5FA] border border-[#2563EB]/20 flex items-center justify-center">
                    <M3ShieldLockIcon className="w-6 h-6" filled />
                  </div>

                  <div>
                    <h3 className="font-display text-lg font-bold text-[#0F172A] dark:text-white">
                      Office Room Protected
                    </h3>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 leading-relaxed">
                      Enter the 4-digit Room PIN shown on the host computer or scan the pairing QR code.
                    </p>
                  </div>
                </div>

                {/* PIN Entry Form */}
                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  <div>
                    <div className="relative flex items-center">
                      <div className="absolute left-3.5 text-[#64748B] dark:text-[#94A3B8] pointer-events-none">
                        <M3KeyIcon className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={8}
                        value={pinInput}
                        onChange={(e) => {
                          setPinInput(e.target.value.replace(/[^0-9]/g, ''));
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder="Enter 4-Digit PIN"
                        autoFocus
                        className="bento-input pl-10 pr-4 py-3 text-center text-xl font-mono tracking-widest font-black placeholder:text-xs placeholder:font-sans placeholder:tracking-normal placeholder:font-normal"
                      />
                    </div>

                    {errorMsg && (
                      <p className="text-[11px] font-semibold text-[#EF4444] text-center mt-2">
                        {errorMsg}
                      </p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifying || !pinInput}
                    className="bento-btn-primary w-full py-3 text-xs shadow-md"
                  >
                    {isVerifying ? 'Verifying PIN...' : 'Unlock Workspace'}
                  </button>
                </form>
              </>
            )}

            <div className="mt-4 pt-3 border-t border-black/[0.06] dark:border-white/[0.06] text-center">
              <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                Protected local LAN connection. No internet cloud transfer.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
