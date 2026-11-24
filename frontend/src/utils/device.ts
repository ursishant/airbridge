export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('airbridge_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('airbridge_device_id', id);
    }
    return id;
  } catch {
    return 'dev_' + Math.random().toString(36).substring(2, 9);
  }
}

export function getDeviceName(): string {
  try {
    const stored = localStorage.getItem('airbridge_device_name');
    if (stored) return stored;
  } catch {}

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPad|iPhone|iPod/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android Device';
  if (/Macintosh/.test(ua)) return 'MacBook';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux Device';
  return 'Colleague Device';
}

export function getOfficePin(): string {
  try {
    return localStorage.getItem('airbridge_office_pin') || '';
  } catch {
    return '';
  }
}

export function getHostToken(): string {
  try {
    return localStorage.getItem('airbridge_host_token') || '';
  } catch {
    return '';
  }
}

export function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'x-airbridge-device-id': getDeviceId(),
    ...extra,
  };
  const pin = getOfficePin();
  if (pin) {
    headers['x-airbridge-pin'] = pin;
  }
  const hostToken = getHostToken();
  if (hostToken) {
    headers['x-airbridge-host-token'] = hostToken;
  }
  return headers;
}
