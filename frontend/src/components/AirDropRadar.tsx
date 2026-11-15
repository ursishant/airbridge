import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Sparkles, FolderUp, Users } from 'lucide-react';
import type { ConnectedDevice, ServerInfo } from '../hooks/useWebSocket';
import { 
  M3MacBookIcon, 
  M3PhoneIcon, 
  M3WindowsPcIcon,
  M3IosPhoneIcon,
  M3LinuxIcon,
  M3PhotosIcon, 
  M3FolderIcon, 
  M3CameraIcon, 
  M3AirDropIcon, 
  M3QrCodeIcon,
  M3ShieldLockIcon,
  M3BatteryPill
} from './M3Icons';
import { scanDataTransferItems, extractFilesFromList, type TraversedFile } from '../utils/folderUpload';

interface AirDropRadarProps {
  devices: ConnectedDevice[];
  myDeviceId: string;
  serverInfo: ServerInfo | null;
  isMac: boolean;
  isAndroid: boolean;
  isWindows?: boolean;
  deviceName: string;
  isUploading?: boolean;
  uploadProgress?: number;
  officeSecurityEnabled?: boolean;
  officePin?: string;
  onOpenSecuritySettings?: () => void;
  onOpenQR: () => void;
  onRingDevice: (target: 'android' | 'mac') => void;
  onDropFiles: (files: TraversedFile[] | FileList | File[]) => void;
  onOpenCameraSnap?: () => void;
}

export const AirDropRadar: React.FC<AirDropRadarProps> = ({
  devices,
  myDeviceId,
  serverInfo,
  isMac,
  isAndroid,
  isWindows = false,
  deviceName,
  isUploading = false,
  uploadProgress = 0,
  officeSecurityEnabled = false,
  officePin = '',
  onOpenSecuritySettings,
  onOpenQR: _onOpenQR,
  onRingDevice,
  onDropFiles,
  onOpenCameraSnap,
}) => {
  const [isDraggingStage, setIsDraggingStage] = useState(false);
  const [showInlineQr, setShowInlineQr] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const otherDevices = devices.filter((d) => d.id !== myDeviceId);
  const myDevice = devices.find((d) => d.id === myDeviceId) || {
    id: 'local',
    name: deviceName || (isWindows ? 'Windows PC' : isMac ? 'MacBook' : 'Android'),
    os: (isWindows ? 'Windows' : isMac ? 'macOS' : isAndroid ? 'Android' : 'Browser') as ConnectedDevice['os'],
    ip: '127.0.0.1',
    connectedAt: Date.now(),
  };

  let rawPairingUrl = serverInfo 
    ? `http://${serverInfo.primaryIp}:${serverInfo.port}` 
    : (typeof window !== 'undefined' ? window.location.origin : '');

  const pairingUrl = officeSecurityEnabled && officePin 
    ? `${rawPairingUrl}/?pin=${encodeURIComponent(officePin)}`
    : rawPairingUrl;

  const renderDeviceIcon = (os: string, className = "w-6 h-7") => {
    if (os === 'Windows') return <M3WindowsPcIcon className={className} active={true} />;
    if (os === 'macOS') return <M3MacBookIcon className={className} active={true} />;
    if (os === 'iOS') return <M3IosPhoneIcon className={className} active={true} />;
    if (os === 'Linux') return <M3LinuxIcon className={className} />;
    return <M3PhoneIcon className={className} active={true} />;
  };

  const handleDeviceClick = (device: ConnectedDevice) => {
    if (device.os === 'Android' || device.os === 'iOS') {
      onRingDevice('android');
    } else {
      onRingDevice('mac');
    }
  };

  const handleStageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingStage(false);
    if (e.dataTransfer) {
      const scanned = await scanDataTransferItems(e.dataTransfer.items);
      if (scanned.length > 0) {
        onDropFiles(scanned);
        return;
      }
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onDropFiles(extractFilesFromList(e.dataTransfer.files));
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onDropFiles(extractFilesFromList(e.target.files));
    }
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onDropFiles(extractFilesFromList(e.target.files));
    }
  };

  return (
    <div className="w-full">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory="true"
        directory=""
        multiple
        className="hidden"
        onChange={handleFolderInputChange}
      />
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Hero Transmission Stage */}
      <div 
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingStage(true);
        }}
        onDragLeave={() => setIsDraggingStage(false)}
        onDrop={handleStageDrop}
        className={`relative bento-card rounded-[32px] p-5 sm:p-8 transition-all duration-300 overflow-hidden ${
          isDraggingStage 
            ? 'ring-4 ring-[#0071E3]/20 dark:ring-[#C6F432]/30 scale-[1.008] border-[#0071E3] dark:border-[#C6F432]' 
            : ''
        }`}
      >
        {/* Ambient Top Glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0071E3]/[0.03] via-transparent to-transparent dark:from-[#C6F432]/[0.02] pointer-events-none" />

        <div className="relative z-10 space-y-6">
          {/* Row 1: Dual-Node Connection Conduit Stage */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6">
            {/* Host Node */}
            <div className="flex items-center gap-3.5 w-full sm:w-auto">
              <div className="w-13 h-13 rounded-2xl bg-[#F8FAFC] dark:bg-[#1A2030] border border-black/[0.08] dark:border-white/[0.1] shadow-sm flex items-center justify-center shrink-0">
                {renderDeviceIcon(myDevice.os, "w-7 h-7 text-[#0071E3] dark:text-white")}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-display text-sm sm:text-base font-bold text-[#0F1115] dark:text-[#F3F4F6] truncate tracking-tight">
                    {myDevice.name}
                  </h4>
                  <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] text-[#0071E3] dark:text-[#C6F432]">
                    Host
                  </span>
                </div>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono truncate mt-0.5">
                  {myDevice.ip || '127.0.0.1'} • {myDevice.os}
                </p>
              </div>
            </div>

            {/* Center Animated Conduit */}
            <div className="flex flex-col items-center justify-center gap-2 shrink-0 py-1 sm:py-0">
              <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.04] dark:border-white/[0.08]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10B981]" />
                </span>
                <span className="font-mono text-[10px] font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-wider">
                  {otherDevices.length > 0 ? `OFFICE MESH • ${otherDevices.length} PEER${otherDevices.length > 1 ? 'S' : ''} ACTIVE` : 'DIRECT LAN READY'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 opacity-80">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0071E3] animate-pulse" />
                <span className="w-16 sm:w-28 h-1 bg-gradient-to-r from-[#0071E3] via-[#10B981] to-[#C6F432] rounded-full" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#C6F432] animate-pulse" />
              </div>

              {/* Office Wi-Fi Security Pill */}
              <button
                onClick={() => onOpenSecuritySettings?.()}
                className={`apple-press flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-all ${
                  officeSecurityEnabled
                    ? 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 hover:bg-[#10B981]/25'
                    : 'bg-black/[0.04] dark:bg-white/[0.06] text-[#64748B] dark:text-[#94A3B8] border border-black/[0.06] dark:border-white/[0.08] hover:text-[#0F1115] dark:hover:text-white'
                }`}
                title="Click to configure Office Room Protection"
              >
                <M3ShieldLockIcon className="w-3 h-3" filled={officeSecurityEnabled} />
                <span>{officeSecurityEnabled ? `PIN: ${officePin || 'ACTIVE'}` : 'OFFICE SHIELD'}</span>
              </button>
            </div>

            {/* Remote Peer Node */}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              {otherDevices.length > 0 ? (
                <>
                  <div className="text-right min-w-0">
                    <div className="flex items-center justify-end gap-1.5">
                      <h4 className="font-display text-sm sm:text-base font-bold text-[#0F1115] dark:text-[#F3F4F6] truncate tracking-tight">
                        {otherDevices.length === 1 ? otherDevices[0].name : `${otherDevices.length} Office Devices`}
                      </h4>
                      <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981]">
                        {otherDevices.length === 1 ? otherDevices[0].os : 'Office Mesh'}
                      </span>
                    </div>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono truncate mt-0.5">
                      {otherDevices.length === 1 ? `${otherDevices[0].ip} • P2P Active` : 'Windows, Mac, Phone'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeviceClick(otherDevices[0])}
                    className="apple-press w-13 h-13 rounded-2xl bg-[#F8FAFC] dark:bg-[#1A2030] border border-black/[0.08] dark:border-white/[0.1] shadow-sm flex items-center justify-center shrink-0 cursor-pointer"
                    title={`Click to ping ${otherDevices[0].name}`}
                  >
                    {renderDeviceIcon(otherDevices[0].os, "w-6 h-7 text-[#10B981]")}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setShowInlineQr(!showInlineQr);
                  }}
                  className="apple-press flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#F8FAFC] dark:bg-[#1A2030] border border-dashed border-[#0071E3]/30 dark:border-white/20 hover:border-[#0071E3] transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#0071E3]/10 dark:bg-white/10 text-[#0071E3] dark:text-[#38BDF8] flex items-center justify-center shrink-0">
                    <M3QrCodeIcon className="w-4 h-4 text-[#0071E3] dark:text-[#C6F432]" />
                  </div>
                  <div className="text-left">
                    <p className="font-display text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6]">Pair Device</p>
                    <p className="text-[10px] text-[#0071E3] dark:text-[#C6F432] font-mono font-semibold">Scan QR code →</p>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Connected Office Peer Roster (when multiple office devices connected) */}
          {otherDevices.length > 1 && (
            <div className="pt-2 pb-1 border-t border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5">
                  <Users className="w-3 h-3 text-[#0071E3] dark:text-[#C6F432]" />
                  Connected Office Devices ({otherDevices.length})
                </span>
                <span className="text-[10px] text-[#10B981] font-mono font-bold">1 Gbps Direct LAN</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {otherDevices.map((dev) => (
                  <div
                    key={dev.id}
                    onClick={() => handleDeviceClick(dev)}
                    className="apple-press flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.06] hover:border-[#0071E3] transition-colors shrink-0 cursor-pointer"
                    title={`Click to ping ${dev.name}`}
                  >
                    <div className="shrink-0">
                      {renderDeviceIcon(dev.os, "w-4 h-4 text-[#0071E3] dark:text-[#C6F432]")}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#0F1115] dark:text-white truncate max-w-[120px]">
                        {dev.name}
                      </p>
                      <p className="text-[10px] font-mono text-[#64748B] dark:text-[#94A3B8]">
                        {dev.os} • {dev.ip}
                      </p>
                    </div>
                    {dev.battery && (
                      <M3BatteryPill level={dev.battery.level} charging={dev.battery.charging} className="ml-1" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inline QR Dropdown if opened */}
          <AnimatePresence>
            {showInlineQr && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden rounded-2xl bg-[#F8FAFC] dark:bg-[#151720] border border-black/[0.06] dark:border-white/[0.08] p-5 text-center"
              >
                <p className="text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6] mb-3 font-display">
                  Point Android Camera at this QR Code
                </p>
                <div className="inline-block p-3 bg-white rounded-2xl shadow-sm border border-black/[0.06]">
                  <QRCodeSVG value={pairingUrl} size={140} level="M" />
                </div>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono mt-3 select-all">
                  {pairingUrl}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Row 2: Seamless Magnetic Drag & Drop Capsule */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`w-full py-9 px-6 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-all ${
              isDraggingStage
                ? 'border-[#0071E3] dark:border-[#C6F432] bg-[#0071E3]/[0.05] dark:bg-[#C6F432]/[0.05] scale-[1.008]'
                : 'border-black/[0.08] dark:border-white/[0.1] hover:border-black/[0.2] dark:hover:border-white/[0.2] bg-[#F8FAFC]/50 dark:bg-[#151924]/40'
            }`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#1E2332] border border-black/[0.08] dark:border-white/[0.1] shadow-sm flex items-center justify-center text-[#0071E3] dark:text-[#C6F432] transition-transform hover:scale-105">
                <M3AirDropIcon className="w-6 h-6 text-inherit" filled />
              </div>
              <div>
                <h3 className="font-display text-sm sm:text-base font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
                  {isDraggingStage ? 'Release to Beam Instantly across Wi-Fi' : 'Drop Folders or Files Here to Beam'}
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1 max-w-md mx-auto">
                  Nested directory trees preserved on disk in <code className="px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.08] font-mono text-[11px] text-[#0F1115] dark:text-[#F3F4F6]">~/Downloads/AirBridge</code> • Up to 10GB
                </p>
              </div>
            </div>
          </div>

          {/* Row 3: 4 Tactile Action Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => {
                folderInputRef.current?.click();
              }}
              className="apple-press min-h-[48px] flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#F8FAFC] dark:bg-[#161B28] hover:bg-black/[0.04] dark:hover:bg-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.06] dark:border-white/[0.08] shadow-sm transition-colors"
              title="Upload entire folder with folder hierarchy preserved"
            >
              <FolderUp className="w-4 h-4 text-[#F59E0B] shrink-0" />
              <span className="truncate">Entire Folder</span>
            </button>

            <button
              onClick={() => {
                fileInputRef.current?.click();
              }}
              className="apple-press min-h-[48px] flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#F8FAFC] dark:bg-[#161B28] hover:bg-black/[0.04] dark:hover:bg-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.06] dark:border-white/[0.08] shadow-sm transition-colors"
            >
              <M3FolderIcon className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8] shrink-0" />
              <span className="truncate">All Files</span>
            </button>

            <button
              onClick={() => {
                mediaInputRef.current?.click();
              }}
              className="apple-press min-h-[48px] flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#F8FAFC] dark:bg-[#161B28] hover:bg-black/[0.04] dark:hover:bg-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.06] dark:border-white/[0.08] shadow-sm transition-colors"
            >
              <M3PhotosIcon className="w-4 h-4 text-[#10B981] dark:text-[#C6F432] shrink-0" />
              <span className="truncate">Photos & Video</span>
            </button>

            <button
              onClick={() => {
                if (onOpenCameraSnap) {
                  onOpenCameraSnap();
                } else {
                  cameraInputRef.current?.click();
                }
              }}
              className="apple-press min-h-[48px] flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#F8FAFC] dark:bg-[#161B28] hover:bg-black/[0.04] dark:hover:bg-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.06] dark:border-white/[0.08] shadow-sm transition-colors"
            >
              <M3CameraIcon className="w-4 h-4 text-[#8B5CF6] dark:text-[#A78BFA] shrink-0" />
              <span className="truncate">Camera</span>
            </button>
          </div>

          {/* Beaming Progress Bar */}
          <AnimatePresence>
            {isUploading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06]"
              >
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6]">
                    <span className="flex items-center gap-1.5 text-[#0071E3] dark:text-[#C6F432]">
                      <Sparkles className="w-3.5 h-3.5 animate-spin" />
                      Beaming files across Wi-Fi...
                    </span>
                    <span className="font-mono tabular-nums">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.1] overflow-hidden">
                    <motion.div
                      className="h-full bg-[#0071E3] dark:bg-[#C6F432] rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                      transition={{ ease: "easeOut", duration: 0.15 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
