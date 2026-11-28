import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Bell, Globe, Trash2, Check, Copy } from 'lucide-react';
import type { ConnectedDevice, ChatMessage, ServerInfo } from '../hooks/useWebSocket';
import { M3AirDropIcon, M3SendIcon } from './M3Icons';
import { DeviceOsIcon, getHostLabel } from './DeviceOsIcon';
import { ConfirmModal } from './ConfirmModal';
import { copyToClipboard } from '../utils/clipboard';
import { getAuthHeaders } from '../utils/device';

interface PeerChatProps {
  devices: ConnectedDevice[];
  myDeviceId: string;
  deviceName: string;
  chatMessages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onRingDevice: (target: 'android' | 'mac') => void;
  onClearChat?: () => void;
  showToast: (msg: string) => void;
  isMac: boolean;
  isAndroid: boolean;
  isWindows?: boolean;
  serverInfo?: ServerInfo | null;
}

export const PeerChat: React.FC<PeerChatProps> = ({
  devices,
  myDeviceId,
  deviceName,
  chatMessages,
  onSendMessage,
  onRingDevice,
  onClearChat,
  showToast,
  isMac,
  isWindows = false,
  serverInfo,
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const hostLabel = getHostLabel(serverInfo || { isMac, isWindows });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const peerDevice =
    devices.find((d) => d.id !== myDeviceId && d.name.toLowerCase() !== deviceName.toLowerCase()) || null;

  const isPeerOnline = !!peerDevice;
  const peerOs = peerDevice?.os || (isMac || isWindows ? 'Android' : hostLabel);
  const peerDisplayName = peerDevice ? peerDevice.name : isMac || isWindows ? 'Peer Device' : `${hostLabel} Host`;

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const handleCopy = async (text: string, id: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedId(id);
      showToast('Copied');
      setTimeout(() => setCopiedId(null), 2000);
    } else {
      showToast('Copy failed');
    }
  };

  const handleOpenRemoteUrl = async (url: string) => {
    let formatted = url;
    if (!/^https?:\/\//i.test(formatted)) {
      formatted = 'https://' + formatted;
    }
    try {
      const res = await fetch('/api/open-url', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url: formatted }),
      });
      if (res.ok) {
        showToast(`Opened on ${hostLabel}`);
      } else {
        showToast(`Failed to open on ${hostLabel}`);
      }
    } catch (e) {
      showToast('Network error');
    }
  };

  const extractUrl = (text: string) => {
    const match = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|org|net|io|dev|app|edu|gov|co|ai)[^\s]*)/i);
    return match ? match[0] : null;
  };

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="ab-card overflow-hidden flex flex-col h-[calc(100dvh-185px)] sm:h-[68dvh] min-h-[360px] max-h-[680px]">
        {/* Clean Minimal Chat Header */}
        <div
          className="px-5 py-3.5 flex items-center justify-between gap-3 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
              >
                <DeviceOsIcon os={peerOs} className="w-5 h-5" active={isPeerOnline} />
              </div>
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${
                  isPeerOnline ? 'bg-emerald-500' : 'bg-amber-400'
                }`}
                style={{ borderColor: 'var(--surface)' }}
              />
            </div>

            <div className="min-w-0">
              <h3 className="font-display text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                {peerDisplayName}
              </h3>
              <p className="text-[11px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>
                {isPeerOnline ? 'Online · Direct LAN' : 'Waiting for peer'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isMac || isWindows ? (
              <button
                onClick={() => onRingDevice('android')}
                className="ab-btn ab-btn-ghost h-8 px-2.5 text-xs"
                title="Ring paired phones"
              >
                <Volume2 className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
                <span className="hidden sm:inline">Ring</span>
              </button>
            ) : (
              <button
                onClick={() => onRingDevice('mac')}
                className="ab-btn ab-btn-ghost h-8 px-2.5 text-xs"
                title={`Ping ${hostLabel}`}
              >
                <Bell className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span className="hidden sm:inline">Ping</span>
              </button>
            )}

            {chatMessages.length > 0 && onClearChat && (
              <button
                onClick={() => setIsClearConfirmOpen(true)}
                className="apple-press p-2 rounded-lg text-[#9CA3AF] hover:text-rose-500 transition-colors"
                title="Clear messages"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 max-w-sm mx-auto">
              <M3AirDropIcon className="w-7 h-7 mb-3" filled style={{ color: 'var(--text-tertiary)' }} />
              <p className="font-display text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Direct LAN Chat
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                Send notes, passwords, or links directly to {peerDisplayName}.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => setInputText('Hello from ' + deviceName)}
                  className="ab-btn ab-btn-ghost h-8 px-3 text-xs"
                >
                  Say Hello
                </button>
                <button
                  onClick={() => setInputText('https://')}
                  className="ab-btn ab-btn-ghost h-8 px-3 text-xs"
                >
                  Share Link
                </button>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {chatMessages.map((msg, idx) => {
                const isMine = msg.fromId === myDeviceId || msg.from.toLowerCase() === deviceName.toLowerCase();
                const detectedUrl = extractUrl(msg.text);
                const isCopied = copiedId === msg.id;

                return (
                  <motion.div
                    key={msg.id || idx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.14 }}
                    className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isMine && (
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mb-0.5"
                        style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
                      >
                        <DeviceOsIcon os={msg.from || peerOs} className="w-4 h-4" active />
                      </div>
                    )}

                    <div className="flex flex-col max-w-[82%] sm:max-w-[70%]">
                      {!isMine && (
                        <span className="text-[10px] font-medium mb-1 pl-1" style={{ color: 'var(--text-tertiary)' }}>
                          {msg.from}
                        </span>
                      )}

                      <div
                        className={`rounded-2xl px-3.5 py-2.5 ${isMine ? 'rounded-br-sm' : 'rounded-bl-sm'}`}
                        style={
                          isMine
                            ? { background: 'var(--text-primary)', color: 'var(--surface)' }
                            : { background: 'var(--surface-alt)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
                        }
                      >
                        <p className="text-xs sm:text-sm leading-relaxed break-words whitespace-pre-wrap select-text">
                          {msg.text}
                        </p>

                        {detectedUrl && (
                          <div
                            className="mt-2 p-2 rounded-lg flex items-center justify-between gap-2 text-xs"
                            style={{
                              background: isMine ? 'rgba(255,255,255,0.12)' : 'var(--surface)',
                              border: isMine ? '1px solid rgba(255,255,255,0.18)' : '1px solid var(--border)',
                            }}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Globe className="w-3.5 h-3.5 shrink-0 opacity-75" />
                              <span className="text-[11px] font-mono truncate">
                                {detectedUrl.replace(/^https?:\/\//i, '')}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCopy(detectedUrl, `url-${msg.id}`)}
                                className="apple-press px-2 py-0.5 rounded text-[10px] font-semibold bg-black/15 dark:bg-white/15"
                              >
                                {copiedId === `url-${msg.id}` ? 'Copied' : 'Copy'}
                              </button>
                              {!isMac && !isWindows && (
                                <button
                                  onClick={() => handleOpenRemoteUrl(detectedUrl)}
                                  className="apple-press px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500 text-white"
                                >
                                  Open
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] font-mono opacity-60">
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button
                            onClick={() => handleCopy(msg.text, msg.id)}
                            className="apple-press p-0.5 rounded"
                            title="Copy"
                          >
                            {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="p-3 sm:p-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <form onSubmit={handleSend} className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Message, link, or snippet..."
              className="ab-input flex-1 h-10 px-3.5 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="ab-btn ab-btn-primary w-10 h-10 p-0 shrink-0"
              title="Send"
            >
              <M3SendIcon className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      <ConfirmModal
        isOpen={isClearConfirmOpen}
        title="Clear Chat?"
        message="Erase all conversation messages on this device?"
        confirmLabel="Clear Chat"
        onConfirm={() => {
          if (onClearChat) onClearChat();
        }}
        onClose={() => setIsClearConfirmOpen(false)}
      />
    </div>
  );
};
