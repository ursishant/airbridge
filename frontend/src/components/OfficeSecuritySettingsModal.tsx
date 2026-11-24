import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, RefreshCw, ShieldCheck, ShieldAlert, UserCheck, UserX, Users } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';

interface OfficeSecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  officeSecurityEnabled: boolean;
  officePin: string;
  serverUrl?: string;
  serverInfo?: any;
  onConfigureSecurity: (enabled: boolean, pin?: string, requireApproval?: boolean) => Promise<boolean>;
  onApproveDevice?: (deviceId: string, approved: boolean) => Promise<boolean>;
  showToast: (msg: string) => void;
}

interface LuxuryToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  activeColor?: string;
  ariaLabel?: string;
}

const LuxuryToggle: React.FC<LuxuryToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  activeColor = 'bg-[#10B981]',
  ariaLabel,
}) => {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={() => !disabled && setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange();
      }}
      className={`relative inline-flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-250 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0071E3] ${
        checked ? activeColor : 'bg-[#E5E7EB] dark:bg-[#2C303E]'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <motion.span
        animate={{
          x: checked ? (isPressed ? 17 : 20) : 0,
          width: isPressed ? 27 : 24,
        }}
        transition={{
          type: 'spring',
          stiffness: 700,
          damping: 35,
          mass: 0.8,
        }}
        className="pointer-events-none block h-[24px] rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.18),0_1px_1px_rgba(0,0,0,0.1)] ring-0.5 ring-black/[0.04]"
      />
    </button>
  );
};

export const OfficeSecuritySettingsModal: React.FC<OfficeSecuritySettingsModalProps> = ({
  isOpen,
  onClose,
  officeSecurityEnabled,
  officePin,
  serverUrl = '',
  serverInfo,
  onConfigureSecurity,
  onApproveDevice,
  showToast,
}) => {
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [isGeneratingPin, setIsGeneratingPin] = useState(false);
  const [customPin, setCustomPin] = useState(officePin || '');

  const requireApproval = Boolean(serverInfo?.officeSecurity?.requireApproval);
  const pendingRequests = serverInfo?.pendingApprovalRequests || [];
  const approvedDevices = serverInfo?.approvedDevices || [];

  // Instant optimistic state for zero-latency toggle animations
  const [localEnabled, setLocalEnabled] = useState(officeSecurityEnabled);
  const [localRequireApproval, setLocalRequireApproval] = useState(requireApproval);

  useEffect(() => {
    setLocalEnabled(officeSecurityEnabled);
  }, [officeSecurityEnabled]);

  useEffect(() => {
    setLocalRequireApproval(requireApproval);
  }, [requireApproval]);

  useEffect(() => {
    if (officePin) {
      setCustomPin(officePin);
    }
  }, [officePin]);

  const quickJoinUrl = serverUrl 
    ? `${serverUrl}/?pin=${encodeURIComponent(officePin || customPin)}`
    : typeof window !== 'undefined'
    ? `${window.location.origin}/?pin=${encodeURIComponent(officePin || customPin)}`
    : '';

  const handleToggle = async () => {
    const next = !localEnabled;
    setLocalEnabled(next); // Instant 0ms visual flip
    try {
      const pinToSet = officePin || customPin;
      const ok = await onConfigureSecurity(next, pinToSet, localRequireApproval);
      if (!ok) {
        setLocalEnabled(!next);
      }
    } catch (err) {
      setLocalEnabled(!next);
      showToast('Failed to toggle office security');
    }
  };

  const handleToggleRequireApproval = async () => {
    const next = !localRequireApproval;
    setLocalRequireApproval(next); // Instant 0ms visual flip
    try {
      const pinToSet = officePin || customPin;
      const ok = await onConfigureSecurity(localEnabled, pinToSet, next);
      if (!ok) {
        setLocalRequireApproval(!next);
      }
    } catch (_) {
      setLocalRequireApproval(!next);
      showToast('Failed to update approval mode');
    }
  };

  const handleGenerateNewPin = async () => {
    if (isGeneratingPin) return;
    setIsGeneratingPin(true);
    try {
      const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
      setCustomPin(randomPin);
      await onConfigureSecurity(true, randomPin, localRequireApproval);
    } finally {
      setIsGeneratingPin(false);
    }
  };

  const handleCopyPin = async () => {
    const pin = officePin || customPin;
    if (!pin) return;
    const ok = await copyToClipboard(pin);
    if (ok) {
      setCopiedPin(true);
      showToast(`Copied PIN: ${pin}`);
      setTimeout(() => setCopiedPin(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    if (!quickJoinUrl) return;
    const ok = await copyToClipboard(quickJoinUrl);
    if (ok) {
      setCopiedLink(true);
      showToast('Copied Quick Join Link (includes PIN)');
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="office-security-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl"
          onClick={onClose}
        >
          <motion.div
            key="office-security-modal"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-[#13151B] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl shadow-2xl p-6 sm:p-7 text-[#0F1115] dark:text-[#F3F4F6]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="apple-press absolute top-4 right-4 w-8 h-8 rounded-full bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.1] dark:hover:bg-white/[0.14] text-[#64748B] dark:text-[#94A3B8] flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-display text-lg font-black tracking-tight text-[#0F1115] dark:text-[#F3F4F6]">
                  Office Space Security & Isolation
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                  Restricts file transfer to only approved colleagues on your Wi-Fi.
                </p>
              </div>
            </div>

            {/* Main Toggle Card */}
            <div 
              onClick={handleToggle}
              className="bento-card rounded-2xl p-4 flex items-center justify-between gap-3 mb-3 border border-black/[0.06] dark:border-white/[0.08] cursor-pointer hover:border-black/20 dark:hover:border-white/20 select-none active:scale-[0.99] transition-all duration-150"
            >
              <div>
                <h4 className="font-display text-sm font-bold text-[#0F1115] dark:text-white">
                  Office Room Protection
                </h4>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                  Require 4-digit PIN for unauthorized devices on this Wi-Fi
                </p>
              </div>

              <LuxuryToggle
                checked={localEnabled}
                onChange={handleToggle}
                activeColor="bg-[#10B981]"
                ariaLabel="Toggle Office Room Protection"
              />
            </div>

            {/* Strict Device Approval Gate (5-people group isolation) */}
            <AnimatePresence initial={false}>
              {localEnabled && (
                <motion.div
                  key="whitelist-gate-card"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div 
                    onClick={handleToggleRequireApproval}
                    className="bento-card rounded-2xl p-4 flex items-center justify-between gap-3 mb-3 border border-black/[0.06] dark:border-white/[0.08] cursor-pointer hover:border-black/20 dark:hover:border-white/20 select-none active:scale-[0.99] transition-all duration-150"
                  >
                    <div>
                      <h4 className="font-display text-sm font-bold text-[#0F1115] dark:text-white flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8]" />
                        <span>Host Approval Whitelist</span>
                      </h4>
                      <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                        Colleagues must be manually approved by you before they can view or download files.
                      </p>
                    </div>

                    <LuxuryToggle
                      checked={localRequireApproval}
                      onChange={handleToggleRequireApproval}
                      activeColor="bg-[#0071E3]"
                      ariaLabel="Toggle Host Approval Whitelist"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pending Requests Section (Live Host Gate) */}
            <AnimatePresence>
              {pendingRequests.length > 0 && onApproveDevice && (
                <motion.div
                  key="pending-requests-container"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="mb-4 overflow-hidden"
                >
                  <div className="p-4 rounded-2xl bg-[#0071E3]/10 dark:bg-[#0071E3]/15 border border-[#0071E3]/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#0071E3] dark:text-[#38BDF8]">
                        Pending Connection Requests ({pendingRequests.length})
                      </span>
                      <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                        Awaiting Host Approval
                      </span>
                    </div>
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {pendingRequests.map((req: any) => (
                          <motion.div
                            key={req.id}
                            layout
                            initial={{ opacity: 0, scale: 0.96, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, height: 0, marginBottom: 0, padding: 0 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-[#1A1D26] border border-black/[0.08] dark:border-white/[0.08] shadow-sm gap-2"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-[#0F1115] dark:text-white truncate">
                                {req.name}
                              </p>
                              <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] font-mono mt-0.5">
                                {req.ip}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (approvingId) return;
                                  setApprovingId(req.id);
                                  try {
                                    await onApproveDevice(req.id, true);
                                  } finally {
                                    setApprovingId(null);
                                  }
                                }}
                                disabled={approvingId === req.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#10B981] hover:bg-[#059669] active:scale-95 text-white shadow-sm transition-all duration-150 disabled:opacity-60 cursor-pointer"
                                title="Approve access"
                              >
                                {approvingId === req.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <UserCheck className="w-3.5 h-3.5" />
                                )}
                                <span>Accept</span>
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (approvingId) return;
                                  setApprovingId(req.id);
                                  try {
                                    await onApproveDevice(req.id, false);
                                  } finally {
                                    setApprovingId(null);
                                  }
                                }}
                                disabled={approvingId === req.id}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-600 dark:text-red-400 border border-red-500/20 transition-all duration-150 disabled:opacity-60 cursor-pointer"
                                title="Deny access"
                              >
                                <UserX className="w-3.5 h-3.5" />
                                <span>Deny</span>
                              </button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Approved Devices Count */}
            <AnimatePresence>
              {localEnabled && localRequireApproval && (
                <motion.div
                  key="approved-devices-count"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mb-3"
                >
                  <div className="px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-white/[0.04] text-[11px] text-[#64748B] dark:text-[#94A3B8] flex items-center justify-between">
                    <span>Approved Colleagues:</span>
                    <span className="font-bold text-[#0F1115] dark:text-white">{approvedDevices.length} devices</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* PIN Card / Public Mode (Smooth Cross-fade) */}
            <AnimatePresence mode="wait">
              {localEnabled ? (
                <motion.div
                  key="pin-card-section"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-3"
                >
                  <div className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                        Active Room PIN
                      </span>
                      <button
                        onClick={handleGenerateNewPin}
                        disabled={isGeneratingPin}
                        className="apple-press text-[11px] font-semibold text-[#0071E3] dark:text-[#38BDF8] flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${isGeneratingPin ? 'animate-spin' : ''}`} />
                        <span>Generate New</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-3 bg-white dark:bg-[#1A1D26] px-4 py-2.5 rounded-xl border border-black/[0.08] dark:border-white/[0.08]">
                      <span className="font-mono text-2xl font-black tracking-widest text-[#0F1115] dark:text-white">
                        {officePin || customPin}
                      </span>
                      <button
                        onClick={handleCopyPin}
                        className="apple-press flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0F1115] hover:bg-black active:scale-95 text-white dark:bg-[#10B981] dark:text-[#0A0D14] transition-all"
                      >
                        {copiedPin ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPin ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                      Colleagues typing the host IP in their browser must enter this PIN to access the shared folder.
                    </p>
                  </div>

                  {/* Quick Join Link Button */}
                  <button
                    onClick={handleCopyLink}
                    className="apple-press w-full py-2.5 px-4 rounded-2xl bg-white dark:bg-[#1A1E29] border border-black/[0.08] dark:border-white/[0.08] hover:border-[#0071E3] active:scale-[0.99] text-xs font-bold text-[#0F1115] dark:text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-[#10B981]" /> : <Copy className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8]" />}
                    <span>{copiedLink ? 'Link Copied to Clipboard' : 'Copy Quick Join Link (Auto-PIN)'}</span>
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="public-mode-section"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="p-4 rounded-2xl bg-[#FFFBEB] dark:bg-[#78350F]/20 border border-[#F59E0B]/30 text-[#92400E] dark:text-[#FCD34D] text-xs space-y-1"
                >
                  <p className="font-bold flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Public Local Network Mode</span>
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    Anyone on this Wi-Fi network who visits your IP can browse and download shared files. Enable Office Protection to isolate files to your group of 5.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Explanatory footer */}
            <div className="mt-5 pt-3 border-t border-black/[0.06] dark:border-white/[0.06] text-center">
              <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                With Host Approval active, unexpected devices on the corporate Wi-Fi cannot see or download files even with the PIN.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
