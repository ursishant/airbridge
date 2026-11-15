import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { 
  X, 
  Smartphone, 
  Laptop, 
  Battery, 
  BatteryCharging, 
  Wifi, 
  ShieldCheck
} from 'lucide-react';
import type { ConnectedDevice, ServerInfo } from '../hooks/useWebSocket';
import { 
  M3AirDropIcon, 
  M3CopyIcon, 
  M3CheckIcon 
} from './M3Icons';
import { copyToClipboard } from '../utils/clipboard';

interface DevicePairingQRProps {
  isOpen: boolean;
  onClose: () => void;
  serverInfo: ServerInfo | null;
  devices: ConnectedDevice[];
  myDeviceId: string;
  officeSecurityEnabled?: boolean;
  officePin?: string;
}

export const DevicePairingQR: React.FC<DevicePairingQRProps> = ({
  isOpen,
  onClose,
  serverInfo,
  devices,
  myDeviceId,
  officeSecurityEnabled = false,
  officePin = '',
}) => {
  const [copied, setCopied] = useState(false);
  const [selectedIp, setSelectedIp] = useState<string>('');

  const baseUrl = serverInfo
    ? `http://${selectedIp || serverInfo.primaryIp}:${serverInfo.port}`
    : typeof window !== 'undefined' ? window.location.origin : '';

  const currentUrl = officeSecurityEnabled && officePin
    ? `${baseUrl}/?pin=${encodeURIComponent(officePin)}`
    : baseUrl;

  const handleCopy = async () => {
    const success = await copyToClipboard(currentUrl);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="qr-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl"
          onClick={onClose}
        >
          <motion.div 
            key="qr-modal"
            initial={{ opacity: 0, scale: 0.96, filter: 'blur(4px)', y: 6 }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 }}
            exit={{ opacity: 0, scale: 0.97, filter: 'blur(3px)', y: 4 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md bg-white dark:bg-[#13151B] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl shadow-2xl p-6 sm:p-7 text-[#0F1115] dark:text-[#F3F4F6] transition-colors"
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

            {/* Title with AirDrop Radar Icon */}
            <div className="text-center mb-5">
              <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0071E3] text-white mb-3 shadow-md">
                <M3AirDropIcon className="w-7 h-7 text-white" filled />
              </div>
              <h2 className="font-display text-xl font-extrabold tracking-tight text-[#0F1115] dark:text-[#F3F4F6]">
                AirBridge Office Pairing
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 max-w-xs mx-auto">
                Connect Windows PCs, Macs, Android, iPhones & Linux devices on this Wi-Fi.
              </p>
              {officeSecurityEnabled && officePin && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 text-xs font-mono font-bold">
                  <span>ROOM PIN: {officePin} (AUTO-EMBEDDED)</span>
                </div>
              )}
            </div>

            {/* QR Code Container with high contrast border */}
            <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-sm border border-black/[0.08] mx-auto w-fit">
              <QRCodeSVG
                value={currentUrl}
                size={190}
                level="H"
                includeMargin={true}
              />
            </div>

            {/* Direct Link & Copy */}
            <div className="mt-4 p-3 bg-[#F8FAFC] dark:bg-[#181A22] rounded-2xl border border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between gap-2">
              <div className="overflow-hidden">
                <span className="block text-[10px] uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] font-bold">
                  Direct Browser Link:
                </span>
                <span className="text-xs font-mono text-[#0071E3] dark:text-[#38BDF8] font-medium truncate block tabular-nums">
                  {currentUrl}
                </span>
              </div>
              <button
                onClick={handleCopy}
                className="apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-[#1F222C] hover:bg-black/[0.02] dark:hover:bg-white/[0.06] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.08] dark:border-white/[0.08] shadow-sm transition-colors shrink-0"
              >
                {copied ? (
                  <>
                    <M3CheckIcon className="w-3.5 h-3.5 text-[#10B981]" />
                    <span className="text-[#10B981] font-semibold">Copied</span>
                  </>
                ) : (
                  <>
                    <M3CopyIcon className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Wi-Fi IP Dropdown if multiple */}
            {serverInfo && serverInfo.allIps.length > 1 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-[#64748B] dark:text-[#94A3B8]">
                <Wifi className="w-3.5 h-3.5 text-[#64748B]" />
                <span>Network IP:</span>
                <select
                  value={selectedIp || serverInfo.primaryIp}
                  onChange={(e) => setSelectedIp(e.target.value)}
                  className="bg-white dark:bg-[#181A22] text-[#0F1115] dark:text-white border border-black/[0.1] dark:border-white/[0.1] rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:border-[#0071E3] dark:focus:border-white font-mono tabular-nums"
                >
                  {serverInfo.allIps.map((ip) => (
                    <option key={ip.address} value={ip.address}>
                      {ip.address} ({ip.interface}) {ip.isWifi ? 'Wi-Fi' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Connected Devices List */}
            <div className="mt-4 border-t border-black/[0.06] dark:border-white/[0.06] pt-3.5">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-display font-bold text-[#0F1115] dark:text-[#F3F4F6]">
                  Active Devices ({devices.length})
                </span>
                <span className="flex items-center gap-1 text-[11px] text-[#10B981] font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Local Peer-to-Peer</span>
                </span>
              </div>

              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {devices.map((device) => {
                  const isMe = device.id === myDeviceId;
                  return (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06] text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {device.os === 'Android' ? (
                          <div className="p-1 rounded-lg bg-[#10B981]/10 text-[#10B981]">
                            <Smartphone className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="p-1 rounded-lg bg-[#0071E3]/10 text-[#0071E3] dark:text-[#38BDF8]">
                            <Laptop className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-[#0F1115] dark:text-[#F3F4F6]">{device.name}</span>
                          {isMe && (
                            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-black/[0.06] dark:bg-white/[0.1] text-[#64748B] dark:text-[#94A3B8]">
                              You
                            </span>
                          )}
                        </div>
                      </div>

                      {device.battery && (
                        <div className="flex items-center gap-1 text-[#64748B] dark:text-[#94A3B8] text-[11px] font-mono tabular-nums">
                          {device.battery.charging ? (
                            <BatteryCharging className="w-3.5 h-3.5 text-[#10B981]" />
                          ) : (
                            <Battery className="w-3.5 h-3.5" />
                          )}
                          <span>{device.battery.level}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Done Button */}
            <button
              onClick={onClose}
              className="apple-press mt-5 w-full py-2.5 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-[#0F1115] hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-[#0B0D13] shadow-sm transition-colors"
            >
              Done
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
