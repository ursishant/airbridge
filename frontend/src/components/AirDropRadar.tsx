import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderUp, Upload } from 'lucide-react';
import type { ConnectedDevice, ServerInfo } from '../hooks/useWebSocket';
import type { UploadProgressInfo } from '../utils/chunkedUpload';
import {
  M3PhotosIcon,
  M3CameraIcon,
  M3AirDropIcon,
  M3BatteryPill,
} from './M3Icons';
import { DeviceOsIcon } from './DeviceOsIcon';
import { scanDataTransferItems, extractFilesFromList, pickAndTraverseDirectory, type TraversedFile } from '../utils/folderUpload';

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
  uploadProgressInfo?: UploadProgressInfo | null;
  selectedTargetIds?: string[];
  onToggleTargetDevice?: (deviceId: string) => void;
  onClearTargetDevices?: () => void;
  officeSecurityEnabled?: boolean;
  officePin?: string;
  onOpenSecuritySettings?: () => void;
  onOpenQR: () => void;
  onRingDevice: (target: 'android' | 'mac') => void;
  onDropFiles: (files: TraversedFile[] | FileList | File[], isFromInput?: boolean, explicitTargetIds?: string[]) => void;
  onOpenCameraSnap?: () => void;
  compactStage?: boolean;
  uploadsDisabled?: boolean;
}

export const AirDropRadar: React.FC<AirDropRadarProps> = ({
  devices,
  myDeviceId,
  isUploading = false,
  uploadProgress = 0,
  uploadProgressInfo = null,
  selectedTargetIds = [],
  onToggleTargetDevice,
  onClearTargetDevices,
  onRingDevice,
  onDropFiles,
  onOpenCameraSnap,
  compactStage = false,
  uploadsDisabled = false,
}) => {
  const [isDraggingStage, setIsDraggingStage] = useState(false);
  const [hoveredTargetPeerId, setHoveredTargetPeerId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const otherDevices = devices.filter((d) => d.id !== myDeviceId);

  const handleDeviceClick = (device: ConnectedDevice) => {
    if (device.os === 'Android' || device.os === 'iOS') {
      onRingDevice('android');
    } else {
      onRingDevice('mac');
    }
  };

  const handlePeerDrop = async (e: React.DragEvent, targetDeviceId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingStage(false);
    setHoveredTargetPeerId(null);
    if (e.dataTransfer) {
      const scanned = await scanDataTransferItems(e.dataTransfer.items);
      if (scanned.length > 0) {
        onDropFiles(scanned, false, [targetDeviceId]);
        return;
      }
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onDropFiles(extractFilesFromList(e.dataTransfer.files), false, [targetDeviceId]);
      }
    }
  };

  const handleStageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingStage(false);
    if (e.dataTransfer) {
      const scanned = await scanDataTransferItems(e.dataTransfer.items);
      if (scanned.length > 0) {
        onDropFiles(scanned, false);
        return;
      }
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onDropFiles(extractFilesFromList(e.dataTransfer.files), false);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onDropFiles(extractFilesFromList(e.target.files), true);
    }
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onDropFiles(extractFilesFromList(e.target.files), true);
    }
  };

  const handlePickFolder = async () => {
    const scanned = await pickAndTraverseDirectory();
    if (scanned !== null) {
      if (scanned.length > 0) {
        onDropFiles(scanned, true);
      }
      return;
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = '';
      (folderInputRef.current as any).webkitdirectory = true;
      (folderInputRef.current as any).directory = true;
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
      folderInputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      {/* Hidden File Inputs */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileInputChange} />
      <input
        ref={(el) => {
          folderInputRef.current = el;
          if (el) {
            (el as any).webkitdirectory = true;
            (el as any).directory = true;
            el.setAttribute('webkitdirectory', '');
            el.setAttribute('directory', '');
          }
        }}
        type="file"
        multiple
        className="hidden"
        onChange={handleFolderInputChange}
      />
      <input ref={mediaInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleFileInputChange} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileInputChange} />

      {/* Center Stage Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDraggingStage(true); }}
        onDragLeave={() => setIsDraggingStage(false)}
        onDrop={handleStageDrop}
        className={`relative rounded-2xl transition-colors duration-150 ${
          isDraggingStage ? 'ring-2 ring-blue-500/40 bg-blue-50 dark:bg-blue-500/[0.06]' : ''
        }`}
        style={{ border: `1.5px dashed ${isDraggingStage ? 'var(--accent)' : 'var(--border)'}` }}
      >
        {/* Upload Progress Overlay */}
        <AnimatePresence>
          {isUploading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 rounded-2xl flex flex-col items-center justify-center gap-3"
              style={{ background: 'var(--surface)' }}
            >
              <div className="relative w-16 h-16">
                <svg className="w-16 h-16 -rotate-90">
                  <circle cx="32" cy="32" r="28" stroke="var(--border)" strokeWidth="3" fill="none" />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="var(--accent)"
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray={175.9}
                    strokeDashoffset={175.9 - (175.9 * uploadProgress) / 100}
                    strokeLinecap="round"
                    className="transition-[stroke-dashoffset] duration-200"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold font-mono" style={{ color: 'var(--accent)' }}>
                    {uploadProgress}%
                  </span>
                </div>
              </div>
              <div className="text-center px-6">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {uploadProgressInfo?.currentFileName ? `Sending ${uploadProgressInfo.currentFileName}` : 'Sending...'}
                </p>
                <div className="flex items-center justify-center gap-3 mt-1 text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                  {uploadProgressInfo?.totalFiles && uploadProgressInfo.totalFiles > 1 && (
                    <span>{uploadProgressInfo.fileIndex}/{uploadProgressInfo.totalFiles} files</span>
                  )}
                  {uploadProgressInfo?.speedMBs !== undefined && uploadProgressInfo.speedMBs > 0 && (
                    <span style={{ color: 'var(--success)' }}>{uploadProgressInfo.speedMBs} MB/s</span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`flex flex-col items-center justify-center px-4 sm:px-6 ${compactStage ? 'py-7 sm:py-10' : 'py-10 sm:py-16'}`}>
          <div
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mb-4 sm:mb-5"
            style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
          >
            <M3AirDropIcon className="w-6 h-6 sm:w-7 sm:h-7" filled style={{ color: 'var(--accent)' }} />
          </div>

          <h2 className="font-display text-lg sm:text-xl font-bold tracking-tight text-center" style={{ color: 'var(--text-primary)' }}>
            {uploadsDisabled ? 'Uploads paused by host' : isDraggingStage ? 'Drop to send' : 'Drop files here'}
          </h2>
          <p className="text-xs sm:text-sm mt-1.5 text-center max-w-md" style={{ color: 'var(--text-tertiary)' }}>
            {uploadsDisabled
              ? 'You can still browse and download shared files below'
              : 'or use the buttons below · direct LAN transfer up to 10 GB'}
          </p>

          {!uploadsDisabled && (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-center gap-2 mt-5 sm:mt-6 w-full max-w-xs sm:max-w-none sm:w-auto">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="ab-btn ab-btn-primary text-xs h-9 px-4">
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span>Files</span>
              </button>
              <button type="button" onClick={handlePickFolder} className="ab-btn ab-btn-ghost text-xs h-9 px-4" title="Send folder">
                <FolderUp className="w-3.5 h-3.5 shrink-0" style={{ color: '#D97706' }} />
                <span>Folder</span>
              </button>
              <button type="button" onClick={() => mediaInputRef.current?.click()} className="ab-btn ab-btn-ghost text-xs h-9 px-4">
                <M3PhotosIcon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--success)' }} />
                <span>Photos</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenCameraSnap ? onOpenCameraSnap() : cameraInputRef.current?.click();
                }}
                className="ab-btn ab-btn-ghost text-xs h-9 px-4"
              >
                <M3CameraIcon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                <span>Camera</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Connected Peers Strip (only shown when nearby devices are online) */}
      {otherDevices.length > 0 && (
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="ab-kicker flex items-center gap-1.5">
              Nearby ({otherDevices.length})
              {selectedTargetIds.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  {selectedTargetIds.length} targeted
                </span>
              )}
            </span>
            {selectedTargetIds.length > 0 && (
              <button onClick={() => onClearTargetDevices?.()} className="text-[11px] font-medium" style={{ color: 'var(--accent)' }}>
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {otherDevices.map((dev) => {
              const isTargeted = selectedTargetIds.includes(dev.id);
              const isDropHover = hoveredTargetPeerId === dev.id;
              return (
                <div
                  key={dev.id}
                  onClick={() => {
                    if (onToggleTargetDevice) {
                      if ('vibrate' in navigator) navigator.vibrate?.(8);
                      onToggleTargetDevice(dev.id);
                    } else {
                      handleDeviceClick(dev);
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setHoveredTargetPeerId(dev.id);
                  }}
                  onDragLeave={(e) => {
                    e.stopPropagation();
                    setHoveredTargetPeerId((c) => (c === dev.id ? null : c));
                  }}
                  onDrop={(e) => handlePeerDrop(e, dev.id)}
                  className="apple-press flex items-center gap-2 px-3 py-2 rounded-xl shrink-0 cursor-pointer transition-all duration-150"
                  style={{
                    background: isDropHover || isTargeted ? 'var(--accent-soft)' : 'var(--surface-alt)',
                    border: `1px solid ${isDropHover || isTargeted ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                  title={`Click to target ${dev.name}`}
                >
                  <DeviceOsIcon os={dev.os} className="w-4 h-4 shrink-0" active />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate max-w-[100px]" style={{ color: 'var(--text-primary)' }}>
                      {dev.name}
                    </p>
                    <p className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                      {isDropHover ? 'Drop here' : dev.os}
                    </p>
                  </div>
                  {dev.battery && <M3BatteryPill level={dev.battery.level} charging={dev.battery.charging} className="ml-0.5" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
