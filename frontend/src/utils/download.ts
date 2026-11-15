function getStoredOfficePin(): string {
  try {
    return localStorage.getItem('airbridge_office_pin') || '';
  } catch (e) {
    return '';
  }
}

/**
 * Resilient multi-tier file downloader that effortlessly handles files of any size (up to 10GB+)
 * without running out of browser memory and without triggering Chrome's insecure download warnings.
 */
export async function downloadFileSafely(
  url: string,
  filename: string,
  fileSize?: number
): Promise<boolean> {
  const pin = getStoredOfficePin();
  let authedUrl = url;
  if (pin && !authedUrl.includes('pin=')) {
    authedUrl += (authedUrl.includes('?') ? '&' : '?') + `pin=${encodeURIComponent(pin)}`;
  }

  const isLarge = fileSize ? fileSize >= 100 * 1024 * 1024 : false;
  const authHeaders: Record<string, string> = { 'Accept': '*/*' };
  if (pin) authHeaders['x-airbridge-pin'] = pin;

  // Tier 1: File System Access API (Desktop Chrome / Edge / Opera)
  // Streams directly to disk chunk by chunk with 0MB browser heap memory!
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window && isLarge) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
      });
      const writable = await handle.createWritable();
      const response = await fetch(authedUrl, { headers: authHeaders });
      if (response.ok && response.body) {
        await response.body.pipeTo(writable);
        return true;
      }
    } catch (pickerErr: any) {
      if (pickerErr.name === 'AbortError') {
        // User voluntarily dismissed the save dialog
        return true;
      }
      console.warn('showSaveFilePicker stream failed, switching to streaming iframe:', pickerErr);
    }
  }

  // Tier 2: In-Memory Blob URL (Best for files < 100MB, completely avoids Chrome HTTP download warnings)
  if (!isLarge) {
    try {
      const response = await fetch(authedUrl, {
        method: 'GET',
        headers: authHeaders,
      });

      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          try { document.body.removeChild(link); } catch (e) {}
          window.URL.revokeObjectURL(blobUrl);
        }, 3000);

        return true;
      }
    } catch (blobErr) {
      console.warn('In-memory blob download failed, falling back to stream:', blobErr);
    }
  }

  // Tier 3: Native Browser Stream via Hidden Iframe
  // The server provides Content-Disposition: attachment, so the native Android / macOS
  // download manager intercepts the stream directly to storage without memory exhaustion.
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = authedUrl;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch (e) {}
    }, 120000);
    return true;
  } catch (iframeErr) {
    // Ultimate fallback: direct link trigger
    try {
      const link = document.createElement('a');
      link.href = authedUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try { document.body.removeChild(link); } catch (e) {}
      }, 3000);
      return true;
    } catch (e) {
      console.error('All download mechanisms failed:', e);
      return false;
    }
  }
}
