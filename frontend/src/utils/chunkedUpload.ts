import type { TraversedFile } from './folderUpload';

export interface UploadProgressInfo {
  percent: number;
  currentFileName: string;
  fileIndex: number;
  totalFiles: number;
  speedMBs?: number;
}

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks for rock-solid stability on LAN Wi-Fi
const LARGE_FILE_THRESHOLD = 20 * 1024 * 1024; // 20MB threshold to switch to chunked streaming

/**
 * Uploads a single large file in 10MB slices to /api/upload-chunk with automatic retries.
 */
async function uploadSingleFileChunked(
  item: TraversedFile,
  sender: string,
  onChunkProgress: (bytesThisChunk: number, chunkIndex: number, totalChunks: number) => void
): Promise<any> {
  const file = item.file;
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const fileId = `chunk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  let lastResponse = null;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    const chunkBlob = file.slice(start, end);

    let attempts = 0;
    let chunkUploaded = false;

    while (attempts < 3 && !chunkUploaded) {
      try {
        attempts++;
        const formData = new FormData();
        formData.append('fileId', fileId);
        formData.append('chunkIndex', String(chunkIndex));
        formData.append('totalChunks', String(totalChunks));
        formData.append('filename', file.name);
        formData.append('relativePath', item.relativePath || file.name);
        formData.append('sender', sender);
        formData.append('fileSize', String(file.size));
        formData.append('chunk', chunkBlob, file.name);

        const res = await new Promise<any>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/upload-chunk');
          xhr.timeout = 180000; // 3 minute timeout per 10MB chunk

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              onChunkProgress(e.loaded, chunkIndex, totalChunks);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch (err) {
                resolve({ success: true });
              }
            } else {
              reject(new Error(`Chunk upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during chunk upload'));
          xhr.ontimeout = () => reject(new Error('Chunk upload timed out'));

          xhr.send(formData);
        });

        lastResponse = res;
        chunkUploaded = true;
      } catch (err) {
        console.warn(`Retry chunk ${chunkIndex + 1}/${totalChunks} (attempt ${attempts}):`, err);
        if (attempts >= 3) {
          throw new Error(`Failed to upload ${file.name} at chunk ${chunkIndex + 1}/${totalChunks}`);
        }
        // Small delay before retry
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  return lastResponse;
}

/**
 * Uploads a collection of files or a full folder tree.
 * Automatically chooses between direct fast upload and resilient chunked streaming.
 */
export async function uploadFilesSmartly(
  items: TraversedFile[],
  sender: string,
  onProgress: (info: UploadProgressInfo) => void
): Promise<boolean> {
  if (!items || items.length === 0) return false;

  const totalBytesAll = items.reduce((acc, curr) => acc + (curr.file.size || 0), 0);
  const hasLargeFile = items.some((item) => item.file.size >= LARGE_FILE_THRESHOLD);

  // If all files are small (< 20MB) and total batch is < 30MB, use single fast multipart upload
  if (!hasLargeFile && totalBytesAll < 30 * 1024 * 1024) {
    const formData = new FormData();
    const paths = items.map((item) => item.relativePath);
    formData.append('paths', JSON.stringify(paths));
    formData.append('sender', sender);
    items.forEach(({ file, relativePath }) => {
      formData.append('files', file, relativePath);
    });

    return new Promise<boolean>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload');
      xhr.timeout = 0;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
          onProgress({
            percent,
            currentFileName: items.length === 1 ? items[0].file.name : `${items.length} files`,
            fileIndex: 1,
            totalFiles: items.length,
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress({
            percent: 100,
            currentFileName: 'Complete',
            fileIndex: items.length,
            totalFiles: items.length,
          });
          resolve(true);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.ontimeout = () => reject(new Error('Upload timed out'));

      xhr.send(formData);
    });
  }

  // Otherwise, use sequential resilient file streaming
  let cumulativeBytesUploaded = 0;
  const startTime = Date.now();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const file = item.file;
    const fileBytes = file.size || 0;

    if (file.size >= LARGE_FILE_THRESHOLD) {
      // Chunked streaming for large file
      await uploadSingleFileChunked(item, sender, (bytesThisChunk, chunkIdx, totalChunks) => {
        const fileProgressBytes = (chunkIdx * CHUNK_SIZE) + bytesThisChunk;
        const totalSoFar = cumulativeBytesUploaded + fileProgressBytes;
        const percent = totalBytesAll > 0 ? Math.min(99, Math.round((totalSoFar / totalBytesAll) * 100)) : 50;

        const elapsedSecs = (Date.now() - startTime) / 1000;
        const speedMBs = elapsedSecs > 0 ? parseFloat((totalSoFar / (1024 * 1024 * elapsedSecs)).toFixed(1)) : 0;

        onProgress({
          percent,
          currentFileName: `${file.name} (Chunk ${chunkIdx + 1}/${totalChunks})`,
          fileIndex: i + 1,
          totalFiles: items.length,
          speedMBs,
        });
      });
    } else {
      // Small file inside mixed batch
      const formData = new FormData();
      formData.append('paths', JSON.stringify([item.relativePath]));
      formData.append('sender', sender);
      formData.append('files', file, item.relativePath);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/upload');
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Failed to upload ${file.name}`));
          }
        };
        xhr.onerror = () => reject(new Error(`Network error uploading ${file.name}`));
        xhr.send(formData);
      });
    }

    cumulativeBytesUploaded += fileBytes;
    const overallPercent = totalBytesAll > 0 ? Math.min(99, Math.round((cumulativeBytesUploaded / totalBytesAll) * 100)) : 100;
    onProgress({
      percent: overallPercent,
      currentFileName: file.name,
      fileIndex: i + 1,
      totalFiles: items.length,
    });
  }

  onProgress({
    percent: 100,
    currentFileName: 'Complete',
    fileIndex: items.length,
    totalFiles: items.length,
  });

  return true;
}
