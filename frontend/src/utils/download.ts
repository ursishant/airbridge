import { getDeviceId, getAuthHeaders } from './device';

function getStoredOfficePin(): string {
  try {
    return localStorage.getItem('airbridge_office_pin') || '';
  } catch (e) {
    return '';
  }
}

export interface DownloadProgressInfo {
  percent: number;
  speedMBs?: number;
}

function getOptimalDownloadChunkSize(fileSize: number): number {
  if (fileSize >= 1024 * 1024 * 1024) return 32 * 1024 * 1024; // 32MB ranges
  if (fileSize >= 256 * 1024 * 1024) return 16 * 1024 * 1024;  // 16MB ranges
  if (fileSize >= 64 * 1024 * 1024) return 8 * 1024 * 1024;   // 8MB ranges
  return 4 * 1024 * 1024; // 4MB ranges
}

const MAX_PARALLEL_RANGES = 8;
const PARALLEL_DOWNLOAD_MIN_SIZE = 16 * 1024 * 1024; // 16MB threshold
const PARALLEL_MAX_BUFFER_SIZE = 1024 * 1024 * 1024;  // 1GB max in-memory buffer for desktop

const isMobile = typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);

/**
 * Downloads a single byte-range with automatic retry.
 */
async function fetchRange(
  rangedUrl: string,
  start: number,
  end: number,
  authHeaders: Record<string, string>,
  onProgress?: (loaded: number) => void
): Promise<ArrayBuffer> {
  let attempts = 0;
  const maxAttempts = 3;

  while (true) {
    attempts++;
    try {
      const response = await fetch(rangedUrl, {
        headers: {
          ...authHeaders,
          Range: `bytes=${start}-${end}`,
        },
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(`Range request failed with status ${response.status}`);
      }

      if (onProgress) {
        onProgress(end - start + 1);
      }

      return await response.arrayBuffer();
    } catch (err) {
      console.warn(`Range ${start}-${end} attempt ${attempts} failed:`, err);
      if (attempts >= maxAttempts) {
        throw new Error(`Failed to download range ${start}-${end} after ${maxAttempts} attempts`);
      }
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

/**
 * Downloads a file using parallel range-based requests.
 * Uses adaptive range slicing and concurrent HTTP connections.
 */
async function downloadFileParallel(
  url: string,
  filename: string,
  fileSize: number,
  onProgress?: (info: DownloadProgressInfo) => void
): Promise<boolean> {
  const authHeaders: Record<string, string> = getAuthHeaders({ Accept: '*/*' });

  const rangedUrl = url.replace('/api/files/', '/api/files-ranged/');
  const chunkSize = getOptimalDownloadChunkSize(fileSize);
  const totalRanges = Math.ceil(fileSize / chunkSize);

  const ranges: Array<{ index: number; start: number; end: number }> = [];
  for (let i = 0; i < totalRanges; i++) {
    const start = i * chunkSize;
    const end = Math.min(fileSize - 1, start + chunkSize - 1);
    ranges.push({ index: i, start, end });
  }

  const rangeLoaded = new Float64Array(totalRanges);
  const startTime = Date.now();

  const reportProgress = () => {
    if (!onProgress) return;
    let totalLoaded = 0;
    for (let i = 0; i < totalRanges; i++) totalLoaded += rangeLoaded[i];
    const percent = Math.min(99, Math.round((totalLoaded / fileSize) * 100));
    const elapsedSecs = (Date.now() - startTime) / 1000;
    const speedMBs = elapsedSecs > 0
      ? parseFloat((totalLoaded / (1024 * 1024 * elapsedSecs)).toFixed(1))
      : 0;
    onProgress({ percent, speedMBs });
  };

  const buffers: ArrayBuffer[] = new Array(totalRanges);
  const queue = ranges.map((r) => r);

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const range = queue.shift()!;
      const buf = await fetchRange(rangedUrl, range.start, range.end, authHeaders, (loaded) => {
        rangeLoaded[range.index] = loaded;
        reportProgress();
      });
      buffers[range.index] = buf;
      rangeLoaded[range.index] = range.end - range.start + 1;
      reportProgress();
    }
  };

  const workerCount = Math.min(MAX_PARALLEL_RANGES, totalRanges);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const blob = new Blob(buffers, { type: 'application/octet-stream' });
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

  if (onProgress) onProgress({ percent: 100 });
  return true;
}

/**
 * Resilient high-throughput multi-tier file downloader.
 * - Files >= 16MB (up to 400MB) use 6-channel parallel range acceleration.
 * - Huge files (400MB+) stream directly to disk with File System Access API or browser native download manager.
 * - Folders and ZIP archives stream directly at full disk speed with 0 CPU overhead.
 */
export async function downloadFileSafely(
  url: string,
  filename: string,
  fileSize?: number
): Promise<boolean> {
  const pin = getStoredOfficePin();
  const devId = getDeviceId();
  let authedUrl = url;
  if (pin && !authedUrl.includes('pin=')) {
    authedUrl += (authedUrl.includes('?') ? '&' : '?') + `pin=${encodeURIComponent(pin)}`;
  }
  if (devId && !authedUrl.includes('deviceId=')) {
    authedUrl += (authedUrl.includes('?') ? '&' : '?') + `deviceId=${encodeURIComponent(devId)}`;
  }

  const authHeaders: Record<string, string> = getAuthHeaders({ Accept: '*/*' });

  // On Mobile (Android / iOS): ALWAYS stream directly via native OS download manager!
  // Android DownloadManager / iOS Safari streams directly to device storage at full gigabit Wi-Fi line rate
  // with zero JavaScript memory allocation, zero browser tab freezing, and native progress in notification bar.
  if (isMobile) {
    const fullAuthedUrl = authedUrl.startsWith('http') ? authedUrl : `${window.location.origin}${authedUrl}`;
    const link = document.createElement('a');
    link.href = fullAuthedUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try { document.body.removeChild(link); } catch (e) {}
    }, 4000);
    return true;
  }

  // Tier 1: File System Access API (Desktop Chrome / Edge / Opera)
  // Direct chunk-by-chunk disk write with 0MB heap memory — best for giant multi-gigabyte files!
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window && fileSize && fileSize >= PARALLEL_MAX_BUFFER_SIZE) {
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
      if (pickerErr.name === 'AbortError') return true;
      console.warn('showSaveFilePicker failed, trying parallel range:', pickerErr);
    }
  }

  // Tier 2: Parallel Range-based Multi-Channel Download (Files 16MB - 400MB)
  if (fileSize && fileSize >= PARALLEL_DOWNLOAD_MIN_SIZE && fileSize <= PARALLEL_MAX_BUFFER_SIZE && url.includes('/api/files/')) {
    try {
      const result = await downloadFileParallel(url, filename, fileSize);
      if (result) return true;
    } catch (parallelErr) {
      console.warn('Parallel range download failed, falling back:', parallelErr);
    }
  }

  // Tier 3: Direct Native Browser Stream (Best for ZIP downloads and massive files)
  // Streams directly to disk via browser native download manager at full NVMe/Wi-Fi speed
  try {
    const link = document.createElement('a');
    link.href = authedUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try { document.body.removeChild(link); } catch (e) {}
    }, 5000);
    return true;
  } catch (linkErr) {
    console.error('All download mechanisms failed:', linkErr);
    return false;
  }
}
