import { useState, useEffect, useRef, useCallback } from 'react';
import { SoundEffects } from '../components/SoundEffects';

export interface ConnectedDevice {
  id: string;
  name: string;
  os: 'Android' | 'macOS' | 'Windows' | 'iOS' | 'Linux' | 'Browser';
  ip: string;
  connectedAt: number;
  battery?: {
    level: number;
    charging: boolean;
  } | null;
}

export interface ServerInfo {
  primaryIp: string;
  allIps: Array<{ interface: string; address: string; isWifi: boolean }>;
  port: number;
  url: string;
  hostname: string;
  downloadsDir: string;
  platform?: string;
  os?: string;
  isWindows?: boolean;
  isMac?: boolean;
  isLinux?: boolean;
  officeSecurity?: {
    enabled: boolean;
    requiresAuth: boolean;
    pin?: string;
  };
}

export interface ClipboardItem {
  id: string;
  text: string;
  from: string;
  timestamp: number;
  isUrl: boolean;
  isPhone: boolean;
}

export interface UploadedFileItem {
  name: string;
  originalName?: string;
  size: number;
  modifiedAt?: number;
  uploadedAt?: number;
  path: string;
  fullPath?: string;
  mimetype?: string;
  isSnap?: boolean;
  note?: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  from: string;
  fromId: string;
  timestamp: number;
}

export function deduplicateDevices(list: ConnectedDevice[]): ConnectedDevice[] {
  if (!Array.isArray(list)) return [];
  const map = new Map<string, ConnectedDevice>();
  for (const d of list) {
    if (!d) continue;
    const ip = (d.ip || 'local').replace(/^.*:/, '').trim().toLowerCase();
    const os = (d.os || 'unknown').trim().toLowerCase();
    const name = (d.name || '').trim().toLowerCase();
    // Unique key per physical device: IP + OS (and fallback to name/id if local)
    const key = `${ip}_${os}_${name}`;
    if (map.has(key)) {
      const existing = map.get(key)!;
      if (!existing.battery && d.battery) {
        map.set(key, d);
      }
    } else {
      map.set(key, d);
    }
  }
  return Array.from(map.values()).slice(0, 50);
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);

  // Office Room PIN & Security states
  const [officePin, setOfficePin] = useState<string>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlPin = urlParams.get('pin');
      if (urlPin) {
        localStorage.setItem('airbridge_office_pin', urlPin.trim());
        const cleanUrl = window.location.pathname + (window.location.hash || '');
        window.history.replaceState({}, document.title, cleanUrl);
        return urlPin.trim();
      }
      return localStorage.getItem('airbridge_office_pin') || '';
    } catch (e) {
      return '';
    }
  });

  const [isOfficeLocked, setIsOfficeLocked] = useState(false);
  const [officeSecurityEnabled, setOfficeSecurityEnabled] = useState(false);
  const officePinRef = useRef(officePin);
  officePinRef.current = officePin;
  
  // Persistent device ID - stable for the entire browser session
  const [myDeviceId] = useState<string>(() => {
    try {
      let id = localStorage.getItem('airbridge_device_id');
      if (!id) {
        id = 'dev_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('airbridge_device_id', id);
      }
      return id;
    } catch (e) {
      return 'dev_' + Math.random().toString(36).substring(2, 9);
    }
  });

  // Cached devices to prevent blank flash on refresh, strictly deduplicated
  const [devices, setDevices] = useState<ConnectedDevice[]>(() => {
    try {
      const cached = localStorage.getItem('airbridge_cached_devices');
      if (cached) {
        const parsed = JSON.parse(cached);
        const clean = deduplicateDevices(parsed);
        if (Array.isArray(parsed) && parsed.length > clean.length) {
          localStorage.setItem('airbridge_cached_devices', JSON.stringify(clean));
        }
        return clean;
      }
    } catch (e) {}
    return [];
  });

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  // Persistent Clipboard history
  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>(() => {
    try {
      const cached = localStorage.getItem('airbridge_clipboard_history');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });

  // Persistent Chat messages
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    try {
      const cached = localStorage.getItem('airbridge_chat_history');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });

  const [isRinging, setIsRinging] = useState(false);
  const [ringSource, setRingSource] = useState<string>('');
  const [recentUploadedFiles, setRecentUploadedFiles] = useState<UploadedFileItem[]>([]);
  const [activeToast, setActiveToast] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

  // Auto-detect this device
  const ua = navigator.userAgent;
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isWindows = /windows|win32|win64/i.test(ua);
  const isMac = /macintosh|mac os x/i.test(ua) && !isIOS;
  const isLinux = /linux/i.test(ua) && !isAndroid;

  let myOs: ConnectedDevice['os'] = 'Browser';
  if (isWindows) myOs = 'Windows';
  else if (isMac) myOs = 'macOS';
  else if (isAndroid) myOs = 'Android';
  else if (isIOS) myOs = 'iOS';
  else if (isLinux) myOs = 'Linux';

  let defaultDeviceName = 'Office Device';
  if (isWindows) defaultDeviceName = 'Windows PC';
  else if (isMac) defaultDeviceName = 'MacBook';
  else if (isAndroid) {
    const model = ua.match(/\b([A-Z0-9_-]+)\s+Build/i)?.[1];
    defaultDeviceName = model ? `${model} (Android)` : 'Android Phone';
  } else if (isIOS) {
    defaultDeviceName = /ipad/i.test(ua) ? 'iPad' : 'iPhone';
  } else if (isLinux) {
    defaultDeviceName = 'Linux PC';
  }

  const [deviceName, setDeviceName] = useState(
    () => localStorage.getItem('airbridge_device_name') || defaultDeviceName
  );

  const deviceNameRef = useRef(deviceName);
  deviceNameRef.current = deviceName;
  const myDeviceIdRef = useRef(myDeviceId);
  myDeviceIdRef.current = myDeviceId;

  // Sync state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('airbridge_chat_history', JSON.stringify(chatMessages));
    } catch (e) {}
  }, [chatMessages]);

  useEffect(() => {
    try {
      localStorage.setItem('airbridge_clipboard_history', JSON.stringify(clipboardItems));
    } catch (e) {}
  }, [clipboardItems]);

  useEffect(() => {
    if (devices.length > 0) {
      try {
        localStorage.setItem('airbridge_cached_devices', JSON.stringify(devices));
      } catch (e) {}
    }
  }, [devices]);

  const showToast = useCallback((msg: string) => {
    setActiveToast(msg);
    setTimeout(() => {
      setActiveToast((curr) => (curr === msg ? null : curr));
    }, 4000);
  }, []);

  const connect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const pinPart = officePinRef.current ? `&pin=${encodeURIComponent(officePinRef.current)}` : '';
    const wsUrl = `${protocol}//${host}/ws?id=${encodeURIComponent(myDeviceIdRef.current)}&name=${encodeURIComponent(deviceNameRef.current)}${pinPart}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setIsConnected(true);
        console.log('[WebSocket] Connected to AirBridge');

        // Fetch battery if available
        let batteryInfo = null;
        try {
          if ('getBattery' in navigator) {
            const b: any = await (navigator as any).getBattery();
            batteryInfo = {
              level: Math.round(b.level * 100),
              charging: b.charging,
            };
          }
        } catch (e) {}

        if (!batteryInfo && (isMac || isWindows)) {
          try {
            const res = await fetch('/api/battery', {
              headers: officePinRef.current ? { 'x-airbridge-pin': officePinRef.current } : {},
            });
            if (res.ok) {
              const data = await res.json();
              if (data.battery) batteryInfo = data.battery;
            }
          } catch (e) {}
        }

        // Identify this client with persistent device ID
        ws.send(JSON.stringify({
          type: 'identify',
          payload: {
            id: myDeviceIdRef.current,
            name: deviceNameRef.current,
            os: myOs,
            battery: batteryInfo,
          },
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'auth_required': {
              setIsOfficeLocked(true);
              setOfficeSecurityEnabled(true);
              break;
            }

            case 'auth_failed': {
              setIsOfficeLocked(true);
              showToast('Incorrect Office Room PIN');
              break;
            }

            case 'office_security_updated': {
              setOfficeSecurityEnabled(Boolean(data.officeSecurity?.enabled));
              if (data.officeSecurity?.pin) {
                setOfficePin(data.officeSecurity.pin);
                try {
                  localStorage.setItem('airbridge_office_pin', data.officeSecurity.pin);
                } catch (e) {}
              }
              break;
            }

            case 'init': {
              setIsOfficeLocked(false);
              if (data.officeSecurity) {
                setOfficeSecurityEnabled(Boolean(data.officeSecurity.enabled));
                if (data.officeSecurity.pin) {
                  setOfficePin(data.officeSecurity.pin);
                  try {
                    localStorage.setItem('airbridge_office_pin', data.officeSecurity.pin);
                  } catch (e) {}
                }
              }
              if (data.devices && Array.isArray(data.devices)) {
                const uniqueDevs = deduplicateDevices(data.devices);
                setDevices(uniqueDevs);
                try {
                  localStorage.setItem('airbridge_cached_devices', JSON.stringify(uniqueDevs));
                } catch (e) {}
              }
              // Merge server chat history with local messages
              if (data.chatHistory && Array.isArray(data.chatHistory)) {
                setChatMessages((prev) => {
                  const map = new Map<string, ChatMessage>();
                  data.chatHistory.forEach((m: ChatMessage) => map.set(m.id, m));
                  prev.forEach((m: ChatMessage) => map.set(m.id, m));
                  const merged = Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
                  try {
                    localStorage.setItem('airbridge_chat_history', JSON.stringify(merged));
                  } catch (e) {}
                  return merged;
                });
              }
              // Merge server clipboard history with local clipboard
              if (data.clipboardHistory && Array.isArray(data.clipboardHistory)) {
                setClipboardItems((prev) => {
                  const map = new Map<string, ClipboardItem>();
                  data.clipboardHistory.forEach((c: ClipboardItem) => map.set(c.id, c));
                  prev.forEach((c: ClipboardItem) => map.set(c.id, c));
                  const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
                  try {
                    localStorage.setItem('airbridge_clipboard_history', JSON.stringify(merged));
                  } catch (e) {}
                  return merged;
                });
              }
              if (data.serverInfo) {
                setServerInfo((prev) => ({
                  ...prev,
                  ...data.serverInfo,
                } as ServerInfo));
              }
              break;
            }

            case 'devices_update': {
              if (data.devices && Array.isArray(data.devices)) {
                const uniqueDevs = deduplicateDevices(data.devices);
                setDevices(uniqueDevs);
                try {
                  localStorage.setItem('airbridge_cached_devices', JSON.stringify(uniqueDevs));
                } catch (e) {}
              }
              break;
            }

            case 'clipboard_sync': {
              const incoming: ClipboardItem = data.payload;
              setClipboardItems((prev) => {
                if (prev.some((c) => c.id === incoming.id || (c.text === incoming.text && Math.abs(c.timestamp - incoming.timestamp) < 2000))) {
                  return prev;
                }
                showToast(`Synced clipboard from ${incoming.from}`);
                const next = [incoming, ...prev.slice(0, 49)];
                try {
                  localStorage.setItem('airbridge_clipboard_history', JSON.stringify(next));
                } catch (e) {}
                return next;
              });
              break;
            }

            case 'files_uploaded': {
              const files: UploadedFileItem[] = data.files || [];
              setRecentUploadedFiles((prev) => [...files, ...prev]);
              // Zero sound on file uploading / receiving
              if (data.sender && data.sender.toLowerCase() !== deviceName.toLowerCase()) {
                showToast(`Received ${files.length} file(s) from ${data.sender}!`);
              }
              break;
            }

            case 'file_deleted': {
              const deletedFilename = data.filename;
              if (deletedFilename) {
                setRecentUploadedFiles((prev) => prev.filter((f) => f.name !== deletedFilename));
                window.dispatchEvent(new CustomEvent('airbridge_file_deleted', { detail: { filename: deletedFilename } }));
              }
              break;
            }

            case 'ring_device': {
              const myOs = isAndroid ? 'android' : isMac ? 'mac' : 'browser';
              const target = data.target;

              if (target === 'all' || target === myOs) {
                setIsRinging(true);
                setRingSource(data.from || 'Remote Device');
                SoundEffects.startRinging();
              }
              break;
            }

            case 'toast': {
              showToast(data.message);
              break;
            }

            case 'chat_message': {
              const incoming: ChatMessage = data.payload;
              setChatMessages((prev) => {
                if (prev.some((m) => m.id === incoming.id)) {
                  return prev;
                }
                const next = [...prev, incoming];
                try {
                  localStorage.setItem('airbridge_chat_history', JSON.stringify(next));
                } catch (e) {}
                return next;
              });
              break;
            }

            case 'chat_cleared': {
              setChatMessages([]);
              try {
                localStorage.removeItem('airbridge_chat_history');
              } catch (e) {}
              showToast('Chat history cleared');
              break;
            }

            case 'clipboard_cleared': {
              setClipboardItems([]);
              try {
                localStorage.removeItem('airbridge_clipboard_history');
              } catch (e) {}
              showToast('Clipboard cleared');
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.error('Error handling WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (e) {
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      }
    }
  }, [isAndroid, isMac, showToast]);

  useEffect(() => {
    connect();

    // Fetch server info with optional office PIN
    const headers: Record<string, string> = {};
    if (officePinRef.current) {
      headers['x-airbridge-pin'] = officePinRef.current;
    }

    fetch('/api/info', { headers })
      .then((res) => res.json())
      .then((info) => {
        setServerInfo(info);
        if (info.officeSecurity) {
          setOfficeSecurityEnabled(Boolean(info.officeSecurity.enabled));
          if (info.officeSecurity.requiresAuth) {
            setIsOfficeLocked(true);
          } else {
            setIsOfficeLocked(false);
          }
          if (info.officeSecurity.pin) {
            setOfficePin(info.officeSecurity.pin);
            try {
              localStorage.setItem('airbridge_office_pin', info.officeSecurity.pin);
            } catch (e) {}
          }
        }
      })
      .catch((e) => console.log('Info fetch error:', e));

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Office PIN Verification
  const verifyAndSetOfficePin = useCallback(async (pin: string): Promise<boolean> => {
    const cleanPin = pin.trim();
    try {
      const res = await fetch('/api/office/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: cleanPin }),
      });
      if (res.ok) {
        setOfficePin(cleanPin);
        officePinRef.current = cleanPin;
        setIsOfficeLocked(false);
        try {
          localStorage.setItem('airbridge_office_pin', cleanPin);
        } catch (e) {}

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'authenticate', pin: cleanPin }));
        } else {
          connect();
        }
        showToast('Office Workspace Unlocked');
        return true;
      }
      showToast('Incorrect Office PIN');
      return false;
    } catch (e) {
      showToast('PIN Verification Failed');
      return false;
    }
  }, [connect, showToast]);

  // Office Security Configuration (Enable/Disable/Change PIN)
  const configureOfficeSecurity = useCallback(async (enabled: boolean, newPin?: string): Promise<boolean> => {
    try {
      const pinToSend = newPin || officePinRef.current;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (officePinRef.current) {
        headers['x-airbridge-pin'] = officePinRef.current;
      }
      const res = await fetch('/api/office/configure', {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled, pin: pinToSend }),
      });
      if (res.ok) {
        const data = await res.json();
        setOfficeSecurityEnabled(enabled);
        if (data.officeSecurity?.pin) {
          setOfficePin(data.officeSecurity.pin);
          officePinRef.current = data.officeSecurity.pin;
          try {
            localStorage.setItem('airbridge_office_pin', data.officeSecurity.pin);
          } catch (e) {}
        }
        showToast(enabled ? `Office Protection Active (PIN: ${data.officeSecurity?.pin})` : 'Office Protection Disabled');
        return true;
      }
      showToast('Failed to update office security');
      return false;
    } catch (e) {
      showToast('Failed to update office security');
      return false;
    }
  }, [showToast]);

  // Methods to trigger
  const sendClipboard = useCallback((text: string) => {
    if (!text.trim()) return;
    const isUrl = /^https?:\/\//i.test(text.trim());
    const isPhone = /^\+?[0-9\s-]{7,15}$/.test(text.trim());

    const item: ClipboardItem = {
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      text,
      from: deviceName,
      timestamp: Date.now(),
      isUrl,
      isPhone,
    };

    setClipboardItems((prev) => {
      const next = [item, ...prev.filter(c => c.text !== text).slice(0, 49)];
      try {
        localStorage.setItem('airbridge_clipboard_history', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'clipboard_sync',
        payload: item,
      }));
    }
  }, [deviceName]);

  const clearClipboard = useCallback(() => {
    setClipboardItems([]);
    try {
      localStorage.removeItem('airbridge_clipboard_history');
    } catch (e) {}
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear_clipboard' }));
    }
    const headers: Record<string, string> = {};
    if (officePinRef.current) headers['x-airbridge-pin'] = officePinRef.current;
    fetch('/api/clipboard/clear', { method: 'POST', headers }).catch(() => {});
  }, []);

  const ringDevice = useCallback((target: 'android' | 'mac' | 'all') => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'ring_device',
        target,
      }));
      showToast(`Ringing ${target === 'android' ? 'Android Device' : 'Host Device'}...`);
    }
  }, [showToast]);

  const dismissRing = useCallback(() => {
    setIsRinging(false);
    SoundEffects.stopRinging();
  }, []);

  const pingHost = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'ping_mac',
      }));
      showToast('Ping sent to host speakers');
    }
  }, [showToast]);

  const updateDeviceName = useCallback((newName: string) => {
    setDeviceName(newName);
    localStorage.setItem('airbridge_device_name', newName);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'identify',
        payload: { name: newName },
      }));
    }
  }, []);

  const sendChatMessage = useCallback((text: string) => {
    if (!text.trim()) return;
    const newMsg: ChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      text: text.trim(),
      from: deviceName,
      fromId: myDeviceId,
      timestamp: Date.now(),
    };

    setChatMessages((prev) => {
      const next = [...prev, newMsg];
      try {
        localStorage.setItem('airbridge_chat_history', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'send_message',
        payload: newMsg,
      }));
    }
  }, [deviceName, myDeviceId]);

  const clearChat = useCallback(() => {
    setChatMessages([]);
    try {
      localStorage.removeItem('airbridge_chat_history');
    } catch (e) {}
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear_chat' }));
    }
    const headers: Record<string, string> = {};
    if (officePinRef.current) headers['x-airbridge-pin'] = officePinRef.current;
    fetch('/api/chat/clear', { method: 'POST', headers }).catch(() => {});
  }, []);

  return {
    isConnected,
    devices,
    myDeviceId,
    deviceName,
    updateDeviceName,
    serverInfo,
    isAndroid,
    isMac,
    isWindows,
    isIOS,
    isLinux,
    officePin,
    isOfficeLocked,
    officeSecurityEnabled,
    verifyAndSetOfficePin,
    configureOfficeSecurity,
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
    pingMac: pingHost,
    pingHost,
    sendChatMessage,
    clearChat,
    showToast,
  };
}

