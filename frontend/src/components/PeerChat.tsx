import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Volume2, 
  Bell, 
  Key, 
  Globe,
  Trash2,
  Check,
  Copy,
  Wifi,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import type { ConnectedDevice, ChatMessage } from '../hooks/useWebSocket';
import { 
  M3MacBookIcon, 
  M3PhoneIcon, 
  M3AirDropIcon,
  M3BatteryPill,
  M3SendIcon
} from './M3Icons';
import { ConfirmModal } from './ConfirmModal';
import { copyToClipboard } from '../utils/clipboard';

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
  isAndroid,
}) => {
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Find peer device (other device)
  const peerDevice = devices.find((d) => {
    if (d.id === myDeviceId) return false;
    if (d.name.toLowerCase() === deviceName.toLowerCase()) return false;
    return true;
  }) || null;

  const isPeerOnline = !!peerDevice;
  const isPeerMac = peerDevice ? (peerDevice.os === 'macOS' || peerDevice.name.toLowerCase().includes('mac')) : !isMac;
  const peerDisplayName = peerDevice ? peerDevice.name : (isMac ? 'Android Device' : 'MacBook Pro');

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
      showToast('Copied to clipboard');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: formatted }),
      });
      if (res.ok) {
        showToast(`Opened on Mac: ${formatted}`);
      } else {
        showToast('Failed to open on Mac');
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
    <div className="w-full">
      {/* Responsive Two-Column Bento Layout on Desktop, Single Column on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ========================================================================= */}
        {/* LEFT COLUMN: Peer Channel Hardware Card & Quick Starters (lg: 4 cols)     */}
        {/* ========================================================================= */}
        <div className="hidden lg:flex lg:col-span-4 flex-col gap-4">
          {/* Peer Presence Deck Card */}
          <div className="bento-card rounded-3xl p-5 sm:p-6 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8]">
                Target Peer Node
              </span>
              <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-[#0071E3] dark:text-[#C6F432]">
                <ShieldCheck className="w-3 h-3" />
                <span>LAN P2P</span>
              </span>
            </div>

            <div className="mt-4 flex items-center gap-3.5">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#1E2330] border border-black/[0.06] dark:border-white/[0.08] shadow-sm flex items-center justify-center shrink-0">
                  {isPeerMac ? (
                    <M3MacBookIcon className="w-8 h-8" active={isPeerOnline} />
                  ) : (
                    <M3PhoneIcon className="w-7 h-8" active={isPeerOnline} />
                  )}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#141926] ${
                  isPeerOnline ? 'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-[#F59E0B]'
                }`} />
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="font-display text-sm font-bold text-[#0F1115] dark:text-[#F3F4F6] truncate tracking-tight">
                  {peerDisplayName}
                </h3>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-mono truncate mt-0.5">
                  {peerDevice ? `${peerDevice.os} • Direct LAN P2P` : 'Awaiting Connection'}
                </p>
                {peerDevice?.battery && (
                  <div className="mt-1">
                    <M3BatteryPill level={peerDevice.battery.level} charging={peerDevice.battery.charging} />
                  </div>
                )}
              </div>
            </div>

            {/* Signal & Connection Telemetry */}
            <div className="mt-5 pt-4 border-t border-black/[0.05] dark:border-white/[0.06] grid grid-cols-2 gap-2 text-center">
              <div className="p-2.5 rounded-2xl bg-[#F8FAFC] dark:bg-[#181E2E]">
                <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] uppercase font-bold tracking-wider block">
                  Link Latency
                </span>
                <span className="font-mono text-xs font-bold text-[#10B981] dark:text-[#C6F432] mt-0.5 block">
                  {isPeerOnline ? '1.2 ms Direct' : 'Standby'}
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-[#F8FAFC] dark:bg-[#181E2E]">
                <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] uppercase font-bold tracking-wider block">
                  Transport
                </span>
                <span className="font-mono text-xs font-bold text-[#0F1115] dark:text-white mt-0.5 block">
                  Local Wi-Fi
                </span>
              </div>
            </div>

            {/* Peer Hardware Actions */}
            <div className="mt-4 flex items-center gap-2">
              {isMac ? (
                <button
                  onClick={() => onRingDevice('android')}
                  className="apple-press flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#10B981]/10 hover:bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/20 transition-colors shadow-sm"
                  title="Ring phone to find it"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Ring Phone</span>
                </button>
              ) : (
                <button
                  onClick={() => onRingDevice('mac')}
                  className="apple-press flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#0071E3]/10 dark:bg-white/10 hover:bg-[#0071E3]/15 text-[#0071E3] dark:text-[#38BDF8] border border-[#0071E3]/20 dark:border-white/10 transition-colors shadow-sm"
                  title="Ping Mac speaker chime"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Ping Mac</span>
                </button>
              )}

              {chatMessages.length > 0 && onClearChat && (
                <button
                  onClick={() => setIsClearConfirmOpen(true)}
                  className="apple-press p-2 rounded-xl text-[#64748B] dark:text-[#94A3B8] hover:text-red-500 hover:bg-red-500/10 transition-colors border border-black/[0.04] dark:border-white/[0.06]"
                  title="Clear chat history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Starter Snippets Card */}
          <div className="bento-card rounded-3xl p-5 transition-colors">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#0071E3] dark:text-[#C6F432]" />
              <span>Quick Beam Snippets</span>
            </span>
            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={() => setInputText('WIFI:S:MyNetwork;T:WPA;P:Password123;;')}
                className="apple-press flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-medium bg-[#F8FAFC] dark:bg-[#181E2E] hover:bg-black/[0.04] dark:hover:bg-[#20273A] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.04] dark:border-white/[0.06] transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                  <Key className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold block truncate">Share Wi-Fi Key</span>
                  <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] block font-mono">WPA/WPA2 template</span>
                </div>
              </button>

              <button
                onClick={() => setInputText('https://google.com')}
                className="apple-press flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl text-xs font-medium bg-[#F8FAFC] dark:bg-[#181E2E] hover:bg-black/[0.04] dark:hover:bg-[#20273A] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.04] dark:border-white/[0.06] transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                  <Globe className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold block truncate">Beam Web URL</span>
                  <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8] block font-mono">Direct browser link</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: The Main Chat Conversation Window (lg: 8 cols)              */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 flex flex-col bento-card rounded-3xl overflow-hidden transition-colors h-[640px]">
          
          {/* Header Bar */}
          <div className="px-5 py-4 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/70 dark:bg-[#141926]/70 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative">
                <div className="w-9 h-9 rounded-2xl bg-[#0071E3] text-white flex items-center justify-center shadow-sm">
                  <M3AirDropIcon className="w-5 h-5 text-white" filled />
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-[#141926] ${
                  isPeerOnline ? 'bg-[#10B981]' : 'bg-[#F59E0B]'
                }`} />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-sm font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-tight truncate">
                    {peerDisplayName}
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.2 rounded-full font-bold bg-black/[0.04] dark:bg-white/[0.08] text-[#64748B] dark:text-[#94A3B8]">
                    {chatMessages.length} {chatMessages.length === 1 ? 'msg' : 'msgs'}
                  </span>
                </div>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1.5 truncate mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                  <span className="font-mono">{isPeerOnline ? 'Direct Wi-Fi Peer • Active' : 'Waiting for connection'}</span>
                </p>
              </div>
            </div>

            {/* Mobile Actions: Clear history */}
            <div className="flex items-center gap-2 shrink-0">
              {chatMessages.length > 0 && onClearChat && (
                <button
                  onClick={() => setIsClearConfirmOpen(true)}
                  className="apple-press p-2 rounded-xl text-[#64748B] dark:text-[#94A3B8] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  title="Clear chat messages"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-gradient-to-b from-transparent to-black/[0.015] dark:to-white/[0.01]">
            {chatMessages.length === 0 ? (
              /* Beautiful Empty State */
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 max-w-md mx-auto">
                <div className="w-14 h-14 rounded-3xl bg-[#0071E3]/10 dark:bg-white/10 text-[#0071E3] dark:text-[#C6F432] flex items-center justify-center mb-3.5 shadow-sm">
                  <M3AirDropIcon className="w-7 h-7 text-[#0071E3] dark:text-[#C6F432]" filled />
                </div>
                <h4 className="font-display text-base font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
                  Direct LAN Chat
                </h4>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1.5 leading-relaxed">
                  Send notes, passwords, terminal commands, or links directly to your {peerDisplayName} with zero cloud lag.
                </p>

                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() => setInputText('Hello from ' + deviceName)}
                    className="apple-press px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#F8FAFC] dark:bg-[#181E2E] hover:bg-black/[0.04] dark:hover:bg-[#20273A] text-[#0F1115] dark:text-white border border-black/[0.05] dark:border-white/[0.06] transition-colors"
                  >
                    Say Hello
                  </button>
                  <button
                    onClick={() => setInputText('https://')}
                    className="apple-press px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#F8FAFC] dark:bg-[#181E2E] hover:bg-black/[0.04] dark:hover:bg-[#20273A] text-[#0F1115] dark:text-white border border-black/[0.05] dark:border-white/[0.06] transition-colors"
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
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                      className={`flex items-end gap-2.5 ${isMine ? 'justify-end' : 'justify-start'} group`}
                    >
                      {/* Peer Avatar (Incoming Only) */}
                      {!isMine && (
                        <div className="w-7 h-7 rounded-full bg-black/[0.06] dark:bg-white/[0.1] text-[#0F1115] dark:text-white flex items-center justify-center shrink-0 mb-1">
                          {isPeerMac ? (
                            <M3MacBookIcon className="w-4 h-4" active />
                          ) : (
                            <M3PhoneIcon className="w-3.5 h-4" active />
                          )}
                        </div>
                      )}

                      {/* Bubble Wrapper with constrained max-width */}
                      <div className="flex flex-col max-w-[85%] sm:max-w-[70%]">
                        {/* Sender Label (Incoming Only) */}
                        {!isMine && (
                          <span className="text-[10px] font-bold text-[#64748B] dark:text-[#94A3B8] mb-1 pl-1">
                            {msg.from}
                          </span>
                        )}

                        {/* Modern Chat Bubble */}
                        <div
                          className={`relative rounded-2xl px-4 py-2.5 transition-shadow ${
                            isMine
                              ? 'bg-[#0F1115] text-white dark:bg-[#C6F432] dark:text-[#0A0D14] rounded-br-[4px] shadow-sm'
                              : 'bg-white dark:bg-[#181E2E] border border-black/[0.06] dark:border-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6] rounded-bl-[4px] shadow-sm'
                          }`}
                        >
                          {/* Message Text */}
                          <p className={`text-xs sm:text-[13px] leading-relaxed break-words whitespace-pre-wrap select-text font-sans ${
                            isMine ? 'font-medium dark:font-bold' : ''
                          }`}>
                            {msg.text}
                          </p>

                          {/* Interactive URL Card if URL is present */}
                          {detectedUrl && (
                            <div className={`mt-2 p-2 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                              isMine
                                ? 'bg-white/10 dark:bg-black/10 border-white/20 dark:border-black/20 text-inherit'
                                : 'bg-[#F8FAFC] dark:bg-[#131620] border-black/[0.06] dark:border-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6]'
                            }`}>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Globe className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                <span className="text-[11px] font-mono truncate underline underline-offset-2">
                                  {detectedUrl.replace(/^https?:\/\//i, '')}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(detectedUrl, `url-${msg.id}`)}
                                  className={`apple-press px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors ${
                                    isMine
                                      ? 'bg-white/20 dark:bg-black/20 text-inherit'
                                      : 'bg-[#0071E3] text-white dark:bg-white dark:text-[#0B0D13]'
                                  }`}
                                  title="Copy Link to Clipboard"
                                >
                                  <span>{copiedId === `url-${msg.id}` ? 'Copied' : 'Copy Link'}</span>
                                  {copiedId === `url-${msg.id}` ? (
                                    <Check className="w-2.5 h-2.5" />
                                  ) : (
                                    <Copy className="w-2.5 h-2.5" />
                                  )}
                                </button>

                                {isAndroid && (
                                  <button
                                    onClick={() => handleOpenRemoteUrl(detectedUrl)}
                                    className="apple-press px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#8B5CF6] text-white"
                                    title="Open directly on Mac"
                                  >
                                    On Mac
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Seamless Micro-Footer with Time & Copy Action */}
                          <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-[10px] font-mono select-none ${
                            isMine ? 'text-white/60 dark:text-black/60' : 'text-[#64748B] dark:text-[#94A3B8]'
                          }`}>
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>

                            <button
                              onClick={() => handleCopy(msg.text, msg.id)}
                              className={`apple-press p-0.5 rounded hover:opacity-100 transition-opacity ${
                                isMine ? 'hover:bg-white/10 dark:hover:bg-black/10' : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.1]'
                              }`}
                              title="Copy text"
                            >
                              {isCopied ? (
                                <Check className="w-3 h-3 text-[#10B981]" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
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

          {/* Composer Input Bar */}
          <div className="p-3 sm:p-4 border-t border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#141926] shrink-0">
            <form onSubmit={handleSend} className="relative flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type note, password, or link to beam..."
                className="flex-1 bg-[#F8FAFC] dark:bg-[#181E2E] text-xs sm:text-sm px-4 py-3 rounded-2xl border border-black/[0.06] dark:border-white/[0.08] focus:border-[#0071E3] dark:focus:border-[#C6F432] focus:outline-none text-[#0F1115] dark:text-[#F3F4F6] placeholder-[#64748B] dark:placeholder-[#94A3B8] transition-all font-sans"
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
                className="apple-press w-11 h-11 rounded-2xl bg-[#0F1115] hover:bg-black text-white dark:bg-[#C6F432] dark:hover:bg-[#B5E22B] dark:text-[#0A0D14] disabled:opacity-30 disabled:scale-95 flex items-center justify-center shrink-0 shadow-sm transition-all cursor-pointer font-bold"
                title="Beam (Enter)"
              >
                <M3SendIcon className="w-4 h-4 text-white dark:text-[#0A0D14]" />
              </button>
            </form>

            <div className="mt-2 flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#94A3B8] px-1 font-mono">
              <span className="hidden sm:inline">Press <kbd className="px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.08] text-[10px]">Enter</kbd> to beam</span>
              <span className="ml-auto flex items-center gap-1.5">
                <Wifi className="w-3 h-3 text-[#10B981]" />
                <span>Encrypted Wi-Fi LAN</span>
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Website-Grade Custom Confirmation Modal for Clear Chat */}
      <ConfirmModal
        isOpen={isClearConfirmOpen}
        title="Clear Chat Messages?"
        message="Are you sure you want to erase all conversation messages on this device? This action cannot be undone."
        confirmLabel="Clear Chat"
        onConfirm={() => {
          if (onClearChat) onClearChat();
        }}
        onClose={() => setIsClearConfirmOpen(false)}
      />
    </div>
  );
};
