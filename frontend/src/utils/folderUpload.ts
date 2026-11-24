export interface TraversedFile {
  file: File;
  relativePath: string;
}

/**
 * Splits an array of items into batches of at most batchSize.
 * Prevents exceeding server multipart limits while keeping high LAN throughput.
 */
export function chunkFileArray<T>(items: T[], batchSize = 200): T[][] {
  if (!items || items.length === 0) return [];
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Recursively scans files and directories from DataTransfer items (drag and drop)
 * using the HTML5 FileSystem API (webkitGetAsEntry).
 * Reads full binary files without dropping or filtering any files.
 */
export async function scanDataTransferItems(items: DataTransferItemList | null): Promise<TraversedFile[]> {
  if (!items || items.length === 0) return [];

  const results: TraversedFile[] = [];

  async function traverseEntry(entry: any, currentPath = ''): Promise<void> {
    if (!entry) return;

    if (entry.isFile) {
      const rel = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      return new Promise<void>((resolve) => {
        entry.file(
          (file: File) => {
            results.push({ file, relativePath: rel });
            resolve();
          },
          (err: any) => {
            console.warn('Error reading file entry:', err);
            resolve();
          }
        );
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const nextPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

      return new Promise<void>((resolve) => {
        const readBatch = () => {
          dirReader.readEntries(
            async (entries: any[]) => {
              if (!entries || entries.length === 0) {
                resolve();
              } else {
                for (const child of entries) {
                  await traverseEntry(child, nextPath);
                }
                // Directory reader returns entries in batches, recurse until complete
                readBatch();
              }
            },
            (err: any) => {
              console.warn('Error reading directory entries:', err);
              resolve();
            }
          );
        };
        readBatch();
      });
    }
  }

  const promises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      if (typeof item.webkitGetAsEntry === 'function') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          promises.push(traverseEntry(entry));
          continue;
        }
      }
      const f = item.getAsFile();
      if (f) {
        results.push({
          file: f,
          relativePath: (f as any).webkitRelativePath || f.name,
        });
      }
    }
  }

  await Promise.all(promises);
  return results;
}

/**
 * Extracts TraversedFiles from a FileList (such as from `<input type="file" webkitdirectory />`)
 */
export function extractFilesFromList(fileList: FileList): TraversedFile[] {
  const results: TraversedFile[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i];
    results.push({
      file: f,
      relativePath: (f as any).webkitRelativePath || f.name,
    });
  }
  return results;
}

/**
 * Uses modern native File System Access API (showDirectoryPicker) to pick and recursively traverse a directory.
 * Native macOS/Windows folder picker where entire folders can be cleanly selected.
 * Bypasses Chrome's raw "Upload X files to this site?" prompt and gives full control to AirBridge UI.
 * Reads every file into genuine File objects so everything is uploaded without omissions.
 * Returns null if showDirectoryPicker is unsupported, or empty array if user canceled.
 */
export async function pickAndTraverseDirectory(): Promise<TraversedFile[] | null> {
  if (typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function') {
    try {
      const dirHandle = await (window as any).showDirectoryPicker();
      if (!dirHandle) return [];

      const results: TraversedFile[] = [];

      async function scanHandle(handle: any, currentPath: string): Promise<void> {
        for await (const [name, entry] of handle.entries()) {
          const entryPath = currentPath ? `${currentPath}/${name}` : name;
          if (entry.kind === 'file') {
            try {
              const file = await entry.getFile();
              results.push({ file, relativePath: entryPath });
            } catch (err) {
              console.warn('Failed to read file handle:', entryPath, err);
            }
          } else if (entry.kind === 'directory') {
            await scanHandle(entry, entryPath);
          }
        }
      }

      await scanHandle(dirHandle, dirHandle.name);
      return results;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User voluntarily dismissed the picker dialog
        return [];
      }
      console.warn('showDirectoryPicker failed, falling back:', err);
      return null;
    }
  }
  return null;
}
