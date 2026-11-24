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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl"
        >
          <motion.div
            key="office-lock-card"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm bg-white dark:bg-[#13161F] border border-black/[0.08] dark:border-white/[0.1] rounded-3xl shadow-2xl p-6 sm:p-7 text-[#0F1115] dark:text-[#F3F4F6]"
          >
            {isWaitingApproval ? (
              /* State 2: Waiting for Host Approval */
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-3xl bg-[#0071E3]/15 text-[#0071E3] dark:text-[#38BDF8] flex items-center justify-center shadow-inner">
                    <Users className="w-8 h-8 animate-pulse" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 bg-white dark:bg-[#13161F] p-1 rounded-full shadow-xs">
                    <Loader2 className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8] animate-spin" />
                  </div>
                </div>

                <div>
                  <h3 className="font-display text-lg font-black tracking-tight text-[#0F1115] dark:text-white">
                    Waiting for Host Approval
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1.5 leading-relaxed">
                    PIN verified! A connection request was sent to the host computer. Please ask the host to approve your device.
                  </p>
                </div>

                <div className="w-full p-3 rounded-2xl bg-[#F8FAFC] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-left">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Your Device:</span>
                    <span className="font-bold text-[#0F1115] dark:text-white">{getDeviceName()}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#64748B] dark:text-[#94A3B8] mt-1">
                    <span>Device ID:</span>
                    <span className="font-mono">{getDeviceId()}</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsWaitingApproval(false)}
                  className="apple-press flex items-center justify-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#0F1115] dark:text-[#94A3B8] dark:hover:text-white transition-colors pt-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Re-enter PIN</span>
                </button>
              </div>
            ) : (
              /* State 1: PIN Input Form */
              <>
                {/* Header Icon */}
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-[#0071E3]/10 dark:bg-[#10B981]/15 text-[#0071E3] dark:text-[#10B981] flex items-center justify-center shadow-inner">
                    <M3ShieldLockIcon className="w-7 h-7" filled />
                  </div>

                  <div>
                    <h3 className="font-display text-lg font-black tracking-tight text-[#0F1115] dark:text-white">
                      Office Room Protected
                    </h3>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 leading-relaxed">
                      This workspace is secured. Enter the 4-digit Room PIN shown on the host computer or scan the host's QR code.
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
                        className="w-full bg-[#F8FAFC] dark:bg-white/[0.05] border border-black/[0.1] dark:border-white/[0.1] rounded-2xl pl-10 pr-4 py-3 text-center text-xl font-mono tracking-widest font-black text-[#0F1115] dark:text-white placeholder:text-xs placeholder:font-sans placeholder:tracking-normal placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-[#0071E3] dark:focus:ring-[#10B981]"
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
                    className="apple-press w-full py-3 rounded-2xl bg-[#0F1115] hover:bg-black dark:bg-[#10B981] dark:hover:bg-[#059669] text-white dark:text-[#0A0D14] text-xs font-bold transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
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
