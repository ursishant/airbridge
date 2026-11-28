import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  Command,
  ChevronDown,
  Pencil,
  Upload,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  Volume2,
  Zap,
  Copy,
  Users,
  X,
  Sliders,
  Sparkles,
  UserMinus,
  Minus,
  Plus,
  Lock,
} from 'lucide-react';
import type { ConnectedDevice, ServerInfo, ClipboardItem, RoomSettings } from '../hooks/useWebSocket';
import type { ToastInfo } from './DynamicIsland';
import {
  M3AirDropIcon,
  M3QrCodeIcon,
  M3SunIcon,
  M3MoonIcon,
  M3ClipboardIcon,
  M3ChatIcon,
  M3ToolsIcon,
  M3ShieldLockIcon,
  M3BatteryPill,
} from './M3Icons';
import { AirBridgeEmblem } from './AirBridgeLogo';
import { DeviceOsIcon, getHostLabel } from './DeviceOsIcon';
import { copyToClipboard } from '../utils/clipboard';

export type TabType = 'files' | 'clipboard' | 'chat' | 'tools';
export type AccentPreset = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose';

export interface UiPreferences {
  accentColor: AccentPreset;
  confettiEnabled: boolean;
  soundEnabled: boolean;
  compactStage: boolean;
}

export const ACCENT_PRESETS: Record<AccentPreset, { label: string; hex: string; darkHex: string; soft: string }> = {
  blue: { label: 'Sky Blue', hex: '#3B82F6', darkHex: '#60A5FA', soft: 'rgba(59, 130, 246, 0.10)' },
  emerald: { label: 'Emerald', hex: '#10B981', darkHex: '#34D399', soft: 'rgba(16, 185, 129, 0.10)' },
  violet: { label: 'Violet', hex: '#8B5CF6', darkHex: '#A78BFA', soft: 'rgba(139, 92, 246, 0.10)' },
  amber: { label: 'Amber', hex: '#F59E0B', darkHex: '#FBBF24', soft: 'rgba(245, 158, 11, 0.10)' },
  rose: { label: 'Rose', hex: '#F43F5E', darkHex: '#FB7185', soft: 'rgba(244, 63, 94, 0.10)' },
};

interface HeaderProps {
  isConnected: boolean;
  devices: ConnectedDevice[];
  myDeviceId?: string;
  serverInfo: ServerInfo | null;
  deviceName: string;
  isAndroid: boolean;
  isMac: boolean;
  isWindows?: boolean;
  officeSecurityEnabled?: boolean;
  officePin?: string;
  roomSettings: RoomSettings;
  uiPrefs: UiPreferences;
  onUpdateUiPrefs: (patch: Partial<UiPreferences>) => void;
  onUpdateRoomSettings: (patch: Partial<RoomSettings>) => Promise<boolean>;
  onKickDevice?: (deviceId: string) => Promise<boolean>;
  theme: 'dark' | 'light';
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
  chatCount?: number;
  clipboardCount?: number;
  latestClipboard?: ClipboardItem | null;
  isTransferring?: boolean;
  transferProgress?: number;
  transferFileName?: string;
  transferSpeedMBs?: number;
  activeToast?: ToastInfo | string | null;
  onToggleTheme: () => void;
  onOpenQR: () => void;
  onOpenOnTheGo: () => void;
  onOpenSecuritySettings?: () => void;
  onOpenCommandPalette?: () => void;
  onUpdateName: (name: string) => void;
  onRingPhone: () => void;
  onPingMac: () => void;
  onShowToast?: (msg: string, type?: ToastInfo['type']) => void;
}

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  devices,
  myDeviceId = '',
  serverInfo,
  deviceName,
  theme,
  officeSecurityEnabled = false,
  officePin = '',
  roomSettings,
  uiPrefs,
  onUpdateUiPrefs,
  onUpdateRoomSettings,
  onKickDevice,
  activeTab = 'files',
  onTabChange,
  chatCount = 0,
  clipboardCount = 0,
  latestClipboard = null,
  isTransferring = false,
  transferProgress = 0,
  transferFileName,
  transferSpeedMBs,
  activeToast = null,
  onToggleTheme,
  onOpenQR,
  onOpenSecuritySettings,
  onOpenCommandPalette,
  onUpdateName,
  onRingPhone,
  onPingMac,
  onShowToast,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [islandTab, setIslandTab] = useState<'overview' | 'room' | 'customize'>('overview');
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(deviceName);
  const [tempRoomName, setTempRoomName] = useState(roomSettings.roomName || 'AirBridge Room');
  const [tempMaxLimit, setTempMaxLimit] = useState<string>(String(roomSettings.maxParticipants || 0));
  const [showIslandQr, setShowIslandQr] = useState(false);
  const [copiedClip, setCopiedClip] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [savingRoom, setSavingRoom] = useState(false);

  const isDark = theme === 'dark';
  const isHost = Boolean(serverInfo?.isHost);
  const hostLabel = getHostLabel(serverInfo);
  const otherDevices = devices.filter((d) => d.id !== myDeviceId);
  const totalOnline = Math.max(devices.length, isConnected ? 1 : 0);
  const maxLimit = Number(roomSettings?.maxParticipants) || 0;

  useEffect(() => {
    setTempRoomName(roomSettings.roomName || 'AirBridge Room');
    setTempMaxLimit(String(roomSettings.maxParticipants || 0));
  }, [roomSettings.roomName, roomSettings.maxParticipants]);

  const rawPairingUrl = serverInfo
    ? `http://${serverInfo.primaryIp}:${serverInfo.port}`
    : typeof window !== 'undefined'
    ? window.location.origin
    : '';

  const pairingUrl =
    officeSecurityEnabled && officePin
      ? `${rawPairingUrl}/?pin=${encodeURIComponent(officePin)}`
      : rawPairingUrl;

  useEffect(() => {
    if (!isExpanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
        setIsEditingName(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isExpanded]);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      onUpdateName(tempName.trim());
      setIsEditingName(false);
    }
  };

  const handleApplyRoomLimit = async (nextLimit: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(nextLimit)));
    setTempMaxLimit(String(clamped));
    setSavingRoom(true);
    try {
      await onUpdateRoomSettings({ maxParticipants: clamped });
    } finally {
      setSavingRoom(false);
    }
  };

  const handleSaveRoomName = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tempRoomName.trim();
    if (!clean) return;
    setSavingRoom(true);
    try {
      await onUpdateRoomSettings({ roomName: clean });
    } finally {
      setSavingRoom(false);
    }
  };

  const handleCopyLatestClip = async () => {
    if (!latestClipboard?.text) return;
    const ok = await copyToClipboard(latestClipboard.text);
    if (ok) {
      setCopiedClip(true);
      onShowToast?.('Copied to clipboard', 'success');
      setTimeout(() => setCopiedClip(false), 1800);
    }
  };

  const handleCopyPairingUrl = async () => {
    if (!pairingUrl) return;
    const ok = await copyToClipboard(pairingUrl);
    if (ok) {
      setCopiedUrl(true);
      onShowToast?.('Copied pairing link', 'success');
      setTimeout(() => setCopiedUrl(false), 1800);
    }
  };

  const toast: ToastInfo | null =
    typeof activeToast === 'string'
      ? {
          message: activeToast,
          type: /fail|error|denied|reject|timed out|abort|full/i.test(activeToast)
            ? 'error'
            : /success|beamed|synced|uploaded|unlocked|installed|received|copied|saved/i.test(activeToast)
            ? 'success'
            : /warning|incorrect|disconnected|caution|removed/i.test(activeToast)
            ? 'warning'
            : 'info',
        }
      : activeToast;

  const toastIcon = {
    error: <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />,
    success: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />,
    warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
    info: <Info className="w-3.5 h-3.5 text-sky-500 shrink-0" />,
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'files', label: 'Transfer', icon: <M3AirDropIcon className="w-3.5 h-3.5" filled={activeTab === 'files'} /> },
    {
      id: 'clipboard',
      label: 'Clipboard',
      icon: <M3ClipboardIcon className="w-3.5 h-3.5" filled={activeTab === 'clipboard'} />,
      badge: clipboardCount,
    },
    { id: 'chat', label: 'Chat', icon: <M3ChatIcon className="w-3.5 h-3.5" filled={activeTab === 'chat'} />, badge: chatCount },
    { id: 'tools', label: 'Tools', icon: <M3ToolsIcon className="w-3.5 h-3.5" filled={activeTab === 'tools'} /> },
  ];

  const hasLiveActivity = isTransferring || (!!toast && !isExpanded);
  const brandTitle =
    roomSettings?.roomName && roomSettings.roomName !== 'AirBridge Room' ? roomSettings.roomName : 'AirBridge';

  const statusText = !isConnected
    ? '...'
    : maxLimit > 0
    ? `${totalOnline}/${maxLimit}`
    : otherDevices.length > 0
    ? `${totalOnline}`
    : 'Ready';

  // Theme-adaptive Dynamic Island tokens (Light surface in Light Mode, Obsidian in Dark Mode)
  const islandText = isDark ? 'text-white' : 'text-[#111827]';
  const islandMuted = isDark ? 'text-zinc-400' : 'text-gray-500';
  const islandDivider = isDark ? 'bg-white/10' : 'bg-black/10';
  const islandPillActive = isDark ? 'bg-white text-[#0B0B0E]' : 'bg-[#111827] text-white';
  const islandSoftBg = isDark ? 'bg-white/[0.06]' : 'bg-black/[0.04]';
  const islandHoverBg = isDark ? 'hover:bg-white/[0.12]' : 'hover:bg-black/[0.08]';
  const islandBorder = isDark ? 'border-white/[0.08]' : 'border-black/[0.08]';
  const islandCard = isDark ? 'bg-white/[0.04] border-white/[0.07]' : 'bg-black/[0.025] border-black/[0.07]';
  const islandInput = isDark
    ? 'bg-white/[0.07] border-white/10 text-white placeholder-zinc-500 focus:border-white/30'
    : 'bg-white border-black/10 text-[#111827] placeholder-gray-400 focus:border-black/30';

  return (
    <>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="island-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={() => {
              setIsExpanded(false);
              setIsEditingName(false);
            }}
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[3px]"
          />
        )}
      </AnimatePresence>

      {/* Floating Dynamic Island (Theme-Adaptive: Light in Light Mode, Obsidian in Dark Mode) */}
      <div className="fixed top-3 inset-x-0 z-40 flex justify-center pointer-events-none px-3 sm:px-4">
        <motion.div
          initial={false}
          animate={{
            borderRadius: isExpanded ? 26 : 21,
            boxShadow: isExpanded
              ? isDark
                ? '0 24px 60px -12px rgba(0, 0, 0, 0.55)'
                : '0 24px 55px -12px rgba(15, 23, 42, 0.18)'
              : isDark
              ? '0 10px 28px -8px rgba(0, 0, 0, 0.4)'
              : '0 10px 28px -8px rgba(15, 23, 42, 0.12)',
          }}
          transition={{ type: 'spring', stiffness: 460, damping: 34, mass: 0.8 }}
          className={`pointer-events-auto overflow-hidden select-none border ${islandText} ${
            isExpanded
              ? 'w-full max-w-[680px]'
              : 'w-auto md:w-[680px] max-w-[calc(100vw-24px)]'
          }`}
          style={{
            background: isDark ? 'rgba(22, 22, 27, 0.97)' : 'rgba(255, 255, 255, 0.97)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.1)',
            willChange: 'transform, border-radius',
          }}
        >
          {/* ─── Compact Dynamic Island Capsule Row ─── */}
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 sm:px-2.5">
            {/* Left: Brand / Room Identity + Live Occupancy Pill */}
            <button
              type="button"
              onClick={() => setIsExpanded((p) => !p)}
              className={`apple-press flex items-center gap-2 pr-1.5 py-0.5 rounded-full transition-colors shrink-0 min-w-0 ${islandHoverBg}`}
              title={isExpanded ? 'Collapse Dynamic Island' : 'Expand Dynamic Island'}
            >
              <span className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shrink-0 ${islandPillActive}`}>
                <AirBridgeEmblem className="w-3.5 h-3.5" />
              </span>
              <span className="font-display font-bold text-xs tracking-tight truncate max-w-[88px] sm:max-w-[130px]">
                {brandTitle}
              </span>
              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono shrink-0 ${islandSoftBg}`}>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    !isConnected
                      ? 'bg-amber-400'
                      : maxLimit > 0 && totalOnline >= maxLimit
                      ? 'bg-amber-400'
                      : 'bg-emerald-500'
                  }`}
                />
                <span className={isConnected ? 'text-emerald-500 font-semibold' : 'text-amber-500'}>
                  {statusText}
                </span>
              </span>
            </button>

            {/* Center: Desktop Navigation Pills */}
            {onTabChange && (
              <>
                <span className={`hidden md:block w-px h-4 shrink-0 ${islandDivider}`} />
                <nav className="hidden md:flex items-center gap-0.5 shrink-0">
                  {tabs.map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => onTabChange(tab.id)}
                        className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] transition-colors shrink-0 ${
                          active
                            ? isDark
                              ? 'text-[#0B0B0E] font-semibold'
                              : 'text-white font-semibold'
                            : `${islandMuted} font-medium`
                        }`}
                      >
                        {active && (
                          <motion.div
                            layoutId="islandTabPill"
                            className={`absolute inset-0 rounded-full ${isDark ? 'bg-white' : 'bg-[#111827]'}`}
                            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                          />
                        )}
                        <span className="relative z-10 flex items-center gap-1.5">
                          {tab.icon}
                          <span>{tab.label}</span>
                          {tab.badge && tab.badge > 0 ? (
                            <span
                              className={`inline-flex items-center justify-center text-[9px] px-1.5 py-0.5 leading-none rounded-full font-mono tabular-nums ${
                                active
                                  ? isDark
                                    ? 'bg-black/10 text-[#0B0B0E]'
                                    : 'bg-white/20 text-white'
                                  : isDark
                                  ? 'bg-white/10 text-zinc-300'
                                  : 'bg-black/[0.06] text-gray-600'
                              }`}
                            >
                              {tab.badge}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </nav>
                <span className={`hidden md:block w-px h-4 shrink-0 ${islandDivider}`} />
              </>
            )}

            {/* Right: Security + Pair + Expand Dynamic Island */}
            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenSecuritySettings && officeSecurityEnabled && (
                <button
                  type="button"
                  onClick={onOpenSecuritySettings}
                  className="apple-press w-7 h-7 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center border border-emerald-500/25 shrink-0"
                  title={`Room PIN Active: ${officePin}`}
                >
                  <M3ShieldLockIcon className="w-3.5 h-3.5" filled />
                </button>
              )}

              <button
                type="button"
                onClick={onOpenQR}
                className={`apple-press inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold shrink-0 ${islandPillActive}`}
                title="Pair Device via QR"
              >
                <M3QrCodeIcon className="w-3 h-3" />
                <span>Pair</span>
              </button>

              <button
                type="button"
                onClick={() => setIsExpanded((p) => !p)}
                className={`apple-press w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 ${islandSoftBg} ${islandHoverBg} ${islandMuted}`}
                aria-label={isExpanded ? 'Collapse Dynamic Island' : 'Expand Dynamic Island'}
                title={isExpanded ? 'Collapse' : 'Expand Dynamic Island'}
              >
                <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.18 }}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </motion.div>
              </button>
            </div>
          </div>

          {/* ─── Live Activity Strip ─── */}
          <AnimatePresence initial={false}>
            {hasLiveActivity && (
              <motion.div
                key="island-live-activity"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className={`overflow-hidden border-t ${islandBorder}`}
              >
                {isTransferring ? (
                  <div className="px-4 py-2 space-y-1">
                    <div className="flex items-center justify-between gap-2.5 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative w-4 h-4 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 -rotate-90">
                            <circle
                              cx="8"
                              cy="8"
                              r="6"
                              stroke={isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)'}
                              strokeWidth="2"
                              fill="none"
                            />
                            <circle
                              cx="8"
                              cy="8"
                              r="6"
                              stroke="var(--accent)"
                              strokeWidth="2"
                              fill="none"
                              strokeDasharray={37.7}
                              strokeDashoffset={37.7 - (37.7 * transferProgress) / 100}
                              strokeLinecap="round"
                            />
                          </svg>
                          <Upload className="w-2 h-2 absolute" />
                        </div>
                        <span className="font-medium truncate max-w-[180px] sm:max-w-[300px]">
                          {transferFileName || 'Sending files...'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[11px] shrink-0 tabular-nums">
                        {transferSpeedMBs !== undefined && transferSpeedMBs > 0 && (
                          <span className="text-emerald-500">{transferSpeedMBs} MB/s</span>
                        )}
                        <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                          {transferProgress}%
                        </span>
                      </div>
                    </div>
                  </div>
                ) : toast ? (
                  <div className="px-4 py-2 flex items-center justify-center gap-2 text-xs">
                    {toastIcon[toast.type]}
                    <span className="font-medium truncate">{toast.message}</span>
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Expanded Dynamic Island Panel ─── */}
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                key="island-expanded-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{
                  height: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
                  opacity: { duration: 0.16, ease: 'easeOut' },
                }}
                className={`overflow-hidden border-t ${islandBorder}`}
              >
                <div className="p-4 space-y-4">
                  {/* Dynamic Island Sub-Tabs */}
                  <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                    <div
                      className={`flex items-center gap-0.5 sm:gap-1 p-0.5 rounded-full border overflow-x-auto scrollbar-none max-w-full ${islandSoftBg} ${islandBorder}`}
                    >
                      {(
                        [
                          { id: 'overview', label: 'Overview', icon: <Users className="w-3 h-3 shrink-0" /> },
                          { id: 'room', label: 'Room & Limit', icon: <Sliders className="w-3 h-3 shrink-0" /> },
                          { id: 'customize', label: 'Customize', icon: <Sparkles className="w-3 h-3 shrink-0" /> },
                        ] as const
                      ).map((t) => {
                        const active = islandTab === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setIslandTab(t.id)}
                            className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[11px] font-medium transition-colors shrink-0 ${
                              active
                                ? isDark
                                  ? 'text-[#0B0B0E] font-semibold'
                                  : 'text-white font-semibold'
                                : islandMuted
                            }`}
                          >
                            {active && (
                              <motion.div
                                layoutId="islandSubTabPill"
                                className={`absolute inset-0 rounded-full ${isDark ? 'bg-white' : 'bg-[#111827]'}`}
                                transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                              />
                            )}
                            <span className="relative z-10 flex items-center gap-1.5">
                              {t.icon}
                              <span>{t.label}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onOpenCommandPalette && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsExpanded(false);
                            onOpenCommandPalette();
                          }}
                          className={`apple-press hidden sm:inline-flex h-7 px-2.5 rounded-full text-[10px] font-mono items-center gap-1 ${islandSoftBg} ${islandHoverBg}`}
                          title="Command Palette (⌘K)"
                        >
                          <Command className="w-3 h-3" />
                          <span>K</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={onToggleTheme}
                        className={`apple-press w-7 h-7 rounded-full flex items-center justify-center ${islandSoftBg} ${islandHoverBg}`}
                        title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
                        aria-label="Toggle color theme"
                      >
                        {isDark ? (
                          <M3SunIcon className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <M3MoonIcon className="w-3.5 h-3.5 text-[#111827]" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* TAB 1: OVERVIEW */}
                  {islandTab === 'overview' && (
                    <motion.div
                      key="island-tab-overview"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.14, ease: 'easeOut' }}
                      className="space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {isEditingName ? (
                            <form onSubmit={handleSaveName} className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                                className={`border rounded-lg px-2.5 py-1 text-xs focus:outline-none w-36 ${islandInput}`}
                                autoFocus
                              />
                              <button type="submit" className={`p-1.5 rounded-lg ${islandPillActive}`} title="Save">
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsEditingName(false)}
                                className={`p-1.5 rounded-lg ${islandSoftBg} ${islandMuted}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-display text-sm font-bold truncate">{deviceName}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setTempName(deviceName);
                                  setIsEditingName(true);
                                }}
                                className={`p-1 rounded-md transition-colors ${islandMuted} ${islandHoverBg}`}
                                title="Rename device"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              {isHost && (
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${islandSoftBg} ${islandMuted}`}>
                                  HOST
                                </span>
                              )}
                            </div>
                          )}
                          <p className={`text-[11px] font-mono truncate mt-0.5 ${islandMuted}`}>
                            {serverInfo?.primaryIp ? `${serverInfo.primaryIp}:${serverInfo.port}` : 'Local LAN Ready'}
                            {maxLimit > 0 ? ` · ${totalOnline}/${maxLimit} in room` : ` · ${totalOnline} online`}
                          </p>
                        </div>

                        {onOpenSecuritySettings && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsExpanded(false);
                              onOpenSecuritySettings();
                            }}
                            className={`apple-press h-8 px-3 rounded-full text-[11px] font-medium inline-flex items-center gap-1.5 border transition-colors ${
                              officeSecurityEnabled
                                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                                : `${islandSoftBg} ${islandHoverBg} ${islandBorder}`
                            }`}
                          >
                            <M3ShieldLockIcon className="w-3.5 h-3.5" filled={officeSecurityEnabled} />
                            <span className="font-mono">{officeSecurityEnabled ? `PIN ${officePin}` : 'Security'}</span>
                          </button>
                        )}
                      </div>

                      {/* Peers & Hardware */}
                      <div className={`rounded-2xl border p-3 space-y-2.5 ${islandCard}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className={`text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 ${islandMuted}`}>
                            <Users className="w-3 h-3 text-sky-500 shrink-0" />
                            <span>
                              {otherDevices.length > 0 ? `Peers (${otherDevices.length})` : 'Hardware & Pairing'}
                            </span>
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onRingPhone();
                                onShowToast?.('Ringing paired phones...', 'info');
                              }}
                              className={`apple-press h-7 px-2.5 rounded-full text-[11px] font-medium text-emerald-500 inline-flex items-center gap-1.5 ${islandSoftBg} ${islandHoverBg}`}
                            >
                              <Volume2 className="w-3 h-3 shrink-0" />
                              <span>Ring</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                onPingMac();
                                onShowToast?.(`Pinged ${hostLabel}`, 'info');
                              }}
                              className={`apple-press h-7 px-2.5 rounded-full text-[11px] font-medium text-sky-500 inline-flex items-center gap-1.5 ${islandSoftBg} ${islandHoverBg}`}
                            >
                              <Zap className="w-3 h-3 shrink-0" />
                              <span>Ping {hostLabel}</span>
                            </button>
                          </div>
                        </div>

                        {otherDevices.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-0.5">
                            {otherDevices.map((dev) => (
                              <div
                                key={dev.id}
                                className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border ${islandCard}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <DeviceOsIcon os={dev.os} className="w-4 h-4 shrink-0" active />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold truncate">{dev.name}</p>
                                    <p className={`text-[10px] font-mono ${islandMuted}`}>{dev.os}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {dev.battery && <M3BatteryPill level={dev.battery.level} charging={dev.battery.charging} />}
                                  {isHost && onKickDevice && (
                                    <button
                                      type="button"
                                      onClick={() => onKickDevice(dev.id)}
                                      className={`p-1 rounded-md hover:text-rose-500 hover:bg-rose-500/10 transition-colors ${islandMuted}`}
                                      title={`Remove ${dev.name} from room`}
                                    >
                                      <UserMinus className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 pt-0.5">
                            <p className={`text-xs truncate ${islandMuted}`}>
                              Open <span className={`font-mono font-medium ${islandText}`}>{rawPairingUrl.replace(/^https?:\/\//, '')}</span>
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowIslandQr((q) => !q)}
                              className={`apple-press h-7 px-2.5 rounded-full text-[11px] font-medium shrink-0 inline-flex items-center ${islandSoftBg} ${islandHoverBg}`}
                            >
                              {showIslandQr ? 'Hide QR' : 'Quick QR'}
                            </button>
                          </div>
                        )}

                        <AnimatePresence>
                          {showIslandQr && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.16 }}
                              className="overflow-hidden"
                            >
                              <div className={`pt-2 border-t flex flex-col sm:flex-row items-center gap-3.5 ${islandBorder}`}>
                                <div className="p-2 bg-white rounded-xl border border-black/10 shrink-0">
                                  <QRCodeSVG value={pairingUrl} size={92} level="M" />
                                </div>
                                <div className="space-y-1.5 text-center sm:text-left min-w-0 flex-1">
                                  <p className="text-xs font-semibold">Scan to join room</p>
                                  <p className="text-[11px] font-mono text-sky-500 truncate">{pairingUrl}</p>
                                  <button
                                    type="button"
                                    onClick={handleCopyPairingUrl}
                                    className={`apple-press inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] ${islandSoftBg} ${islandHoverBg}`}
                                  >
                                    {copiedUrl ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                    <span>{copiedUrl ? 'Copied' : 'Copy URL'}</span>
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Latest Clipboard */}
                      {latestClipboard && (
                        <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border ${islandCard}`}>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <M3ClipboardIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" filled />
                            <span className="text-xs font-mono truncate">{latestClipboard.text}</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyLatestClip}
                            className={`apple-press h-7 px-2.5 rounded-full text-[11px] font-semibold shrink-0 inline-flex items-center gap-1 ${islandPillActive}`}
                          >
                            {copiedClip ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedClip ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* TAB 2: ROOM & LIMIT */}
                  {islandTab === 'room' && (
                    <motion.div
                      key="island-tab-room"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.14, ease: 'easeOut' }}
                      className="space-y-3"
                    >
                      <div className={`rounded-2xl border p-3.5 space-y-3 ${islandCard}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-mono uppercase tracking-wider ${islandMuted}`}>
                            Room Name &amp; Capacity
                          </span>
                          <span className="text-[11px] font-mono text-emerald-500 font-semibold tabular-nums">
                            {maxLimit > 0 ? `${totalOnline} / ${maxLimit} People` : `${totalOnline} Joined · Unlimited`}
                          </span>
                        </div>

                        {maxLimit > 0 && (
                          <div className={`w-full h-1.5 rounded-full overflow-hidden ${islandSoftBg}`}>
                            <motion.div
                              className="h-full rounded-full"
                              animate={{
                                width: `${Math.min(100, Math.round((totalOnline / maxLimit) * 100))}%`,
                                backgroundColor: totalOnline >= maxLimit ? '#F59E0B' : 'var(--accent)',
                              }}
                              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                            />
                          </div>
                        )}

                        {isHost ? (
                          <>
                            <form onSubmit={handleSaveRoomName} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={tempRoomName}
                                onChange={(e) => setTempRoomName(e.target.value)}
                                maxLength={40}
                                placeholder="Room name..."
                                className={`flex-1 border rounded-xl px-3 h-8 text-xs focus:outline-none ${islandInput}`}
                              />
                              <button
                                type="submit"
                                disabled={savingRoom || !tempRoomName.trim()}
                                className={`apple-press h-8 px-3 rounded-xl text-xs font-semibold disabled:opacity-40 shrink-0 ${islandPillActive}`}
                              >
                                Save Name
                              </button>
                            </form>

                            <div className="pt-1 space-y-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <span className={`text-xs font-medium ${islandMuted}`}>People Limit</span>
                                <div className={`inline-flex items-center p-0.5 rounded-xl border ${islandSoftBg} ${islandBorder}`}>
                                  <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.86 }}
                                    transition={{ type: 'spring', stiffness: 600, damping: 25 }}
                                    disabled={savingRoom || maxLimit <= 0}
                                    onClick={() => handleApplyRoomLimit(Math.max(0, maxLimit - 1))}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 transition-colors ${islandHoverBg}`}
                                    aria-label="Decrease limit"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </motion.button>

                                  <motion.div
                                    key={tempMaxLimit}
                                    initial={{ scale: 0.92, opacity: 0.7 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                                    className="flex items-center justify-center"
                                  >
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={tempMaxLimit}
                                      onChange={(e) => setTempMaxLimit(e.target.value)}
                                      onBlur={() => {
                                        const n = parseInt(tempMaxLimit, 10);
                                        if (!isNaN(n) && n !== maxLimit) handleApplyRoomLimit(n);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          const n = parseInt(tempMaxLimit, 10);
                                          if (!isNaN(n)) handleApplyRoomLimit(n);
                                        }
                                      }}
                                      className="w-12 h-7 text-center bg-transparent text-xs font-mono font-semibold tabular-nums focus:outline-none p-0"
                                      aria-label="Room people limit"
                                    />
                                  </motion.div>

                                  <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.86 }}
                                    transition={{ type: 'spring', stiffness: 600, damping: 25 }}
                                    disabled={savingRoom || maxLimit >= 100}
                                    onClick={() => handleApplyRoomLimit(maxLimit + 1)}
                                    className={`w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 transition-colors ${islandHoverBg}`}
                                    aria-label="Increase limit"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </motion.button>
                                </div>
                              </div>

                              <div className={`flex flex-wrap items-center gap-1 p-0.5 rounded-full border w-fit ${islandSoftBg} ${islandBorder}`}>
                                {[
                                  { label: 'Unlimited', val: 0 },
                                  { label: '2', val: 2 },
                                  { label: '5', val: 5 },
                                  { label: '10', val: 10 },
                                  { label: '20', val: 20 },
                                ].map((preset) => {
                                  const active = maxLimit === preset.val;
                                  return (
                                    <button
                                      key={preset.val}
                                      type="button"
                                      disabled={savingRoom}
                                      onClick={() => handleApplyRoomLimit(preset.val)}
                                      className={`relative px-2.5 py-1 rounded-full text-[11px] font-mono transition-colors ${
                                        active
                                          ? isDark
                                            ? 'text-[#0B0B0E] font-semibold'
                                            : 'text-white font-semibold'
                                          : islandMuted
                                      }`}
                                    >
                                      {active && (
                                        <motion.div
                                          layoutId="roomLimitPresetPill"
                                          className={`absolute inset-0 rounded-full ${isDark ? 'bg-white' : 'bg-[#111827]'}`}
                                          transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                                        />
                                      )}
                                      <span className="relative z-10">{preset.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className={`flex items-center gap-2 text-xs ${islandMuted}`}>
                            <Lock className="w-3.5 h-3.5 shrink-0" />
                            <span>Only the room host can change room capacity &amp; permissions.</span>
                          </div>
                        )}
                      </div>

                      {/* Room Permissions with pure GPU translateX Spring Toggles */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(
                          [
                            { key: 'allowUploads', label: 'File Uploads', val: roomSettings.allowUploads },
                            { key: 'allowClipboard', label: 'Clipboard Sync', val: roomSettings.allowClipboard },
                            { key: 'allowChat', label: 'Peer Chat', val: roomSettings.allowChat },
                          ] as const
                        ).map((perm) => (
                          <button
                            key={perm.key}
                            type="button"
                            disabled={!isHost || savingRoom}
                            onClick={() => onUpdateRoomSettings({ [perm.key]: !perm.val })}
                            className={`apple-press p-2.5 rounded-xl border text-left transition-colors disabled:opacity-60 flex items-center justify-between gap-2 ${
                              perm.val
                                ? 'bg-emerald-500/10 border-emerald-500/30'
                                : `${islandCard} ${islandMuted}`
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="text-[11px] font-semibold block truncate">{perm.label}</span>
                              <span className="text-[10px] font-mono opacity-75 block">
                                {perm.val ? 'Allowed' : 'Paused'}
                              </span>
                            </div>
                            <span
                              className={`w-7 h-4 rounded-full p-0.5 flex items-center transition-colors duration-150 shrink-0 ${
                                perm.val ? 'bg-emerald-500' : isDark ? 'bg-white/15' : 'bg-black/15'
                              }`}
                            >
                              <motion.span
                                initial={false}
                                animate={{ x: perm.val ? 12 : 0 }}
                                transition={{ type: 'spring', stiffness: 550, damping: 32 }}
                                className="w-3 h-3 rounded-full bg-white shadow-sm block"
                              />
                            </span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* TAB 3: CUSTOMIZE */}
                  {islandTab === 'customize' && (
                    <motion.div
                      key="island-tab-customize"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.14, ease: 'easeOut' }}
                      className="space-y-3"
                    >
                      <div className={`rounded-2xl border p-3.5 space-y-2.5 ${islandCard}`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-mono uppercase tracking-wider ${islandMuted}`}>
                            Accent Color
                          </span>
                          <span className={`text-[11px] font-mono ${islandMuted}`}>
                            {ACCENT_PRESETS[uiPrefs.accentColor].label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {(Object.keys(ACCENT_PRESETS) as AccentPreset[]).map((key) => {
                            const preset = ACCENT_PRESETS[key];
                            const active = uiPrefs.accentColor === key;
                            return (
                              <motion.button
                                key={key}
                                type="button"
                                whileTap={{ scale: 0.9 }}
                                onClick={() => onUpdateUiPrefs({ accentColor: key })}
                                className="relative w-8 h-8 rounded-full flex items-center justify-center"
                                style={{ background: preset.hex }}
                                title={preset.label}
                              >
                                {active && (
                                  <motion.span
                                    layoutId="accentColorRing"
                                    className={`absolute -inset-1 rounded-full border-2 pointer-events-none ${
                                      isDark ? 'border-white' : 'border-[#111827]'
                                    }`}
                                    transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                                  />
                                )}
                                {active && <Check className="w-3.5 h-3.5 text-white relative z-10" />}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.97 }}
                          onClick={onToggleTheme}
                          className={`p-2.5 rounded-xl border text-left transition-colors ${islandCard} ${islandHoverBg}`}
                        >
                          <span className="text-[11px] font-semibold block">Theme</span>
                          <span className={`text-[10px] font-mono ${islandMuted}`}>{isDark ? 'Dark' : 'Light'}</span>
                        </motion.button>

                        {(
                          [
                            { key: 'confettiEnabled', label: 'Confetti', onLabel: 'On', offLabel: 'Off', val: uiPrefs.confettiEnabled },
                            { key: 'soundEnabled', label: 'Alert Sounds', onLabel: 'On', offLabel: 'Muted', val: uiPrefs.soundEnabled },
                            { key: 'compactStage', label: 'Drop Zone', onLabel: 'Compact', offLabel: 'Spacious', val: uiPrefs.compactStage },
                          ] as const
                        ).map((pref) => (
                          <motion.button
                            key={pref.key}
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => onUpdateUiPrefs({ [pref.key]: !pref.val })}
                            className={`p-2.5 rounded-xl border text-left transition-colors ${
                              pref.val
                                ? isDark
                                  ? 'bg-white/[0.08] border-white/20'
                                  : 'bg-black/[0.06] border-black/15'
                                : `${islandCard} ${islandMuted}`
                            }`}
                          >
                            <span className="text-[11px] font-semibold block">{pref.label}</span>
                            <span className="text-[10px] font-mono opacity-75">{pref.val ? pref.onLabel : pref.offLabel}</span>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
};
