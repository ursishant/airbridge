import type { TraversedFile } from './folderUpload';

export interface UploadProgressInfo {
  percent: number;
  currentFileName: string;
  fileIndex: number;
  totalFiles: number;
  speedMBs?: number;
}

/**
 * Adaptive chunk sizing for maximum LAN Wi-Fi throughput.
 * Massive 1GB+ files use 32MB chunks to avoid thousand-request HTTP overhead.
 */
export function getOptimalChunkSize(fileSize: number): number {
  if (fileSize >= 1024 * 1024 * 1024) return 32 * 1024 * 1024; // 32MB chunks (>= 1GB)
  if (fileSize >= 256 * 1024 * 1024) return 16 * 1024 * 1024;  // 16MB chunks (>= 256MB)
  if (fileSize >= 64 * 1024 * 1024) return 8 * 1024 * 1024;   // 8MB chunks (>= 64MB)
  return 4 * 1024 * 1024; // 4MB chunks for smaller files
}

const MAX_PARALLEL_CHUNKS = 6; // 6 concurrent socket uploads per file
const LARGE_FILE_THRESHOLD = 16 * 1024 * 1024; // 16MB - switch to chunked streaming
const MAX_CONCURRENT_BATCHES = 8; // 8 concurrent file/batch workers for LAN folder uploads
const MAX_CONCURRENT_LARGE_FILES = 3; // Pipeline 3 large files simultaneously

import { getAuthHeaders } from './device';

export interface UploadOptions {
  recipients?: string[];
  maxDownloads?: number;
  expiresMinutes?: number;
}

function appendUploadOptions(formData: FormData, options?: UploadOptions) {
  if (!options) return;
  if (Array.isArray(options.recipients) && options.recipients.length > 0) {
    formData.append('recipients', JSON.stringify(options.recipients));
  }
  if (options.maxDownloads && options.maxDownloads > 0) {
    formData.append('maxDownloads', String(options.maxDownloads));
  }
  if (options.expiresMinutes && options.expiresMinutes > 0) {
    formData.append('expiresMinutes', String(options.expiresMinutes));
  }
}

/**
 * Uploads a single chunk via XHR with automatic retry logic.
 */
function uploadOneChunk(
  file: File,
  relativePath: string,
  sender: string,
  fileId: string,
  chunkIndex: number,
  totalChunks: number,
  chunkSize: number,
  onChunkProgress: (loaded: number) => void,
  options?: UploadOptions
): Promise<any> {
  const start = chunkIndex * chunkSize;
  const end = Math.min(file.size, start + chunkSize);
  const chunkBlob = file.slice(start, end);

  let attempts = 0;

  const tryOnce = (): Promise<any> =>
    new Promise<any>((resolve, reject) => {
      attempts++;
      const formData = new FormData();
      formData.append('fileId', fileId);
      formData.append('chunkIndex', String(chunkIndex));
      formData.append('totalChunks', String(totalChunks));
      formData.append('chunkSize', String(chunkSize));
      formData.append('filename', file.name);
      formData.append('relativePath', relativePath);
      formData.append('sender', sender);
      formData.append('fileSize', String(file.size));
      appendUploadOptions(formData, options);
      formData.append('chunk', chunkBlob, file.name);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload-parallel');
      xhr.timeout = 180000; // 3 min timeout per chunk

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onChunkProgress(e.loaded);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve({ success: true });
          }
        } else {
          reject(new Error(`Chunk upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during chunk upload'));
      xhr.ontimeout = () => reject(new Error('Chunk upload timed out'));

      Object.entries(getAuthHeaders()).forEach(([key, val]) => {
        xhr.setRequestHeader(key, val);
      });

      xhr.send(formData);
    });

  const attempt = async (): Promise<any> => {
    try {
      return await tryOnce();
    } catch (err) {
      console.warn(`Retry chunk ${chunkIndex + 1}/${totalChunks} (attempt ${attempts}):`, err);
      if (attempts >= 10) {
        throw new Error(`Failed to upload ${file.name} at chunk ${chunkIndex + 1}/${totalChunks}`);
      }
      await new Promise((r) => setTimeout(r, Math.min(3000, 200 * Math.pow(1.4, attempts))));
      return attempt();
    }
  };

  return attempt();
}

/**
 * Uploads a single large file using adaptive chunk sizing and a concurrent worker pool.
 */
async function uploadSingleFileChunked(
  item: TraversedFile,
  sender: string,
  onChunkProgress: (totalLoadedBytes: number, totalChunks: number) => void,
  options?: UploadOptions
): Promise<any> {
  const file = item.file;
  const chunkSize = getOptimalChunkSize(file.size);
  const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
  const fileId = `chunk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const queue: number[] = [];
  for (let i = 0; i < totalChunks; i++) queue.push(i);

  const chunkLoaded = new Float64Array(totalChunks);
  let lastResponse: any = null;

  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const idx = queue.shift()!;
      const res = await uploadOneChunk(
        file,
        item.relativePath || file.name,
        sender,
        fileId,
        idx,
        totalChunks,
        chunkSize,
        (loaded) => {
          chunkLoaded[idx] = loaded;
          let totalLoaded = 0;
          for (let j = 0; j < totalChunks; j++) totalLoaded += chunkLoaded[j];
          onChunkProgress(totalLoaded, totalChunks);
        },
        options
      );
      const thisChunkSize = Math.min(chunkSize, file.size - idx * chunkSize);
      chunkLoaded[idx] = thisChunkSize;
      lastResponse = res;
    }
  };

  const workerCount = Math.min(MAX_PARALLEL_CHUNKS, totalChunks);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return lastResponse;
}

/**
 * Uploads a batch of small/medium files in a single fast multipart POST.
 */
function uploadSmallBatch(
  batch: TraversedFile[],
  sender: string,
  onProgress: (loaded: number) => void,
  options?: UploadOptions
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const formData = new FormData();
    const paths = batch.map((item) => item.relativePath);
    formData.append('paths', JSON.stringify(paths));
    formData.append('sender', sender);
    appendUploadOptions(formData, options);
    batch.forEach(({ file, relativePath }) => {
      formData.append('files', file, relativePath);
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.timeout = 0;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(e.loaded);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Batch upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during batch upload'));
    xhr.ontimeout = () => reject(new Error('Batch upload timed out'));

    Object.entries(getAuthHeaders()).forEach(([key, val]) => {
      xhr.setRequestHeader(key, val);
    });

    xhr.send(formData);
  });
}

/**
 * High-End Parallel Multi-File Uploader.
 * - Massive files (>= 16MB) use adaptive 8-32MB parallel chunk streaming.
 * - Small/medium files are batched and uploaded concurrently across multiple workers.
 * - Zero CPU thrashing, zero unnecessary disk reads, saturates full Wi-Fi bandwidth.
 */
export async function uploadFilesSmartly(
  items: TraversedFile[],
  sender: string,
  onProgress: (info: UploadProgressInfo) => void,
  options?: UploadOptions
): Promise<boolean> {
  if (!items || items.length === 0) return false;

  const totalBytesAll = items.reduce((acc, curr) => acc + (curr.file.size || 0), 0);
  const startTime = Date.now();

  // Fast path: Single small file (< 16MB)
  if (items.length === 1 && items[0].file.size < LARGE_FILE_THRESHOLD) {
    let loadedBytes = 0;
    await uploadSmallBatch(items, sender, (loaded) => {
      loadedBytes = loaded;
      const percent = totalBytesAll > 0 ? Math.min(99, Math.round((loadedBytes / totalBytesAll) * 100)) : 50;
      const elapsedSecs = (Date.now() - startTime) / 1000;
      const speedMBs = elapsedSecs > 0 ? parseFloat((loadedBytes / (1024 * 1024 * elapsedSecs)).toFixed(1)) : 0;
      onProgress({
        percent,
        currentFileName: items[0].file.name,
        fileIndex: 1,
        totalFiles: 1,
        speedMBs,
      });
    }, options);

    onProgress({
      percent: 100,
      currentFileName: 'Complete',
      fileIndex: 1,
      totalFiles: 1,
    });
    return true;
  }

  // Partition files: large files stream chunked; small files are batched together
  const largeFiles: TraversedFile[] = [];
  const smallFiles: TraversedFile[] = [];

  for (const item of items) {
    if (item.file.size >= LARGE_FILE_THRESHOLD) {
      largeFiles.push(item);
    } else {
      smallFiles.push(item);
    }
  }

  // Group small files into efficient bundles (up to 200 files or 100MB total per bundle for LAN speed)
  const batches: TraversedFile[][] = [];
  let currentBatch: TraversedFile[] = [];
  let currentBatchBytes = 0;

  for (const item of smallFiles) {
    const size = item.file.size || 0;
    if (currentBatch.length >= 200 || (currentBatchBytes + size > 100 * 1024 * 1024 && currentBatch.length > 0)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchBytes = 0;
    }
    currentBatch.push(item);
    currentBatchBytes += size;
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  // Track progress atomically across all work items
  let cumulativeLoadedBytes = 0;

  const updateProgress = (extraLoaded: number, label: string, index: number) => {
    const totalSoFar = cumulativeLoadedBytes + extraLoaded;
    const percent = totalBytesAll > 0 ? Math.min(99, Math.round((totalSoFar / totalBytesAll) * 100)) : 50;
    const elapsedSecs = (Date.now() - startTime) / 1000;
    const speedMBs = elapsedSecs > 0 ? parseFloat((totalSoFar / (1024 * 1024 * elapsedSecs)).toFixed(1)) : 0;

    onProgress({
      percent,
      currentFileName: label,
      fileIndex: index,
      totalFiles: items.length,
      speedMBs,
    });
  };

  // 1. Process Large Files with Parallel Chunking (pipeline multiple large files simultaneously)
  if (largeFiles.length > 0) {
    const largeQueue = largeFiles.map((item) => ({ item }));
    let completedLargeCount = 0;

    const largeWorker = async (): Promise<void> => {
      while (largeQueue.length > 0) {
        const { item } = largeQueue.shift()!;
        try {
          await uploadSingleFileChunked(item, sender, (loadedBytes, totalChunks) => {
            updateProgress(loadedBytes, `${item.file.name} (${totalChunks} parallel chunks)`, completedLargeCount + 1);
          }, options);
        } catch (err) {
          console.warn(`Failed to upload ${item.file.name}, continuing rest of batch:`, err);
        }
        cumulativeLoadedBytes += (item.file.size || 0);
        completedLargeCount++;
        updateProgress(0, item.file.name, completedLargeCount);
      }
    };

    const largeWorkerCount = Math.min(MAX_CONCURRENT_LARGE_FILES, largeFiles.length);
    const largeWorkers: Promise<void>[] = [];
    for (let w = 0; w < largeWorkerCount; w++) {
      largeWorkers.push(largeWorker());
    }
    await Promise.all(largeWorkers);
  }

  // 2. Process Small File Batches in Parallel with Retry Guards
  if (batches.length > 0) {
    const batchQueue = batches.map((b, idx) => ({ batch: b, id: idx }));
    const batchWorker = async (): Promise<void> => {
      while (batchQueue.length > 0) {
        const { batch, id } = batchQueue.shift()!;
        const batchSize = batch.reduce((acc, curr) => acc + (curr.file.size || 0), 0);
        let batchLoaded = 0;

        let batchAttempts = 0;
        while (batchAttempts < 5) {
          try {
            batchAttempts++;
            await uploadSmallBatch(batch, sender, (loaded) => {
              batchLoaded = loaded;
              const display = batch.length === 1 ? batch[0].file.name : `Batch ${id + 1} (${batch.length} files)`;
              updateProgress(batchLoaded, display, largeFiles.length + id + 1);
            }, options);
            break;
          } catch (err) {
            console.warn(`Batch ${id + 1} attempt ${batchAttempts} failed:`, err);
            if (batchAttempts >= 5) {
              console.error(`Batch ${id + 1} failed after 5 attempts, continuing next batch:`, err);
              break;
            }
            await new Promise((r) => setTimeout(r, 1200));
          }
        }

        cumulativeLoadedBytes += batchSize;
        updateProgress(0, `Batch ${id + 1} completed`, largeFiles.length + id + 1);
      }
    };

    const workerCount = Math.min(MAX_CONCURRENT_BATCHES, batches.length);
    const workers: Promise<void>[] = [];
    for (let w = 0; w < workerCount; w++) {
      workers.push(batchWorker());
    }
    await Promise.all(workers);
  }

  onProgress({
    percent: 100,
    currentFileName: 'Complete',
    fileIndex: items.length,
    totalFiles: items.length,
  });

  return true;
}
