import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Clock, Trash2 } from 'lucide-react';
import type { ClipboardItem } from '../hooks/useWebSocket';
import { M3ClipboardIcon, M3CopyIcon, M3CheckIcon, M3SendIcon } from './M3Icons';
import { DeviceOsIcon } from './DeviceOsIcon';
import { ConfirmModal } from './ConfirmModal';
import { copyToClipboard } from '../utils/clipboard';
import { getAuthHeaders } from '../utils/device';

interface UniversalClipboardProps {
  items: ClipboardItem[];
  onSendClipboard: (text: string) => void;
  onClearClipboard?: () => void;
  isAndroid: boolean;
  isMac: boolean;
  isWindows?: boolean;
  hostLabel?: string;
  showToast: (msg: string) => void;
}

export const UniversalClipboard: React.FC<UniversalClipboardProps> = ({
  items,
  onSendClipboard,
  onClearClipboard,
  isMac,
  isWindows = false,
  hostLabel,
  showToast,
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const resolvedHostLabel = hostLabel || (isWindows ? 'Windows' : isMac ? 'Mac' : 'Host');

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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        showToast(`Opened on ${resolvedHostLabel}`);
      }
    } catch (e) {
      showToast('Failed to trigger browser');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Composer */}
      <div className="ab-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Universal Clipboard
          </h2>
          <span className="ab-kicker">Real-Time Sync</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste text, links, code snippets, or Wi-Fi credentials to sync..."
            rows={3}
            className="ab-input p-3.5 text-sm resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit(e);
              }
            }}
          />

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-tertiary)' }}>
              ⌘ / Ctrl + Enter to sync
            </span>

            <button
              type="submit"
              disabled={!inputText.trim()}
              className="ab-btn ab-btn-primary ml-auto text-xs h-9 px-4"
            >
              <M3SendIcon className="w-3.5 h-3.5" />
              <span>Sync</span>
            </button>
          </div>
        </form>
      </div>

      {/* History Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-baseline gap-2">
            <h3 className="font-display text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              History
            </h3>
            <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
              {items.length}
            </span>
          </div>

          {items.length > 0 && onClearClipboard && (
            <button
              onClick={() => setIsConfirmOpen(true)}
              className="apple-press p-1.5 rounded-lg text-[#9CA3AF] hover:text-rose-500 transition-colors"
              title="Clear history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center rounded-2xl" style={{ border: '1px solid var(--border)' }}>
            <M3ClipboardIcon className="w-6 h-6 mx-auto mb-2.5" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Nothing synced yet
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Paste anything above to share across connected devices
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <AnimatePresence>
              {items.map((item) => {
                const isCopied = copiedId === item.id;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.14 }}
                    className="ab-card-flush p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <DeviceOsIcon os={item.from} className="w-3.5 h-3.5 shrink-0" active />
                        <span className="font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                          {item.from}
                        </span>
                      </div>

                      <span className="flex items-center gap-1 text-[11px] font-mono tabular-nums shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                        <Clock className="w-3 h-3" />
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className="text-xs sm:text-sm font-mono whitespace-pre-wrap break-words p-3 rounded-xl max-h-48 overflow-y-auto leading-relaxed"
                      style={{
                        background: 'var(--surface-alt)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {item.text}
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={() => handleCopyItem(item)} className="ab-btn ab-btn-ghost h-8 px-3 text-xs">
                        {isCopied ? (
                          <>
                            <M3CheckIcon className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
                            <span style={{ color: 'var(--success)' }}>Copied</span>
                          </>
                        ) : (
                          <>
                            <M3CopyIcon className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      {item.isUrl && (
                        <button
                          onClick={() => handleOpenRemoteMacUrl(item.text)}
                          className="ab-btn ab-btn-ghost h-8 px-3 text-xs"
                          style={{ color: 'var(--accent)' }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open on {resolvedHostLabel}</span>
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={isConfirmOpen}
        title="Clear Clipboard History?"
        message="This will remove all synced clipboard items on this device."
        confirmLabel="Clear All"
        onConfirm={() => {
          if (onClearClipboard) onClearClipboard();
        }}
        onClose={() => setIsConfirmOpen(false)}
      />
    </div>
  );
};
