import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ExternalLink, 
  Clock,
  Trash2
} from 'lucide-react';
import type { ClipboardItem } from '../hooks/useWebSocket';
import { 
  M3ClipboardIcon, 
  M3MacBookIcon, 
  M3PhoneIcon,
  M3CopyIcon,
  M3CheckIcon,
  M3SendIcon
} from './M3Icons';
import { ConfirmModal } from './ConfirmModal';
import { copyToClipboard } from '../utils/clipboard';

interface UniversalClipboardProps {
  items: ClipboardItem[];
  onSendClipboard: (text: string) => void;
  onClearClipboard?: () => void;
  isAndroid: boolean;
  isMac: boolean;
  showToast: (msg: string) => void;
}

export const UniversalClipboard: React.FC<UniversalClipboardProps> = ({
  items,
  onSendClipboard,
  onClearClipboard,
  isAndroid: _isAndroid,
  isMac,
  showToast,
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendClipboard(inputText);
      setInputText('');
      showToast('Synced across devices');
    }
  };

  const handleCopyItem = async (item: ClipboardItem) => {
    const success = await copyToClipboard(item.text);
    if (success) {
      setCopiedId(item.id);
      showToast('Copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      showToast('Copy failed');
    }
  };

  const handleOpenRemoteMacUrl = async (url: string) => {
    try {
      const res = await fetch('/api/open-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        showToast('Opened in Mac default browser');
      }
    } catch (e) {
      showToast('Failed to trigger browser');
    }
  };

  const charCount = inputText.length;
  const wordCount = inputText.trim() ? inputText.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-5">
      {/* Universal Clipboard Composer Card */}
      <div className="bento-card rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#10B981]/10 text-[#10B981] dark:text-[#34D399] flex items-center justify-center shrink-0">
              <M3ClipboardIcon className="w-5 h-5" filled />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                Real-Time Sync
              </div>
              <h3 className="font-display text-base font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
                Universal Live Clipboard
              </h3>
            </div>
          </div>

          {/* Character / Word count chip in tabular font */}
          {charCount > 0 && (
            <div className="text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] px-2.5 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.05] dark:border-white/[0.06]">
              <span>{wordCount} words</span>
              <span className="mx-1">•</span>
              <span>{charCount} chars</span>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste text, notes, Wi-Fi credentials, code snippets, or URLs to sync across devices..."
              rows={3}
              className="w-full bg-[#F8FAFC] dark:bg-[#181C28] text-sm text-[#0F1115] dark:text-[#F3F4F6] placeholder-[#64748B] dark:placeholder-[#64748B] rounded-2xl p-4 border border-black/[0.06] dark:border-white/[0.08] focus:border-[#0071E3] dark:focus:border-white focus:ring-4 focus:ring-[#0071E3]/10 dark:focus:ring-white/10 transition-colors resize-none font-sans"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmit(e);
                }
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] hidden sm:inline">
              Press <kbd className="px-1.5 py-0.5 rounded bg-black/[0.05] dark:bg-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.06] dark:border-white/[0.08] font-mono text-[10px]">Ctrl / Cmd + Enter</kbd> to beam
            </span>

            <button
              type="submit"
              disabled={!inputText.trim()}
              className="apple-press ml-auto flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs sm:text-sm font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-[#0B0D13] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-colors"
            >
              <M3SendIcon className="w-3.5 h-3.5 text-white dark:text-[#0B0D13]" />
              <span>Sync to {isMac ? 'Android' : 'Mac'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Clipboard History Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
              Sync Activity
            </div>
            <h4 className="font-display text-base font-bold text-[#0F1115] dark:text-[#F3F4F6] flex items-center gap-2 tracking-tight">
              <span>Clipboard Feed</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[#64748B] dark:text-[#94A3B8] font-mono tabular-nums">
                {items.length}
              </span>
            </h4>
          </div>

          {items.length > 0 && onClearClipboard && (
            <button
              onClick={() => setIsConfirmOpen(true)}
              className="apple-press p-2 rounded-xl text-[#64748B] dark:text-[#94A3B8] hover:text-red-500 hover:bg-red-500/10 transition-colors"
              title="Clear clipboard history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center rounded-3xl bento-card border border-black/[0.05] dark:border-white/[0.06]">
            <M3ClipboardIcon className="w-8 h-8 text-[#64748B] dark:text-[#94A3B8] mx-auto mb-2 opacity-40" />
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">No clipboard items synced yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {items.map((item, idx) => {
                const isCopied = copiedId === item.id;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{
                      duration: 0.18,
                      delay: Math.min(idx * 0.03, 0.15),
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="bento-card-interactive rounded-2xl p-4 sm:p-5 flex flex-col gap-3 group"
                  >
                    <div className="flex items-center justify-between text-xs text-[#64748B] dark:text-[#94A3B8]">
                      <div className="flex items-center gap-2 font-semibold text-[#0F1115] dark:text-[#F3F4F6]">
                        {item.from.toLowerCase().includes('mac') ? (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#0071E3]/10 text-[#0071E3] dark:text-[#38BDF8]">
                            <M3MacBookIcon className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-bold">Mac</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981] dark:text-[#34D399]">
                            <M3PhoneIcon className="w-3 h-3.5" />
                            <span className="text-[11px] font-bold">Android</span>
                          </div>
                        )}
                        <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">from {item.from}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.isUrl && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#0071E3]/10 text-[#0071E3] dark:text-[#38BDF8]">
                            URL
                          </span>
                        )}
                        {item.isPhone && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[#10B981]/10 text-[#10B981] dark:text-[#34D399]">
                            PHONE
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
                          <Clock className="w-3 h-3" />
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {/* Text Preview Box with JetBrains / SF Mono */}
                    <div className="text-sm text-[#0F1115] dark:text-[#F3F4F6] font-mono whitespace-pre-wrap break-words bg-[#F8FAFC] dark:bg-[#181A22] p-3.5 rounded-2xl border border-black/[0.04] dark:border-white/[0.06] max-h-48 overflow-y-auto leading-relaxed">
                      {item.text}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <div className="flex items-center gap-2">
                        {/* Copy button */}
                        <button
                          onClick={() => handleCopyItem(item)}
                          className="apple-press flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.14] text-[#0F1115] dark:text-[#F3F4F6] transition-colors"
                        >
                          {isCopied ? (
                            <>
                              <M3CheckIcon className="w-3.5 h-3.5 text-[#10B981]" />
                              <span className="text-[#10B981]">Copied</span>
                            </>
                          ) : (
                            <>
                              <M3CopyIcon className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        {/* Open URL on Remote Mac */}
                        {item.isUrl && (
                          <button
                            onClick={() => handleOpenRemoteMacUrl(item.text)}
                            className="apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#0071E3]/10 hover:bg-[#0071E3]/20 text-[#0071E3] dark:text-[#38BDF8] transition-colors"
                            title="Open URL on Mac browser"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open on Mac</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Website-Grade Custom Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmOpen}
        title="Clear Clipboard History?"
        message="Are you sure you want to clear your synced clipboard history? This will remove all items on this device."
        confirmLabel="Clear All"
        onConfirm={() => {
          if (onClearClipboard) onClearClipboard();
        }}
        onClose={() => setIsConfirmOpen(false)}
      />
    </div>
  );
};
