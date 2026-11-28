import React, { useState } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import type { ConnectedDevice, ChatMessage, ServerInfo } from '../hooks/useWebSocket';
import { deduplicateDevices } from '../hooks/useWebSocket';
import { getAuthHeaders } from '../utils/device';
import { M3BatteryPill, M3VolumeIcon, M3VibrateIcon } from './M3Icons';
import { DeviceOsIcon, getHostLabel } from './DeviceOsIcon';

interface DeviceRemoteToolsProps {
  devices: ConnectedDevice[];
  chatMessages: ChatMessage[];
  serverInfo?: ServerInfo | null;
  onRingPhone: () => void;
  onPingMac: () => void;
  onSendMessage: (text: string) => void;
  showToast: (msg: string) => void;
  onOpenChat?: () => void;
}

export const DeviceRemoteTools: React.FC<DeviceRemoteToolsProps> = ({
  devices,
  serverInfo,
  onRingPhone,
  onPingMac,
  showToast,
}) => {
  const [remoteUrl, setRemoteUrl] = useState('');
  const [isRingingLocal, setIsRingingLocal] = useState(false);

  const hostLabel = getHostLabel(serverInfo);

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
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ url: formattedUrl }),
      });

      if (res.ok) {
        showToast(`Opened on ${hostLabel}`);
        setRemoteUrl('');
      } else {
        showToast('Failed to open URL');
      }
    } catch (e) {
      showToast('Error sending URL');
    }
  };

  const triggerRingPhone = () => {
    setIsRingingLocal(true);
    onRingPhone();
    showToast('Ringing paired phones...');
    setTimeout(() => setIsRingingLocal(false), 5000);
  };

  const triggerPingMac = () => {
    onPingMac();
    showToast(`Chime played on ${hostLabel}`);
  };

  const cleanDevices = deduplicateDevices(devices);
  const displayDevices =
    cleanDevices.length > 0
      ? cleanDevices
      : [
          {
            id: 'local_host',
            name: `${hostLabel} Host`,
            os: hostLabel as any,
            ip: serverInfo?.primaryIp || '127.0.0.1',
            connectedAt: Date.now(),
            battery: null,
          },
        ];

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6">
      {/* Connected Devices */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-display text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            Devices
          </h2>
          <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
            {displayDevices.length} online
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {displayDevices.map((device) => (
            <div key={device.id} className="ab-card-flush px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
                >
                  <DeviceOsIcon os={device.os || device.name} className="w-5 h-5" active />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                    {device.name}
                  </p>
                  <p className="text-[11px] font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>
                    {device.os}
                  </p>
                </div>
              </div>

              {device.battery ? (
                <M3BatteryPill level={device.battery.level} charging={device.battery.charging} />
              ) : (
                <span className="text-[11px] font-mono" style={{ color: 'var(--success)' }}>
                  Online
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Remote Actions */}
      <div className="space-y-2.5">
        <h3 className="font-display text-sm font-bold px-1" style={{ color: 'var(--text-primary)' }}>
          Remote Actions
        </h3>

        <div className="ab-card divide-y" style={{ borderColor: 'var(--border)' }}>
          <div className="p-4 flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <M3VibrateIcon className="w-5 h-5 shrink-0" style={{ color: 'var(--success)' }} />
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Find Phone
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                  Ring and vibrate connected mobile devices
                </p>
              </div>
            </div>

            <button
              onClick={triggerRingPhone}
              className={`shrink-0 ${
                isRingingLocal
                  ? 'ab-btn bg-rose-600 text-white h-9 px-4 text-xs'
                  : 'ab-btn ab-btn-primary h-9 px-4 text-xs'
              }`}
            >
              {isRingingLocal ? 'Ringing...' : 'Ring'}
            </button>
          </div>

          <div className="p-4 flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <M3VolumeIcon className="w-5 h-5 shrink-0" style={{ color: 'var(--accent)' }} />
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Ping {hostLabel}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                  Play an audio chime on {hostLabel} speakers
                </p>
              </div>
            </div>

            <button onClick={triggerPingMac} className="ab-btn ab-btn-ghost h-9 px-4 text-xs shrink-0">
              Ping
            </button>
          </div>

          <div className="p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <Globe className="w-5 h-5 shrink-0" style={{ color: 'var(--accent)' }} />
              <div className="min-w-0">
                <p className="font-display text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Open URL on {hostLabel}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                  Launch any webpage in the host browser
                </p>
              </div>
            </div>

            <form onSubmit={handleOpenRemoteUrl} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="https://example.com"
                className="ab-input flex-1 text-xs h-9 px-3.5"
              />
              <button type="submit" disabled={!remoteUrl.trim()} className="ab-btn ab-btn-primary h-9 px-4 text-xs w-full sm:w-auto shrink-0">
                <span>Open</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
