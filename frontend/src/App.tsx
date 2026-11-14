import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Download, Zap, ArrowRight, Volume2 } from 'lucide-react';
import { Header } from './components/Header';
import { DynamicIsland } from './components/DynamicIsland';
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
  M3MacBookIcon,
  M3PhoneIcon,
  M3SendIcon,
  M3BatteryPill,
  M3QrCodeIcon
} from './components/M3Icons';
import { CameraRapidSnap } from './components/CameraRapidSnap';
import { RingingModal } from './components/RingingModal';
import { OnTheGoModal } from './components/OnTheGoModal';
import { useWebSocket, deduplicateDevices } from './hooks/useWebSocket';
import { useTheme } from './hooks/useTheme';
import { scanDataTransferItems, extractFilesFromList, type TraversedFile } from './utils/folderUpload';
import { uploadFilesSmartly } from './utils/chunkedUpload';

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const {
    isConnected,
    devices,
    myDeviceId,
    deviceName,
    updateDeviceName,
    serverInfo,
    isAndroid,
    isMac,
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
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Global Drag & Drop State
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Window-level Drag & Drop detection for immersive AirDrop feel
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

  const handleGlobalUpload = async (items: TraversedFile[] | FileList | File[]) => {
    if (!items || items.length === 0) return;

    let normalized: TraversedFile[] = [];
    if (items instanceof FileList) {
      normalized = extractFilesFromList(items);
    } else if (Array.isArray(items)) {
      if (items.length > 0 && 'relativePath' in items[0]) {
        normalized = items as TraversedFile[];
      } else {
        normalized = (items as File[]).map(f => ({ file: f, relativePath: (f as any).webkitRelativePath || f.name }));
      }
    }

    if (normalized.length === 0) return;

    setIsUploading(true);
    setUploadProgress(5);

    try {
      await uploadFilesSmartly(normalized, deviceName, (progressInfo) => {
        setUploadProgress(progressInfo.percent);
      });

      setIsUploading(false);
      setUploadProgress(0);
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.2 },
        colors: ['#0071E3', '#34C759', '#5AC8FA'],
      });
      const hasFolder = normalized.some(item => item.relativePath.includes('/'));
      showToast(hasFolder ? `Beamed folder structure (${normalized.length} files)` : `Beamed ${normalized.length} file(s)`);
    } catch (err: any) {
      setIsUploading(false);
      setUploadProgress(0);
      showToast(err.message || 'Transfer failed');
    }
  };

  // Capture PWA install prompt on Android / Chrome
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
  const macCount = cleanDevices.filter((d) => d.os === 'macOS').length;
  const androidCount = cleanDevices.filter((d) => d.os === 'Android').length;
  const peerDevice = cleanDevices.find((d) => d.id !== myDeviceId && d.os === 'Android') || cleanDevices.find((d) => d.id !== myDeviceId) || null;

  const [vaultFileCount, setVaultFileCount] = useState<number>(() => {
    try {
      const cached = localStorage.getItem('airbridge_cached_files');
      if (cached) return JSON.parse(cached).length;
    } catch (e) { }
    return 0;
  });

  useEffect(() => {
    fetch('/api/files')
      .then((r) => r.json())
      .then((d) => {
        if (d.files && Array.isArray(d.files)) {
          setVaultFileCount(d.files.length);
        }
      })
      .catch(() => { });
  }, [recentUploadedFiles]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    try {
      localStorage.setItem('airbridge_active_tab', tab);
      window.history.replaceState(null, '', `#${tab}`);
    } catch (e) { }
  };

  // Sync tab with browser back/forward and URL hash changes
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

  return (
    <div className="min-h-screen bg-[#F2F4F7] text-[#0F1115] dark:bg-[#0A0B0E] dark:text-[#F3F4F6] flex flex-col font-sans selection:bg-[#0071E3] selection:text-white dark:selection:bg-white dark:selection:text-[#0B0D13] relative overflow-x-hidden transition-colors duration-200">
      {/* Subtle Ambient Glows */}
      <div className="ambient-bg">
        <div className="ambient-orb-1" />
        <div className="ambient-orb-2" />
      </div>

      {/* Full-Screen Liquid Drag & Drop Portal */}
      <DragDropPortal isDragging={isGlobalDragging} />

      {/* Dynamic Island HUD at Top of Viewport */}
      <DynamicIsland
        isConnected={isConnected}
        macCount={macCount}
        androidCount={androidCount}
        isTransferring={isUploading}
        transferProgress={uploadProgress}
        activeToast={activeToast}
        onOpenQR={() => setIsQrOpen(true)}
        onRingPhone={() => ringDevice('android')}
        onPingMac={pingMac}
        isMac={isMac}
      />

      {/* Bento Navigation Header with Light/Dark Theme Conversion */}
      <Header
        isConnected={isConnected}
        devices={cleanDevices}
        serverInfo={serverInfo}
        deviceName={deviceName}
        isAndroid={isAndroid}
        isMac={isMac}
        theme={theme}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        chatCount={chatMessages.length}
        clipboardCount={clipboardItems.length}
        onToggleTheme={toggleTheme}
        onOpenQR={() => setIsQrOpen(true)}
        onOpenOnTheGo={() => setIsOnTheGoOpen(true)}
        onUpdateName={updateDeviceName}
        onRingPhone={() => ringDevice('android')}
        onPingMac={pingMac}
      />

      {/* Main Container: Full-Width Expansive Executive Bento Canvas */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6">
        {/* Salesforce Executive Page Title & Status Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-2xl sm:text-3xl font-black text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
                {activeTab === 'files' ? 'AirDrop Conduit' : activeTab === 'clipboard' ? 'Live Clipboard' : activeTab === 'chat' ? 'Peer Chat' : 'Remote Suite'}
              </h1>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-black/[0.04] dark:bg-white/[0.08] text-[#0071E3] dark:text-[#C6F432]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                <span>{cleanDevices.length} ACTIVE {cleanDevices.length === 1 ? 'NODE' : 'NODES'}</span>
              </span>
            </div>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              Zero-cloud peer-to-peer Wi-Fi connection between macOS and Android
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setIsQrOpen(true)}
              className="apple-press flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold bg-white dark:bg-[#151924] hover:bg-black/[0.04] dark:hover:bg-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.06] dark:border-white/[0.08] shadow-sm transition-colors"
            >
              <M3QrCodeIcon className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#C6F432]" />
              <span>Pair Device</span>
            </button>
          </div>
        </div>

        {/* Executive 4-Card Bento Metric Deck (Salesforce / Cardiology Architecture) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4.5">
          {/* Card 1: Host Mac Hardware */}
          <div className="bento-card rounded-3xl p-4 sm:p-5 flex flex-col justify-between transition-transform hover:scale-[1.01]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                Host Node
              </span>
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            </div>
            <div className="mt-3">
              <h4 className="font-display text-base sm:text-lg font-bold text-[#0F1115] dark:text-[#F3F4F6] truncate tracking-tight">
                {deviceName}
              </h4>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono truncate mt-0.5">
                {serverInfo?.primaryIp || '127.0.0.1'} • {isMac ? 'macOS' : 'Host'}
              </p>
            </div>
          </div>

          {/* Card 2: Connected Android Peer */}
          <div
            onClick={() => {
              if (!peerDevice) setIsQrOpen(true);
            }}
            className={`bento-card rounded-3xl p-4 sm:p-5 flex flex-col justify-between transition-transform hover:scale-[1.01] ${!peerDevice ? 'cursor-pointer border-dashed border-[#0071E3]/30 dark:border-white/20' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                {peerDevice ? 'Live Peer' : 'Peer Target'}
              </span>
              <span className={`w-2 h-2 rounded-full ${peerDevice ? 'bg-[#10B981]' : 'bg-[#F59E0B] animate-pulse'}`} />
            </div>
            <div className="mt-3">
              <h4 className="font-display text-base sm:text-lg font-bold text-[#0F1115] dark:text-[#F3F4F6] truncate tracking-tight">
                {peerDevice ? peerDevice.name : 'Tap to Pair Phone'}
              </h4>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono truncate mt-0.5">
                {peerDevice ? `${peerDevice.ip} • P2P Active` : 'Scan QR code to connect'}
              </p>
            </div>
          </div>

          {/* Card 3: P2P Wireless Link */}
          <div className="bento-card rounded-3xl p-4 sm:p-5 flex flex-col justify-between transition-transform hover:scale-[1.01]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                Link Latency
              </span>
              <span className="text-[10px] text-[#10B981] dark:text-[#C6F432] font-bold font-mono">0 JITTER</span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-xl sm:text-2xl font-black text-[#0F1115] dark:text-[#F3F4F6]">
                  1.2 ms
                </span>
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono truncate mt-0.5">
                Direct LAN • Zero Cloud Hops
              </p>
            </div>
          </div>

          {/* Card 4: Vault & Files */}
          <div className="bento-card rounded-3xl p-4 sm:p-5 flex flex-col justify-between transition-transform hover:scale-[1.01]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                AirBridge Vault
              </span>
              <span className="text-[10px] font-mono font-bold text-[#8B5CF6]">LOCAL</span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-xl sm:text-2xl font-black text-[#0F1115] dark:text-[#F3F4F6]">
                  {vaultFileCount} {vaultFileCount === 1 ? 'item' : 'items'}
                </span>
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono truncate mt-0.5">
                ~/Downloads/AirBridge
              </p>
            </div>
          </div>
    </div>

        {/* Android PWA Install Banner */ }
  {
    isAndroid && deferredPrompt && (
      <div className="bento-card rounded-2xl p-3.5 flex items-center justify-between gap-3 border border-[#10B981]/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#10B981]/15 text-[#10B981] flex items-center justify-center shrink-0">
            <Download className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-display text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6] truncate">Install AirBridge</h4>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] truncate">Run full screen from Home Screen</p>
          </div>
        </div>
        <button
          onClick={handleInstallPwa}
          className="apple-press px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#10B981] text-white shrink-0 shadow-sm"
        >
          Install
        </button>
      </div>
    )
  }

  {/* Mobile-Only Bento Segmented Navigation Bar (Salesforce Architecture) */ }
  <div className="flex md:hidden justify-center pb-1">
    <div className="relative inline-flex items-center bento-nav-track">
      {/* AirDrop Tab */}
      <button
        onClick={() => handleTabChange('files')}
        className={`apple-press relative z-10 flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors shrink-0 ${activeTab === 'files'
          ? 'text-white dark:text-[#0A0D14] font-bold'
          : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white font-medium'
          }`}
      >
        {activeTab === 'files' && (
          <motion.div
            layoutId="activeBentoTabPill"
            className="absolute inset-0 bg-[#0F1115] dark:bg-[#C6F432] rounded-xl shadow-sm dark:shadow-[0_2px_12px_rgba(198,244,50,0.35)]"
            transition={{ type: "spring", stiffness: 450, damping: 32 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-1 sm:gap-1.5">
          <M3AirDropIcon
            className={`w-3.5 h-3.5 ${activeTab === 'files'
              ? 'text-white dark:text-[#0A0D14]'
              : 'text-[#0071E3] dark:text-[#38BDF8]'
              }`}
            filled={activeTab === 'files'}
          />
          <span className="font-display tracking-tight">AirDrop</span>
        </span>
      </button>

      {/* Live Clipboard Tab */}
      <button
        onClick={() => handleTabChange('clipboard')}
        className={`apple-press relative z-10 flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors shrink-0 ${activeTab === 'clipboard'
          ? 'text-white dark:text-[#0A0D14] font-bold'
          : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white font-medium'
          }`}
      >
        {activeTab === 'clipboard' && (
          <motion.div
            layoutId="activeBentoTabPill"
            className="absolute inset-0 bg-[#0F1115] dark:bg-[#C6F432] rounded-xl shadow-sm dark:shadow-[0_2px_12px_rgba(198,244,50,0.35)]"
            transition={{ type: "spring", stiffness: 450, damping: 32 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-1 sm:gap-1.5">
          <M3ClipboardIcon
            className={`w-3.5 h-3.5 ${activeTab === 'clipboard'
              ? 'text-white dark:text-[#0A0D14]'
              : 'text-[#10B981] dark:text-[#34D399]'
              }`}
            filled={activeTab === 'clipboard'}
          />
          <span className="font-display tracking-tight">Clipboard</span>
          {clipboardItems.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${activeTab === 'clipboard'
              ? 'bg-white/20 dark:bg-black/20 text-inherit'
              : 'bg-black/[0.06] dark:bg-white/[0.08] text-[#64748B] dark:text-[#94A3B8]'
              }`}>
              {clipboardItems.length}
            </span>
          )}
        </span>
      </button>

      {/* Chat Tab */}
      <button
        onClick={() => handleTabChange('chat')}
        className={`apple-press relative z-10 flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors shrink-0 ${activeTab === 'chat'
          ? 'text-white dark:text-[#0A0D14] font-bold'
          : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white font-medium'
          }`}
      >
        {activeTab === 'chat' && (
          <motion.div
            layoutId="activeBentoTabPill"
            className="absolute inset-0 bg-[#0F1115] dark:bg-[#C6F432] rounded-xl shadow-sm dark:shadow-[0_2px_12px_rgba(198,244,50,0.35)]"
            transition={{ type: "spring", stiffness: 450, damping: 32 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-1 sm:gap-1.5">
          <M3ChatIcon
            className={`w-3.5 h-3.5 ${activeTab === 'chat'
              ? 'text-white dark:text-[#0A0D14]'
              : 'text-[#0071E3] dark:text-[#38BDF8]'
              }`}
            filled={activeTab === 'chat'}
          />
          <span className="font-display tracking-tight">Chat</span>
          {chatMessages.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold tabular-nums ${activeTab === 'chat'
              ? 'bg-white/20 dark:bg-black/20 text-inherit'
              : 'bg-[#0071E3]/15 dark:bg-white/10 text-[#0071E3] dark:text-[#38BDF8]'
              }`}>
              {chatMessages.length}
            </span>
          )}
        </span>
      </button>

      {/* Remote & Tools Tab */}
      <button
        onClick={() => handleTabChange('tools')}
        className={`apple-press relative z-10 flex items-center gap-1 sm:gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors shrink-0 ${activeTab === 'tools'
          ? 'text-white dark:text-[#0A0D14] font-bold'
          : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white font-medium'
          }`}
      >
        {activeTab === 'tools' && (
          <motion.div
            layoutId="activeBentoTabPill"
            className="absolute inset-0 bg-[#0F1115] dark:bg-[#C6F432] rounded-xl shadow-sm dark:shadow-[0_2px_12px_rgba(198,244,50,0.35)]"
            transition={{ type: "spring", stiffness: 450, damping: 32 }}
          />
        )}
        <span className="relative z-10 flex items-center gap-1 sm:gap-1.5">
          <M3ToolsIcon
            className={`w-3.5 h-3.5 ${activeTab === 'tools'
              ? 'text-white dark:text-[#0A0D14]'
              : 'text-[#8B5CF6] dark:text-[#A78BFA]'
              }`}
            filled={activeTab === 'tools'}
          />
          <span className="font-display tracking-tight">Tools</span>
        </span>
      </button>
    </div>
  </div>

  {/* Tab Views with Emil Kowalski Snappy Timing */ }
  <AnimatePresence mode="wait">
    {activeTab === 'files' && (
      <motion.div
        key="files"
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-6"
      >
        {/* 1. Full-Width Expansive Hero AirDrop Stage */}
        <AirDropRadar
          devices={cleanDevices}
          myDeviceId={myDeviceId}
          serverInfo={serverInfo}
          isMac={isMac}
          isAndroid={isAndroid}
          deviceName={deviceName}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          onOpenQR={() => setIsQrOpen(true)}
          onRingDevice={ringDevice}
          onDropFiles={handleGlobalUpload}
          onOpenCameraSnap={() => setIsCameraSnapOpen(true)}
        />
        {/* 2. Salesforce Signature Bento Container housing Vault Stream (Left 7 cols) & Companion Deck (Right 5 cols) */}
        <FileTransfer
          isAndroid={isAndroid}
          isMac={isMac}
          recentFiles={recentUploadedFiles}
          showToast={showToast}
          companionDeck={
            <div className="bg-[#F8FAFC] dark:bg-[#141926] rounded-2xl p-4 sm:p-5 border border-black/[0.06] dark:border-white/[0.06] space-y-4 transition-colors">
              {/* Active Hardware Vitals */}
              <div className="space-y-2.5 pb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                    <h4 className="font-display text-xs font-bold text-[#0F1115] dark:text-white tracking-tight">
                      Connected Hardware
                    </h4>
                  </div>
                  <button
                    onClick={() => handleTabChange('tools')}
                    className="apple-press text-[11px] font-semibold text-[#0071E3] dark:text-[#C6F432] hover:underline flex items-center gap-1"
                  >
                    <span>Manage</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {(cleanDevices.length > 0 ? cleanDevices.slice(0, 2) : [
                    { id: 'host', name: deviceName, os: (isMac ? 'macOS' : 'Host') as any, ip: serverInfo?.primaryIp || '127.0.0.1', connectedAt: Date.now(), battery: null }
                  ]).map((dev) => {
                    const isDevMac = dev.os === 'macOS' || dev.name.toLowerCase().includes('mac');
                    return (
                      <div
                        key={dev.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06] shadow-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-[#F1F5F9] dark:bg-white/[0.08] flex items-center justify-center shrink-0">
                            {isDevMac ? <M3MacBookIcon className="w-4 h-4 text-[#0071E3] dark:text-white" active={true} /> : <M3PhoneIcon className="w-4 h-4 text-[#10B981]" active={true} />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-display text-xs font-bold text-[#0F1115] dark:text-white truncate">{dev.name}</p>
                            <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] font-mono truncate">{dev.os} • {dev.ip}</p>
                          </div>
                        </div>
                        {dev.battery ? (
                          <M3BatteryPill level={dev.battery.level} charging={dev.battery.charging} />
                        ) : (
                          <span className="text-[10px] font-semibold text-[#64748B] dark:text-[#94A3B8] bg-black/[0.04] dark:bg-white/[0.06] px-2 py-0.5 rounded-full font-mono">
                            Host
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Live Universal Clipboard */}
              <div className="space-y-2 pb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <M3ClipboardIcon className="w-3.5 h-3.5 text-[#10B981]" filled />
                    <h4 className="font-display text-xs font-bold text-[#0F1115] dark:text-white tracking-tight">
                      Live Clipboard
                    </h4>
                  </div>
                  <button
                    onClick={() => handleTabChange('clipboard')}
                    className="apple-press text-[11px] font-semibold text-[#0071E3] dark:text-[#C6F432] hover:underline flex items-center gap-1"
                  >
                    <span>History</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                {clipboardItems.length > 0 ? (
                  <div className="p-2.5 rounded-xl bg-white dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between gap-2 shadow-xs">
                    <p className="text-xs text-[#0F1115] dark:text-white truncate font-mono flex-1">
                      {clipboardItems[0].text}
                    </p>
                    <button
                      onClick={async () => {
                        const { copyToClipboard } = await import('./utils/clipboard');
                        const ok = await copyToClipboard(clipboardItems[0].text);
                        if (ok) showToast('Copied to clipboard');
                      }}
                      className="apple-press px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-[#C6F432] dark:hover:bg-[#B5E22B] dark:text-[#0A0D14] shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] py-1 text-center font-sans">
                    Clipboard synced across devices
                  </p>
                )}
              </div>

              {/* Quick Peer Beam */}
              <div className="space-y-2.5 pb-3 border-b border-black/[0.06] dark:border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <M3ChatIcon className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#38BDF8]" filled />
                    <h4 className="font-display text-xs font-bold text-[#0F1115] dark:text-white tracking-tight">
                      Quick Peer Beam
                    </h4>
                  </div>
                  <button
                    onClick={() => handleTabChange('chat')}
                    className="apple-press text-[11px] font-semibold text-[#0071E3] dark:text-[#38BDF8] hover:underline flex items-center gap-1"
                  >
                    <span>Full Chat</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {chatMessages.length === 0 ? (
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] py-2 text-center">
                      Beam a message, code snippet, or link below.
                    </p>
                  ) : (
                    chatMessages.slice(-2).map((msg) => {
                      const isMe = msg.fromId === myDeviceId || (msg.from && msg.from.toLowerCase() === deviceName.toLowerCase());
                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <div className={`px-2.5 py-1.5 rounded-xl text-xs max-w-[90%] break-words ${isMe
                            ? 'bg-[#0F1115] text-white font-medium dark:bg-[#C6F432] dark:text-[#0A0D14] dark:font-bold'
                            : 'bg-black/[0.05] text-[#0F1115] dark:bg-white/[0.08] dark:text-white'
                            }`}>
                            {msg.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const input = (e.currentTarget.elements.namedItem('quickMsg') as HTMLInputElement);
                    if (input && input.value.trim()) {
                      sendChatMessage(input.value.trim());
                      input.value = '';
                    }
                  }}
                  className="flex items-center gap-2 pt-1"
                >
                  <input
                    name="quickMsg"
                    type="text"
                    placeholder="Type note or link to beam..."
                    className="flex-1 bg-white dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] rounded-xl px-3 py-1.5 text-xs text-[#0F1115] dark:text-white placeholder-[#64748B] dark:placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#0071E3] dark:focus:ring-[#C6F432]"
                  />
                  <button
                    type="submit"
                    className="apple-press p-2 rounded-xl bg-[#0F1115] hover:bg-black text-white dark:bg-[#C6F432] dark:text-[#0A0D14] font-bold shadow-sm shrink-0"
                  >
                    <M3SendIcon className="w-3.5 h-3.5 text-white dark:text-[#0A0D14]" />
                  </button>
                </form>
              </div>

              {/* Remote Sound Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => ringDevice('android')}
                  className="apple-press flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981]/10 dark:bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/20 dark:border-[#10B981]/30 hover:bg-[#10B981]/15 dark:hover:bg-[#10B981]/25 transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Ring Phone</span>
                </button>

                <button
                  onClick={pingMac}
                  className="apple-press flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#0071E3]/10 dark:bg-[#C6F432]/15 text-[#0071E3] dark:text-[#C6F432] border border-[#0071E3]/20 dark:border-[#C6F432]/30 hover:bg-[#0071E3]/15 dark:hover:bg-[#C6F432]/25 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Ping Mac</span>
                </button>
              </div>
            </div>
          }
        />
      </motion.div>
    )}

    {activeTab === 'clipboard' && (
      <motion.div
        key="clipboard"
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <UniversalClipboard
          items={clipboardItems}
          onSendClipboard={sendClipboard}
          onClearClipboard={clearClipboard}
          isAndroid={isAndroid}
          isMac={isMac}
          showToast={showToast}
        />
      </motion.div>
    )}

    {activeTab === 'chat' && (
      <motion.div
        key="chat"
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
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
        />
      </motion.div>
    )}

    {activeTab === 'tools' && (
      <motion.div
        key="tools"
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <DeviceRemoteTools
          devices={cleanDevices}
          chatMessages={chatMessages}
          onRingPhone={() => ringDevice('android')}
          onPingMac={pingMac}
          onSendMessage={sendChatMessage}
          onOpenChat={() => handleTabChange('chat')}
          showToast={showToast}
        />
      </motion.div>
    )}
  </AnimatePresence>
      </main >

  {/* Modals */ }
  < DevicePairingQR
isOpen = { isQrOpen }
onClose = {() => setIsQrOpen(false)}
serverInfo = { serverInfo }
devices = { cleanDevices }
myDeviceId = { myDeviceId }
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
        isOpen={isRinging}
        ringSource={ringSource}
        onDismiss={dismissRing}
      />
    </div >
  );
};
export default App;
