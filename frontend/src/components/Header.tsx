import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Check } from 'lucide-react';
import type { ConnectedDevice, ServerInfo } from '../hooks/useWebSocket';
import { 
  M3AirDropIcon, 
  M3QrCodeIcon, 
  M3SunIcon, 
  M3MoonIcon,
  M3ClipboardIcon,
  M3ChatIcon,
  M3ToolsIcon,
  M3ShieldLockIcon
} from './M3Icons';
import { AirBridgeEmblem } from './AirBridgeLogo';

export type TabType = 'files' | 'clipboard' | 'chat' | 'tools';

interface HeaderProps {
  isConnected: boolean;
  devices: ConnectedDevice[];
  serverInfo: ServerInfo | null;
  deviceName: string;
  isAndroid: boolean;
  isMac: boolean;
  isWindows?: boolean;
  officeSecurityEnabled?: boolean;
  officePin?: string;
  theme: 'dark' | 'light';
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
  chatCount?: number;
  clipboardCount?: number;
  onToggleTheme: () => void;
  onOpenQR: () => void;
  onOpenOnTheGo: () => void;
  onOpenSecuritySettings?: () => void;
  onUpdateName: (name: string) => void;
  onRingPhone: () => void;
  onPingMac: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isConnected,
  deviceName,
  theme,
  officeSecurityEnabled = false,
  officePin = '',
  activeTab = 'files',
  onTabChange,
  chatCount = 0,
  clipboardCount = 0,
  onToggleTheme,
  onOpenQR,
  onOpenSecuritySettings,
  onUpdateName,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(deviceName);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      onUpdateName(tempName.trim());
      setIsEditingName(false);
    }
  };

  const isDark = theme === 'dark';

  return (
    <header className="sticky top-0 z-30 w-full bento-header px-4 py-2.5 sm:px-6 transition-colors duration-200">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-4">
        {/* Brand / Identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div 
            onClick={() => {
              onOpenQR();
            }}
            className="apple-press w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#0F1115] dark:bg-[#141822] text-[#0F1115] dark:text-[#C6F432] border border-black/10 dark:border-white/10 flex items-center justify-center shrink-0 shadow-sm cursor-pointer transition-transform hover:scale-105"
            title="AirBridge • Click to pair"
          >
            <AirBridgeEmblem className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-white dark:text-[#C6F432]" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-sm sm:text-base tracking-tight text-[#0F1115] dark:text-[#F3F4F6]">
                AirBridge
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/[0.04] dark:bg-white/[0.08] text-[#64748B] dark:text-[#94A3B8]">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#10B981] animate-pulse' : 'bg-[#F59E0B]'}`} />
                <span className="font-mono">{isConnected ? 'Live 1.2ms' : 'Connecting'}</span>
              </span>
            </div>

            {/* Rename device button */}
            {isEditingName ? (
              <form onSubmit={handleSaveName} className="flex items-center gap-1 mt-0.5">
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="bg-white dark:bg-[#1A1D26] text-[11px] px-1.5 py-0.5 rounded border border-[#0071E3] dark:border-white/20 text-[#0F1115] dark:text-white focus:outline-none w-28"
                  autoFocus
                  onBlur={() => setIsEditingName(false)}
                />
                <button type="submit" className="text-[11px] font-semibold text-[#0071E3] dark:text-[#38BDF8]">
                  <Check className="w-3 h-3" />
                </button>
              </form>
            ) : (
              <button
                onClick={() => {
                  setTempName(deviceName);
                  setIsEditingName(true);
                }}
                className="group flex items-center gap-1 text-[11px] text-[#64748B] dark:text-[#8E92A0] hover:text-[#0F1115] dark:hover:text-white truncate transition-colors"
                title="Click to rename"
              >
                <span className="truncate">{deviceName}</span>
                <Settings className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Center: Desktop Segmented Navigation Tabs (Salesforce Dark Lime / Light Obsidian Architecture) */}
        {onTabChange && (
          <div className="hidden md:flex items-center bento-nav-track">
            {/* AirDrop Tab */}
            <button
              onClick={() => onTabChange('files')}
              className={`apple-press relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs transition-colors shrink-0 ${
                activeTab === 'files' 
                  ? 'text-white dark:text-[#0A0D14] font-bold' 
                  : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white font-medium'
              }`}
            >
              {activeTab === 'files' && (
                <motion.div
                  layoutId="headerActiveTabPill"
                  className="absolute inset-0 bg-[#0F1115] dark:bg-[#C6F432] rounded-xl shadow-sm dark:shadow-[0_2px_12px_rgba(198,244,50,0.35)]"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <M3AirDropIcon className={`w-3.5 h-3.5 ${activeTab === 'files' ? 'text-white dark:text-[#0A0D14]' : 'text-[#0071E3] dark:text-[#38BDF8]'}`} filled={activeTab === 'files'} />
                <span>AirDrop</span>
              </span>
            </button>

            {/* Clipboard Tab */}
            <button
              onClick={() => onTabChange('clipboard')}
              className={`apple-press relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs transition-colors shrink-0 ${
                activeTab === 'clipboard' 
                  ? 'text-white dark:text-[#0A0D14] font-bold' 
                  : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white font-medium'
              }`}
            >
              {activeTab === 'clipboard' && (
                <motion.div
                  layoutId="headerActiveTabPill"
                  className="absolute inset-0 bg-[#0F1115] dark:bg-[#C6F432] rounded-xl shadow-sm dark:shadow-[0_2px_12px_rgba(198,244,50,0.35)]"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <M3ClipboardIcon className={`w-3.5 h-3.5 ${activeTab === 'clipboard' ? 'text-white dark:text-[#0A0D14]' : 'text-[#10B981] dark:text-[#34D399]'}`} filled={activeTab === 'clipboard'} />
                <span>Clipboard</span>
                {clipboardCount > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${activeTab === 'clipboard' ? 'bg-white/20 dark:bg-black/20 text-inherit' : 'bg-black/[0.06] dark:bg-white/[0.08]'}`}>
                    {clipboardCount}
                  </span>
                )}
              </span>
            </button>

            {/* Chat Tab */}
            <button
              onClick={() => onTabChange('chat')}
              className={`apple-press relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs transition-colors shrink-0 ${
                activeTab === 'chat' 
                  ? 'text-white dark:text-[#0A0D14] font-bold' 
                  : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white font-medium'
              }`}
            >
              {activeTab === 'chat' && (
                <motion.div
                  layoutId="headerActiveTabPill"
                  className="absolute inset-0 bg-[#0F1115] dark:bg-[#C6F432] rounded-xl shadow-sm dark:shadow-[0_2px_12px_rgba(198,244,50,0.35)]"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <M3ChatIcon className={`w-3.5 h-3.5 ${activeTab === 'chat' ? 'text-white dark:text-[#0A0D14]' : 'text-[#0071E3] dark:text-[#38BDF8]'}`} filled={activeTab === 'chat'} />
                <span>Chat</span>
                {chatCount > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold tabular-nums ${activeTab === 'chat' ? 'bg-white/20 dark:bg-black/20 text-inherit' : 'bg-[#0071E3]/15 dark:bg-white/10 text-[#0071E3] dark:text-[#38BDF8]'}`}>
                    {chatCount}
                  </span>
                )}
              </span>
            </button>

            {/* Tools Tab */}
            <button
              onClick={() => onTabChange('tools')}
              className={`apple-press relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs transition-colors shrink-0 ${
                activeTab === 'tools' 
                  ? 'text-white dark:text-[#0A0D14] font-bold' 
                  : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white font-medium'
              }`}
            >
              {activeTab === 'tools' && (
                <motion.div
                  layoutId="headerActiveTabPill"
                  className="absolute inset-0 bg-[#0F1115] dark:bg-[#C6F432] rounded-xl shadow-sm dark:shadow-[0_2px_12px_rgba(198,244,50,0.35)]"
                  transition={{ type: "spring", stiffness: 450, damping: 32 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <M3ToolsIcon className={`w-3.5 h-3.5 ${activeTab === 'tools' ? 'text-white dark:text-[#0A0D14]' : 'text-[#8B5CF6] dark:text-[#A78BFA]'}`} filled={activeTab === 'tools'} />
                <span>Tools</span>
              </span>
            </button>
          </div>
        )}

        {/* Action Controls: Office Shield, Theme Switcher & Pair Phone */}
        <div className="flex items-center gap-2 shrink-0">
          {onOpenSecuritySettings && (
            <button
              onClick={onOpenSecuritySettings}
              className={`apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold border transition-all ${
                officeSecurityEnabled
                  ? 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30 hover:bg-[#10B981]/25'
                  : 'bg-black/[0.04] dark:bg-white/[0.08] text-[#64748B] dark:text-[#94A3B8] border-black/[0.04] dark:border-white/[0.06] hover:text-[#0F1115] dark:hover:text-white'
              }`}
              title="Office Wi-Fi Security & PIN Settings"
            >
              <M3ShieldLockIcon className="w-3.5 h-3.5" filled={officeSecurityEnabled} />
              <span className="hidden sm:inline font-mono">{officeSecurityEnabled ? `PIN: ${officePin}` : 'Office Shield'}</span>
            </button>
          )}

          {/* Light / Dark Theme Morphing Pill */}
          <button
            onClick={() => {
              onToggleTheme();
            }}
            className="apple-press p-2 rounded-2xl bg-black/[0.04] dark:bg-white/[0.08] text-[#475569] dark:text-[#E2E8F0] hover:bg-black/[0.08] dark:hover:bg-white/[0.14] border border-black/[0.04] dark:border-white/[0.06] transition-all"
            title={`Switch to ${isDark ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle color theme"
          >
            <motion.div
              key={theme}
              initial={{ rotate: -45, scale: 0.8, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {isDark ? (
                <M3SunIcon className="w-4 h-4 text-amber-400" />
              ) : (
                <M3MoonIcon className="w-4 h-4 text-[#1E293B]" />
              )}
            </motion.div>
          </button>

          {/* Pair Phone Button with Electric Lime on Dark */}
          <button
            onClick={() => {
              onOpenQR();
            }}
            className="apple-press flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-[#C6F432] dark:hover:bg-[#B5E22B] dark:text-[#0A0D14] shadow-sm transition-transform active:scale-95"
          >
            <M3QrCodeIcon className="w-3.5 h-3.5 text-white dark:text-[#0A0D14]" />
            <span className="font-sans hidden sm:inline">Pair Phone</span>
            <span className="font-sans sm:hidden">Pair</span>
          </button>
        </div>
      </div>
    </header>
  );
};
