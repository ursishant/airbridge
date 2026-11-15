import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ExternalLink, 
  Globe
} from 'lucide-react';
import type { ConnectedDevice, ChatMessage } from '../hooks/useWebSocket';
import { deduplicateDevices } from '../hooks/useWebSocket';
import { 
  M3BatteryPill, 
  M3MacBookIcon, 
  M3PhoneIcon,
  M3VolumeIcon,
  M3VibrateIcon,
  M3SparklesIcon,
  M3SendIcon
} from './M3Icons';

interface DeviceRemoteToolsProps {
  devices: ConnectedDevice[];
  chatMessages: ChatMessage[];
  onRingPhone: () => void;
  onPingMac: () => void;
  onSendMessage: (text: string) => void;
  showToast: (msg: string) => void;
  onOpenChat?: () => void;
}

export const DeviceRemoteTools: React.FC<DeviceRemoteToolsProps> = ({
  devices,
  chatMessages,
  onRingPhone,
  onPingMac,
  onSendMessage,
  showToast,
  onOpenChat,
}) => {
  const [remoteUrl, setRemoteUrl] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isRingingLocal, setIsRingingLocal] = useState(false);

  const handleOpenRemoteUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteUrl.trim()) return;

    let formattedUrl = remoteUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    try {
      const res = await fetch('/api/open-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: formattedUrl }),
      });

      if (res.ok) {
        showToast(`Opened on Mac: ${formattedUrl}`);
        setRemoteUrl('');
      } else {
        showToast('Failed to open URL');
      }
    } catch (e) {
      showToast('Error sending URL');
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (chatInput.trim()) {
      onSendMessage(chatInput.trim());
      setChatInput('');
    }
  };

  const triggerRingPhone = () => {
    setIsRingingLocal(true);
    onRingPhone();
    showToast('Ringing Android phone at maximum volume...');
    setTimeout(() => setIsRingingLocal(false), 5000);
  };

  const triggerPingMac = () => {
    onPingMac();
    showToast('Chime played through Mac speakers');
  };

  const cleanDevices = deduplicateDevices(devices);
  const activeCount = cleanDevices.length > 0 ? cleanDevices.length : 1;

  return (
    <div className="w-full space-y-4">
      {/* 1. Device Hardware & Live Battery Status Hero Strip */}
      <div className="bento-card rounded-3xl p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <h3 className="font-display text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
              Connected Hardware &amp; Battery
            </h3>
          </div>
          <span className="text-[11px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8]">
            {activeCount} {activeCount === 1 ? 'device' : 'devices'} active
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(cleanDevices.length > 0 ? cleanDevices : [
            { id: 'local_mac', name: 'MacBook Host', os: 'macOS' as const, ip: '127.0.0.1', connectedAt: Date.now(), battery: null }
          ]).map((device) => {
            const isDeviceMac = device.os === 'macOS' || device.name.toLowerCase().includes('mac');
            return (
              <div
                key={device.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-[#F8FAFC] dark:bg-[#151924] border border-black/[0.04] dark:border-white/[0.06] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-white dark:bg-[#1E2332] border border-black/[0.06] dark:border-white/[0.08] shadow-sm flex items-center justify-center shrink-0">
                    {isDeviceMac ? (
                      <M3MacBookIcon className="w-6 h-6" active={true} />
                    ) : (
                      <M3PhoneIcon className="w-5 h-6" active={true} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6] truncate tracking-tight">
                      {device.name}
                    </p>
                    <p className="text-[10px] text-[#64748B] dark:text-[#94A3B8] font-mono truncate">
                      {device.os} • Direct LAN
                    </p>
                  </div>
                </div>

                {device.battery ? (
                  <M3BatteryPill level={device.battery.level} charging={device.battery.charging} />
                ) : (
                  <span className="text-[10px] font-semibold text-[#64748B] dark:text-[#94A3B8] bg-black/[0.04] dark:bg-white/[0.06] px-2.5 py-0.5 rounded-full font-mono">
                    Plugged
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Hardware Remote Tools Bento Box */}
      <div className="bento-card rounded-3xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-black/[0.05] dark:border-white/[0.06] bg-[#FBFBFD] dark:bg-[#161820] flex items-center justify-between">
          <div>
            <h3 className="font-display text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
              Hardware Remote Tools
            </h3>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
              Trigger sound alerts and browser actions across connected devices
            </p>
          </div>
          <M3SparklesIcon className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8]" />
        </div>

        <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {/* Row 1: Find My Android Phone */}
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors">
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#10B981]/10 text-[#10B981] flex items-center justify-center shrink-0">
                <M3VibrateIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
                  Find My Android Phone
                </p>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                  Loudly ring and vibrate the Android phone at maximum volume to locate it
                </p>
              </div>
            </div>

            <button
              onClick={triggerRingPhone}
              className={`apple-press self-start sm:self-auto shrink-0 px-4 py-2 rounded-2xl text-xs font-bold transition-all ${
                isRingingLocal
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-[#0F1115] hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-[#0B0D13] shadow-sm'
              }`}
            >
              {isRingingLocal ? 'Ringing...' : 'Ring Phone'}
            </button>
          </div>

          {/* Row 2: Ping Mac Speakers */}
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors">
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#0071E3]/10 dark:bg-[#38BDF8]/10 text-[#0071E3] dark:text-[#38BDF8] flex items-center justify-center shrink-0">
                <M3VolumeIcon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
                  Ping Mac Internal Audio
                </p>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                  Play crisp notification chime through Mac internal speakers
                </p>
              </div>
            </div>

            <button
              onClick={triggerPingMac}
              className="apple-press self-start sm:self-auto shrink-0 px-4 py-2 rounded-2xl text-xs font-semibold bg-[#F8FAFC] dark:bg-[#181C28] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.06] dark:border-white/[0.08] transition-colors"
            >
              Ping Mac
            </button>
          </div>

          {/* Row 3: Push Webpage to Mac Browser */}
          <div className="p-4 sm:p-5 space-y-3 hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-[#8B5CF6]/10 text-[#8B5CF6] flex items-center justify-center shrink-0">
                <Globe className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
                  Open Webpage on Mac
                </p>
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                  Beam any website or YouTube link directly into your Mac's default browser
                </p>
              </div>
            </div>

            <form onSubmit={handleOpenRemoteUrl} className="flex gap-2 pt-1 pl-0 sm:pl-13.5">
              <input
                type="text"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="e.g. google.com, youtube.com, or github.com"
                className="flex-1 bg-[#F8FAFC] dark:bg-[#181C28] text-xs px-4 py-2.5 rounded-2xl border border-black/[0.08] dark:border-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6] placeholder-[#64748B] focus:outline-none focus:border-[#0071E3] dark:focus:border-white font-sans transition-colors"
              />
              <button
                type="submit"
                disabled={!remoteUrl.trim()}
                className="apple-press px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-[#0B0D13] disabled:opacity-40 shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
              >
                <span>Launch</span>
                <ExternalLink className="w-3.5 h-3.5 text-white dark:text-[#0B0D13]" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* 3. Instant Peer Channel Quick Strip & Link to Full Chat */}
      <div className="bento-card rounded-3xl p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#0071E3] dark:bg-[#38BDF8]" />
            <h3 className="font-display text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6] tracking-tight">
              Peer Notes &amp; Instant Messaging
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tabular-nums text-[#64748B] dark:text-[#94A3B8] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06]">
              {chatMessages.length} {chatMessages.length === 1 ? 'item' : 'items'}
            </span>
            {onOpenChat && (
              <button
                onClick={onOpenChat}
                className="apple-press text-xs font-semibold text-[#0071E3] dark:text-[#38BDF8] hover:underline flex items-center gap-1 ml-1"
              >
                <span>Full Chat</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Messages Feed or Snug Placeholder */}
        <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
          {chatMessages.length === 0 ? (
            <div className="p-5 rounded-2xl bg-[#F8FAFC] dark:bg-[#181C28] border border-black/[0.03] dark:border-white/[0.04] text-center">
              <p className="font-display text-xs font-bold text-[#0F1115] dark:text-[#F3F4F6]">Peer Channel Ready</p>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                Send quick notes, Wi-Fi keys, addresses, or links between your devices.
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {chatMessages.slice(-3).map((msg, idx) => (
                <motion.div
                  key={msg.id || idx}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.1) }}
                  className="p-3.5 rounded-2xl bg-[#F8FAFC] dark:bg-[#181C28] border border-black/[0.04] dark:border-white/[0.06] text-xs text-[#0F1115] dark:text-[#F3F4F6]"
                >
                  <div className="flex items-center justify-between text-[10px] text-[#64748B] dark:text-[#94A3B8] mb-1 font-mono tabular-nums">
                    <span className="font-bold text-[#0F1115] dark:text-[#F3F4F6] font-sans">{msg.from}</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-xs text-[#0F1115] dark:text-[#F3F4F6] font-sans break-words whitespace-pre-wrap leading-relaxed">
                    {msg.text}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendChat} className="flex gap-2 pt-1">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type note or link to beam..."
            className="flex-1 bg-[#F8FAFC] dark:bg-[#181C28] text-xs px-4 py-2.5 rounded-2xl border border-black/[0.08] dark:border-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6] placeholder-[#64748B] focus:outline-none focus:border-[#0071E3] dark:focus:border-white font-sans transition-colors"
          />
          <button
            type="submit"
            disabled={!chatInput.trim()}
            className="apple-press px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-[#0B0D13] disabled:opacity-40 shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
          >
            <M3SendIcon className="w-3.5 h-3.5 text-white dark:text-[#0B0D13]" />
            <span>Beam</span>
          </button>
        </form>
      </div>
    </div>
  );
};
