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
  const [isUpdating, setIsUpdating] = useState(false);
  const [customPin, setCustomPin] = useState(officePin || '');

  const requireApproval = Boolean(serverInfo?.officeSecurity?.requireApproval);
  const pendingRequests = serverInfo?.pendingApprovalRequests || [];
  const approvedDevices = serverInfo?.approvedDevices || [];

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
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const nextEnabled = !officeSecurityEnabled;
      const pinToSet = officePin || customPin;
      await onConfigureSecurity(nextEnabled, pinToSet, requireApproval);
    } catch (err) {
      showToast('Failed to toggle office security');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleRequireApproval = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      const pinToSet = officePin || customPin;
      await onConfigureSecurity(officeSecurityEnabled, pinToSet, !requireApproval);
    } catch (_) {
      showToast('Failed to update approval mode');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleGenerateNewPin = async () => {
    setIsUpdating(true);
    try {
      const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
      setCustomPin(randomPin);
      await onConfigureSecurity(true, randomPin, requireApproval);
    } finally {
      setIsUpdating(false);
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
              className="bento-card rounded-2xl p-4 flex items-center justify-between gap-3 mb-3 border border-black/[0.06] dark:border-white/[0.08] cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition-all select-none"
            >
              <div>
                <h4 className="font-display text-sm font-bold text-[#0F1115] dark:text-white">
                  Office Room Protection
                </h4>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                  Require 4-digit PIN for unauthorized devices on this Wi-Fi
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggle();
                }}
                disabled={isUpdating}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  officeSecurityEnabled ? 'bg-[#10B981]' : 'bg-black/20 dark:bg-white/20'
                } ${isUpdating ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    officeSecurityEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Strict Device Approval Gate (5-people group isolation) */}
            {officeSecurityEnabled && (
              <div 
                onClick={handleToggleRequireApproval}
                className="bento-card rounded-2xl p-4 flex items-center justify-between gap-3 mb-4 border border-black/[0.06] dark:border-white/[0.08] cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition-all select-none"
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

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleRequireApproval();
                  }}
                  disabled={isUpdating}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    requireApproval ? 'bg-[#0071E3]' : 'bg-black/20 dark:bg-white/20'
                  } ${isUpdating ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      requireApproval ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Pending Requests Section (Live Host Gate) */}
            {pendingRequests.length > 0 && onApproveDevice && (
              <div className="mb-4 p-4 rounded-2xl bg-[#0071E3]/10 dark:bg-[#0071E3]/15 border border-[#0071E3]/30 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0071E3] dark:text-[#38BDF8]">
                  Pending Connection Requests ({pendingRequests.length})
                </span>
                {pendingRequests.map((req: any) => (
                  <div key={req.id} className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-[#1A1D26] border border-black/[0.08] dark:border-white/[0.08]">
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-bold text-[#0F1115] dark:text-white truncate">{req.name}</p>
                      <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">{req.ip}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => onApproveDevice(req.id, true)}
                        className="apple-press p-1.5 rounded-lg bg-[#10B981] text-white hover:bg-[#059669]"
                        title="Approve access"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onApproveDevice(req.id, false)}
                        className="apple-press p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600"
                        title="Deny access"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Approved Devices Count */}
            {officeSecurityEnabled && requireApproval && (
              <div className="mb-4 px-3 py-2 rounded-xl bg-[#F8FAFC] dark:bg-white/[0.04] text-[11px] text-[#64748B] dark:text-[#94A3B8] flex items-center justify-between">
                <span>Approved Colleagues:</span>
                <span className="font-bold text-[#0F1115] dark:text-white">{approvedDevices.length} devices</span>
              </div>
            )}

            {/* PIN Card (when enabled) */}
            {officeSecurityEnabled ? (
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                      Active Room PIN
                    </span>
                    <button
                      onClick={handleGenerateNewPin}
                      disabled={isUpdating}
                      className="apple-press text-[11px] font-semibold text-[#0071E3] dark:text-[#38BDF8] flex items-center gap-1 hover:underline"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Generate New</span>
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 bg-white dark:bg-[#1A1D26] px-4 py-2.5 rounded-xl border border-black/[0.08] dark:border-white/[0.08]">
                    <span className="font-mono text-2xl font-black tracking-widest text-[#0F1115] dark:text-white">
                      {officePin || customPin}
                    </span>
                    <button
                      onClick={handleCopyPin}
                      className="apple-press flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-[#10B981] dark:text-[#0A0D14]"
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
                  className="apple-press w-full py-2.5 px-4 rounded-2xl bg-white dark:bg-[#1A1E29] border border-black/[0.08] dark:border-white/[0.08] hover:border-[#0071E3] text-xs font-bold text-[#0F1115] dark:text-white flex items-center justify-center gap-2 transition-colors"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-[#10B981]" /> : <Copy className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8]" />}
                  <span>{copiedLink ? 'Link Copied to Clipboard' : 'Copy Quick Join Link (Auto-PIN)'}</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-[#FFFBEB] dark:bg-[#78350F]/20 border border-[#F59E0B]/30 text-[#92400E] dark:text-[#FCD34D] text-xs space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>Public Local Network Mode</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  Anyone on this Wi-Fi network who visits your IP can browse and download shared files. Enable Office Protection to isolate files to your group of 5.
                </p>
              </div>
            )}

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
