import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Download, Users, UserCheck, UserX, RefreshCw } from 'lucide-react';
import { Header, ACCENT_PRESETS, type UiPreferences } from './components/Header';
import { DragDropPortal } from './components/DragDropPortal';
import { AirDropRadar } from './components/AirDropRadar';
import { DevicePairingQR } from './components/DevicePairingQR';
import { FileTransfer } from './components/FileTransfer';
import { UniversalClipboard } from './components/UniversalClipboard';
import { DeviceRemoteTools } from './components/DeviceRemoteTools';
import { PeerChat } from './components/PeerChat';
import {
  M3AirDropIcon,
  M3ClipboardIcon,
  M3ChatIcon,
  M3ToolsIcon,
} from './components/M3Icons';
import { getHostLabel } from './components/DeviceOsIcon';
import { CameraRapidSnap } from './components/CameraRapidSnap';
import { RingingModal } from './components/RingingModal';
import { OnTheGoModal } from './components/OnTheGoModal';
import { OfficeLockModal } from './components/OfficeLockModal';
import { OfficeSecuritySettingsModal } from './components/OfficeSecuritySettingsModal';
import { FolderBeamModal } from './components/FolderBeamModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { useWebSocket, deduplicateDevices, type UploadedFileItem } from './hooks/useWebSocket';
import { useTheme } from './hooks/useTheme';
import { scanDataTransferItems, extractFilesFromList, type TraversedFile } from './utils/folderUpload';
import { uploadFilesSmartly, type UploadProgressInfo } from './utils/chunkedUpload';
import { downloadFileSafely } from './utils/download';
import { getAuthHeaders } from './utils/device';

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const {
    isConnected,
    devices,
    myDeviceId,
    deviceName,
    updateDeviceName,
    serverInfo,
    roomSettings,
    roomFullInfo,
    updateRoomSettings,
    kickDevice,
    retryConnection,
    isAndroid,
    isMac,
    isWindows,
    officePin,
    isOfficeLocked,
    officeSecurityEnabled,
    verifyAndSetOfficePin,
    configureOfficeSecurity,
    handleApproveDevice,
    clipboardItems,
    chatMessages,
    isRinging,
    ringSource,
    recentUploadedFiles,
    activeToast,
    sendClipboard,
    clearClipboard,
    ringDevice,
    dismissRing,
    pingMac,
    pingHost,
    sendChatMessage,
    clearChat,
    showToast,
  } = useWebSocket();

  type TabType = 'files' | 'clipboard' | 'chat' | 'tools';

  const getInitialTab = (): TabType => {
    try {
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (hash === 'tools' || hash === 'clipboard' || hash === 'chat' || hash === 'files') {
        return hash as TabType;
      }
      if (hash === 'airdrop') return 'files';

      const saved = localStorage.getItem('airbridge_active_tab') as TabType;
      if (saved === 'tools' || saved === 'clipboard' || saved === 'chat' || saved === 'files') {
        return saved;
      }
    } catch (e) { }
    return 'files';
  };

  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isCameraSnapOpen, setIsCameraSnapOpen] = useState(false);
  const [isOnTheGoOpen, setIsOnTheGoOpen] = useState(false);
  const [isOfficeSecurityOpen, setIsOfficeSecurityOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [isApprovingReq, setIsApprovingReq] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const [uiPrefs, setUiPrefs] = useState<UiPreferences>(() => {
    try {
      const saved = localStorage.getItem('airbridge_ui_prefs');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          accentColor: parsed.accentColor && ACCENT_PRESETS[parsed.accentColor as keyof typeof ACCENT_PRESETS] ? parsed.accentColor : 'blue',
          confettiEnabled: parsed.confettiEnabled !== false,
          soundEnabled: parsed.soundEnabled !== false,
          compactStage: Boolean(parsed.compactStage),
        };
      }
    } catch (_) {}
    return {
      accentColor: 'blue',
      confettiEnabled: true,
      soundEnabled: true,
      compactStage: false,
    };
  });

  const updateUiPrefs = (patch: Partial<UiPreferences>) => {
    setUiPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem('airbridge_ui_prefs', JSON.stringify(next));
      } catch (_) {}
      return next;
    });
  };

  useEffect(() => {
    const preset = ACCENT_PRESETS[uiPrefs.accentColor] || ACCENT_PRESETS.blue;
    const root = document.documentElement.style;
    root.setProperty('--accent', theme === 'dark' ? preset.darkHex : preset.hex);
    root.setProperty('--accent-soft', preset.soft);
  }, [uiPrefs.accentColor, theme]);

  // Global Drag & Drop + Targeted Peer State
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadProgressInfo, setUploadProgressInfo] = useState<UploadProgressInfo | null>(null);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);

  // Folder Beam Confirmation Alert state
  const [pendingFolderUpload, setPendingFolderUpload] = useState<{
    folderName: string;
    files: TraversedFile[];
    targetIds?: string[];
  } | null>(null);

  useEffect(() => {
    const handleCmdK = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleCmdK);
    return () => window.removeEventListener('keydown', handleCmdK);
  }, []);

  // Window-level Drag & Drop detection
  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types?.includes('Files')) {
        setIsGlobalDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        setIsGlobalDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsGlobalDragging(false);
      if (e.dataTransfer) {
        const scanned = await scanDataTransferItems(e.dataTransfer.items);
        if (scanned.length > 0) {
          handleGlobalUpload(scanned);
          return;
        }
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleGlobalUpload(extractFilesFromList(e.dataTransfer.files));
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [deviceName]);

  const executeUpload = async (files: TraversedFile[], explicitTargetIds?: string[]) => {
    if (!files || files.length === 0) return;

    const targetIds = explicitTargetIds && explicitTargetIds.length > 0 ? explicitTargetIds : selectedTargetIds;
    setIsUploading(true);
    setUploadProgress(5);
    setUploadProgressInfo({
      percent: 5,
      currentFileName: files[0].file.name,
      fileIndex: 1,
      totalFiles: files.length,
    });

    try {
      await uploadFilesSmartly(
        files,
        deviceName,
        (progressInfo) => {
          setUploadProgress(progressInfo.percent);
          setUploadProgressInfo(progressInfo);
        },
        targetIds.length > 0 ? { recipients: targetIds } : undefined
      );

      setIsUploading(false);
      setUploadProgress(0);
      setUploadProgressInfo(null);
      if ('vibrate' in navigator) navigator.vibrate?.([12, 30, 18]);
      if (uiPrefs.confettiEnabled) {
        confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.25 },
          colors: ['#3B82F6', '#10B981', '#60A5FA'],
        });
      }
      const hasFolder = files.some((item) => item.relativePath.includes('/'));
      const privateSuffix = targetIds.length > 0 ? ` privately to ${targetIds.length} peer${targetIds.length > 1 ? 's' : ''}` : '';
      showToast(
        hasFolder
          ? `Beamed folder (${files.length.toLocaleString()} files)${privateSuffix}`
          : `Beamed ${files.length} file(s)${privateSuffix}`,
        'success'
      );
    } catch (err: any) {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadProgressInfo(null);
      showToast(err.message || 'Transfer failed', 'error');
    }
  };

  const handleGlobalUpload = async (
    items: TraversedFile[] | FileList | File[],
    isFromInput = false,
    explicitTargetIds?: string[]
  ) => {
    if (!items || (items as any).length === 0) return;

    let normalized: TraversedFile[] = [];
    if (items instanceof FileList) {
      normalized = extractFilesFromList(items);
    } else if (Array.isArray(items)) {
      if (items.length > 0 && 'relativePath' in items[0]) {
        normalized = items as TraversedFile[];
      } else {
        normalized = (items as File[]).map((f) => ({
          file: f,
          relativePath: (f as any).webkitRelativePath || f.name,
        }));
      }
    }

    if (normalized.length === 0) return;

    if (isFromInput) {
      await executeUpload(normalized, explicitTargetIds);
      return;
    }

    const hasDirectoryStructure = normalized.some((item) => item.relativePath.includes('/'));
    if (hasDirectoryStructure || normalized.length > 15) {
      let rootFolderName = 'Beam Folder';
      const sample = normalized.find((item) => item.relativePath.includes('/'));
      if (sample) {
        rootFolderName = sample.relativePath.split('/')[0];
      } else if (normalized.length > 0) {
        rootFolderName = `${normalized.length} Items`;
      }

      setPendingFolderUpload({
        folderName: rootFolderName,
        files: normalized,
        targetIds: explicitTargetIds,
      });
      return;
    }

    await executeUpload(normalized, explicitTargetIds);
  };

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) {
      showToast('Tap browser menu (⋮) -> Add to Home Screen');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('AirBridge installed');
      setDeferredPrompt(null);
    }
  };

  const cleanDevices = deduplicateDevices(devices);

  const [vaultFilesList, setVaultFilesList] = useState<UploadedFileItem[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetch('/api/files', { headers: getAuthHeaders() })
        .then((r) => r.json())
        .then((d) => {
          if (d.files && Array.isArray(d.files)) {
            setVaultFilesList(d.files);
          }
        })
        .catch(() => { });
    }, 1000);
    return () => clearTimeout(timer);
  }, [recentUploadedFiles]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    try {
      localStorage.setItem('airbridge_active_tab', tab);
      window.history.replaceState(null, '', `#${tab}`);
    } catch (e) { }
  };

  useEffect(() => {
    const handleHashChange = () => {
      try {
        const hash = window.location.hash.replace('#', '').toLowerCase();
        if (hash === 'tools' || hash === 'clipboard' || hash === 'chat' || hash === 'files') {
          setActiveTab(hash as TabType);
        } else if (hash === 'airdrop') {
          setActiveTab('files');
        }
      } catch (e) { }
    };

    window.addEventListener('hashchange', handleHashChange);
    if (!window.location.hash) {
      window.history.replaceState(null, '', `#${activeTab}`);
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('airbridge_active_tab', activeTab);
    } catch (e) { }
  }, [activeTab]);

  const isDark = theme === 'dark';

  return (
    <MotionConfig reducedMotion="user">
    <div
      className="min-h-screen flex flex-col font-sans selection:bg-[#3B82F6] selection:text-white relative overflow-x-hidden transition-colors duration-150"
      style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}
    >
      {/* Full-Screen Drag & Drop Portal */}
      <DragDropPortal isDragging={isGlobalDragging} targetCount={selectedTargetIds.length} />

      {/* Floating Apple Dynamic Island */}
      <Header
        isConnected={isConnected}
        devices={cleanDevices}
        myDeviceId={myDeviceId}
        serverInfo={serverInfo}
        deviceName={deviceName}
        isAndroid={isAndroid}
        isMac={isMac}
        isWindows={isWindows}
        officeSecurityEnabled={officeSecurityEnabled}
        officePin={officePin}
        roomSettings={roomSettings}
        uiPrefs={uiPrefs}
        onUpdateUiPrefs={updateUiPrefs}
        onUpdateRoomSettings={updateRoomSettings}
        onKickDevice={kickDevice}
        theme={theme}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        chatCount={chatMessages.length}
        clipboardCount={clipboardItems.length}
        latestClipboard={clipboardItems[0] || null}
        isTransferring={isUploading}
        transferProgress={uploadProgress}
        transferFileName={uploadProgressInfo?.currentFileName}
        transferSpeedMBs={uploadProgressInfo?.speedMBs}
        activeToast={activeToast}
        onToggleTheme={toggleTheme}
        onOpenQR={() => setIsQrOpen(true)}
        onOpenOnTheGo={() => setIsOnTheGoOpen(true)}
        onOpenSecuritySettings={() => setIsOfficeSecurityOpen(true)}
        onOpenCommandPalette={() => setIsCommandOpen(true)}
        onUpdateName={updateDeviceName}
        onRingPhone={() => ringDevice('android')}
        onPingMac={pingHost}
        onShowToast={showToast}
      />

      {/* Centered Single-Focus Content */}
      <main className="relative z-10 flex-1 max-w-5xl w-full mx-auto px-3.5 sm:px-6 pt-16 sm:pt-24 pb-28 md:pb-12 space-y-6">
        {/* Room Full Capacity Notice */}
        {roomFullInfo && (
          <div className="ab-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-amber-500/40">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="font-display text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  Room Capacity Reached ({roomFullInfo.currentCount}/{roomFullInfo.maxParticipants})
                </h4>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  This AirBridge room is currently limited to {roomFullInfo.maxParticipants} people. Ask the host to raise the limit in Dynamic Island.
                </p>
              </div>
            </div>
            <button onClick={retryConnection} className="ab-btn ab-btn-primary text-xs h-9 px-4 shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}
        {/* Live Host Connection Approval Banner */}
        <AnimatePresence>
          {serverInfo?.isHost && (serverInfo?.pendingApprovalRequests || []).length > 0 && (() => {
            const firstReq = serverInfo.pendingApprovalRequests![0];
            return (
              <motion.div
                key="host-approval-banner"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.16 } }}
                transition={{ duration: 0.18 }}
                className="ab-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                style={{ borderColor: 'var(--accent)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-display text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                      Connection Request ({serverInfo.pendingApprovalRequests!.length})
                    </h4>
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{firstReq.name}</span>
                      {' '}({firstReq.ip}) verified the PIN
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0 justify-end">
                  <button
                    type="button"
                    disabled={isApprovingReq}
                    onClick={async () => {
                      if (isApprovingReq) return;
                      setIsApprovingReq(true);
                      try {
                        await handleApproveDevice(firstReq.id, true);
                      } finally {
                        setIsApprovingReq(false);
                      }
                    }}
                    className="ab-btn flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3.5"
                  >
                    {isApprovingReq ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                    <span>Approve</span>
                  </button>
                  <button
                    type="button"
                    disabled={isApprovingReq}
                    onClick={async () => {
                      if (isApprovingReq) return;
                      setIsApprovingReq(true);
                      try {
                        await handleApproveDevice(firstReq.id, false);
                      } finally {
                        setIsApprovingReq(false);
                      }
                    }}
                    className="ab-btn bg-rose-600 hover:bg-rose-700 text-white text-xs h-8 px-3"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Deny</span>
                  </button>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Android PWA Install Banner */}
        {isAndroid && deferredPrompt && (
          <div className="ab-card p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="font-display text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>Install AirBridge</h4>
                <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>Add to Home Screen</p>
              </div>
            </div>
            <button onClick={handleInstallPwa} className="ab-btn bg-emerald-600 text-white text-xs h-8 px-3 shrink-0">
              Install
            </button>
          </div>
        )}

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] inset-x-3 z-30 pointer-events-none">
          <div
            className="pointer-events-auto w-full max-w-md mx-auto grid grid-cols-4 p-1 rounded-2xl backdrop-blur-md shadow-lg"
            style={{
              background: isDark ? 'rgba(17, 17, 19, 0.94)' : 'rgba(255, 255, 255, 0.95)',
              border: '1px solid var(--border)',
            }}
          >
            {(
              [
                { id: 'files', label: 'Transfer', icon: <M3AirDropIcon className="w-4 h-4" filled={activeTab === 'files'} /> },
                { id: 'clipboard', label: 'Clip', icon: <M3ClipboardIcon className="w-4 h-4" filled={activeTab === 'clipboard'} />, badge: clipboardItems.length },
                { id: 'chat', label: 'Chat', icon: <M3ChatIcon className="w-4 h-4" filled={activeTab === 'chat'} />, badge: chatMessages.length },
                { id: 'tools', label: 'Tools', icon: <M3ToolsIcon className="w-4 h-4" filled={activeTab === 'tools'} /> },
              ] as { id: TabType; label: string; icon: React.ReactNode; badge?: number }[]
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-xs transition-colors"
                  style={{
                    color: active ? (isDark ? '#111113' : '#FFFFFF') : 'var(--text-secondary)',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {active && (
                    <motion.div
                      layoutId="mobileNavPill"
                      className="absolute inset-0 rounded-xl"
                      style={{ background: 'var(--text-primary)' }}
                      transition={{ type: "spring", stiffness: 500, damping: 36 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center">
                    {tab.icon}
                    {tab.badge && tab.badge > 0 ? (
                      <span
                        className={`ml-1 inline-flex items-center justify-center text-[9px] px-1 py-0.5 leading-none rounded-full font-mono tabular-nums ${
                          active ? 'bg-white/20 dark:bg-black/15' : 'bg-black/[0.06] dark:bg-white/[0.08]'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="relative z-10 font-display text-[10px] leading-tight">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Views: immediate mount with crisp fade (no blank wait frame) */}
        {activeTab === 'files' && (
          <motion.div
            key="files"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="space-y-8"
          >
            <AirDropRadar
              devices={cleanDevices}
              myDeviceId={myDeviceId}
              serverInfo={serverInfo}
              isMac={isMac}
              isAndroid={isAndroid}
              isWindows={isWindows}
              officeSecurityEnabled={officeSecurityEnabled}
              officePin={officePin}
              onOpenSecuritySettings={() => setIsOfficeSecurityOpen(true)}
              deviceName={deviceName}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              uploadProgressInfo={uploadProgressInfo}
              selectedTargetIds={selectedTargetIds}
              onToggleTargetDevice={(id) =>
                setSelectedTargetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
              }
              onClearTargetDevices={() => setSelectedTargetIds([])}
              onOpenQR={() => setIsQrOpen(true)}
              onRingDevice={ringDevice}
              onDropFiles={handleGlobalUpload}
              onOpenCameraSnap={() => setIsCameraSnapOpen(true)}
              compactStage={uiPrefs.compactStage}
              uploadsDisabled={!serverInfo?.isHost && roomSettings.allowUploads === false}
            />
            <FileTransfer
              isAndroid={isAndroid}
              isMac={isMac}
              isWindows={isWindows}
              serverInfo={serverInfo}
              recentFiles={recentUploadedFiles}
              showToast={showToast}
            />
          </motion.div>
        )}

        {activeTab === 'clipboard' && (
          <motion.div
            key="clipboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          >
            <UniversalClipboard
              items={clipboardItems}
              onSendClipboard={sendClipboard}
              onClearClipboard={clearClipboard}
              isAndroid={isAndroid}
              isMac={isMac}
              isWindows={isWindows}
              hostLabel={getHostLabel(serverInfo)}
              showToast={showToast}
            />
          </motion.div>
        )}

        {activeTab === 'chat' && (
          <motion.div
            key="chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          >
            <PeerChat
              devices={cleanDevices}
              myDeviceId={myDeviceId}
              deviceName={deviceName}
              chatMessages={chatMessages}
              onSendMessage={sendChatMessage}
              onRingDevice={ringDevice}
              onClearChat={clearChat}
              showToast={showToast}
              isMac={isMac}
              isAndroid={isAndroid}
              isWindows={isWindows}
              serverInfo={serverInfo}
            />
          </motion.div>
        )}

        {activeTab === 'tools' && (
          <motion.div
            key="tools"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          >
            <DeviceRemoteTools
              devices={cleanDevices}
              chatMessages={chatMessages}
              serverInfo={serverInfo}
              onRingPhone={() => ringDevice('android')}
              onPingMac={pingMac}
              onSendMessage={sendChatMessage}
              onOpenChat={() => handleTabChange('chat')}
              showToast={showToast}
            />
          </motion.div>
        )}
      </main>

      {/* Modals */}
      <DevicePairingQR
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        serverInfo={serverInfo}
        devices={cleanDevices}
        myDeviceId={myDeviceId}
        officeSecurityEnabled={officeSecurityEnabled}
        officePin={officePin}
      />

      <OfficeLockModal
        isOpen={isOfficeLocked}
        onVerifyPin={verifyAndSetOfficePin}
        showToast={showToast}
        serverInfo={serverInfo}
      />

      <OfficeSecuritySettingsModal
        isOpen={isOfficeSecurityOpen}
        onClose={() => setIsOfficeSecurityOpen(false)}
        officeSecurityEnabled={officeSecurityEnabled}
        officePin={officePin}
        serverUrl={serverInfo?.url}
        serverInfo={serverInfo}
        roomSettings={roomSettings}
        onUpdateRoomSettings={updateRoomSettings}
        onConfigureSecurity={configureOfficeSecurity}
        onApproveDevice={handleApproveDevice}
        showToast={showToast}
      />

      <CameraRapidSnap
        isOpen={isCameraSnapOpen}
        onClose={() => setIsCameraSnapOpen(false)}
        deviceName={deviceName}
        showToast={showToast}
      />

      <OnTheGoModal
        isOpen={isOnTheGoOpen}
        onClose={() => setIsOnTheGoOpen(false)}
        deferredPrompt={deferredPrompt}
        onInstallPwa={handleInstallPwa}
        isAndroid={isAndroid}
        isMac={isMac}
      />

      <RingingModal
        isOpen={isRinging && uiPrefs.soundEnabled}
        ringSource={ringSource}
        onDismiss={dismissRing}
      />

      <FolderBeamModal
        isOpen={!!pendingFolderUpload}
        folderName={pendingFolderUpload?.folderName || ''}
        files={pendingFolderUpload?.files || []}
        onConfirm={(selectedFiles) => {
          const explicitTargets = pendingFolderUpload?.targetIds;
          setPendingFolderUpload(null);
          executeUpload(selectedFiles, explicitTargets);
        }}
        onClose={() => setPendingFolderUpload(null)}
      />

      <CommandPaletteModal
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        theme={theme}
        files={vaultFilesList}
        onNavigate={handleTabChange}
        onToggleTheme={toggleTheme}
        onOpenQR={() => setIsQrOpen(true)}
        onOpenSecurity={() => setIsOfficeSecurityOpen(true)}
        onRingPhone={() => ringDevice('android')}
        onPingMac={pingMac}
        onDownloadFile={(f) => downloadFileSafely(f.path, f.name, f.size)}
      />
    </div>
    </MotionConfig>
  );
};
export default App;
