import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  FolderOpen,
  Clipboard,
  MessageSquare,
  Wrench,
  QrCode,
  Shield,
  Sun,
  Moon,
  Volume2,
  Zap,
  Download,
  ArrowRight,
  CornerDownLeft,
} from 'lucide-react';
import type { UploadedFileItem } from '../hooks/useWebSocket';
import type { TabType } from './Header';

interface CommandItem {
  id: string;
  label: string;
  subtitle: string;
  category: 'Navigation' | 'Actions' | 'Vault Files';
  icon: React.ReactNode;
  onSelect: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  files: UploadedFileItem[];
  onNavigate: (tab: TabType) => void;
  onToggleTheme: () => void;
  onOpenQR: () => void;
  onOpenSecurity: () => void;
  onRingPhone: () => void;
  onPingMac: () => void;
  onDownloadFile: (file: UploadedFileItem) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  theme,
  files,
  onNavigate,
  onToggleTheme,
  onOpenQR,
  onOpenSecurity,
  onRingPhone,
  onPingMac,
  onDownloadFile,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  const items = useMemo<CommandItem[]>(() => {
    const base: CommandItem[] = [
      {
        id: 'nav-files',
        label: 'Go to Files & Transfer',
        subtitle: 'File dropzone and shared Vault',
        category: 'Navigation',
        icon: <FolderOpen className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA]" />,
        onSelect: () => onNavigate('files'),
      },
      {
        id: 'nav-clipboard',
        label: 'Go to Live Clipboard',
        subtitle: 'Cross-device universal clipboard stream',
        category: 'Navigation',
        icon: <Clipboard className="w-4 h-4 text-[#10B981]" />,
        onSelect: () => onNavigate('clipboard'),
      },
      {
        id: 'nav-chat',
        label: 'Go to Peer Chat',
        subtitle: 'Instant local room messaging & links',
        category: 'Navigation',
        icon: <MessageSquare className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA]" />,
        onSelect: () => onNavigate('chat'),
      },
      {
        id: 'nav-tools',
        label: 'Go to Hardware & Tools',
        subtitle: 'Device vitals, remote browser & utilities',
        category: 'Navigation',
        icon: <Wrench className="w-4 h-4 text-[#64748B] dark:text-[#94A3B8]" />,
        onSelect: () => onNavigate('tools'),
      },
      {
        id: 'act-qr',
        label: 'Pair Device / Scan QR Code',
        subtitle: 'Open instant pairing badge',
        category: 'Actions',
        icon: <QrCode className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA]" />,
        onSelect: onOpenQR,
      },
      {
        id: 'act-shield',
        label: 'Configure Office Security & Whitelist',
        subtitle: 'Manage Room PIN & approved peers',
        category: 'Actions',
        icon: <Shield className="w-4 h-4 text-[#10B981]" />,
        onSelect: onOpenSecurity,
      },
      {
        id: 'act-theme',
        label: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
        subtitle: 'Toggle dark/light appearance',
        category: 'Actions',
        icon: theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />,
        onSelect: onToggleTheme,
      },
      {
        id: 'act-ring',
        label: 'Ring Connected Phone',
        subtitle: 'Send vibration alert',
        category: 'Actions',
        icon: <Volume2 className="w-4 h-4 text-[#10B981]" />,
        onSelect: onRingPhone,
      },
      {
        id: 'act-ping',
        label: 'Ping Host Computer',
        subtitle: 'Trigger acoustic chime on host',
        category: 'Actions',
        icon: <Zap className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA]" />,
        onSelect: onPingMac,
      },
    ];

    const fileCommands: CommandItem[] = files.slice(0, 12).map((f) => ({
      id: `file-${f.name}`,
      label: f.name,
      subtitle: 'Download from Shared Vault',
      category: 'Vault Files',
      icon: <Download className="w-4 h-4 text-[#2563EB] dark:text-[#60A5FA]" />,
      onSelect: () => onDownloadFile(f),
    }));

    const all = [...base, ...fileCommands];
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 10);
    return all.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [files, query, theme, onNavigate, onOpenQR, onOpenSecurity, onToggleTheme, onRingPhone, onPingMac, onDownloadFile]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (items.length ? (i + 1) % items.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
      } else if (e.key === 'Enter' && items[activeIndex]) {
        e.preventDefault();
        items[activeIndex].onSelect();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, items, activeIndex, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="cmdk-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-[#090C12]/65 backdrop-blur-xl flex items-start justify-center pt-[14vh] px-4"
        >
          <motion.div
            key="cmdk-dialog"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bento-modal max-w-lg overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08]">
              <Search className="w-4 h-4 text-[#64748B] dark:text-[#94A3B8] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to files, security, clipboard, or tools..."
                className="flex-1 bg-transparent text-sm text-[#0F1115] dark:text-white placeholder-[#64748B] dark:placeholder-[#94A3B8] focus:outline-none"
              />
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-lg bg-black/[0.05] dark:bg-white/[0.08] text-[#64748B] dark:text-[#94A3B8]">
                ESC
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {items.length === 0 ? (
                <div className="py-10 text-center text-xs text-[#64748B] dark:text-[#94A3B8]">
                  No commands or Vault files match &ldquo;{query}&rdquo;
                </div>
              ) : (
                items.map((item, idx) => {
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        item.onSelect();
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                        isActive
                          ? 'bg-[#111827] text-white dark:bg-[#F8FAFC] dark:text-[#0B0D11]'
                          : 'hover:bg-[#F1F5F9] dark:hover:bg-white/[0.05] text-[#0F172A] dark:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isActive ? 'bg-white/15 dark:bg-[#0B0D11]/10' : 'bg-[#F1F5F9] dark:bg-white/[0.07]'
                          }`}
                        >
                          {item.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{item.label}</p>
                          <p
                            className={`text-[10px] truncate ${
                              isActive ? 'text-white/75 dark:text-[#0B0D11]/75' : 'text-[#64748B] dark:text-[#94A3B8]'
                            }`}
                          >
                            {item.category} • {item.subtitle}
                          </p>
                        </div>
                      </div>
                      {isActive ? (
                        <CornerDownLeft className="w-3.5 h-3.5 shrink-0 opacity-80" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-30" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
