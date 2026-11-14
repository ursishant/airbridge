export interface TraversedFile {
  file: File;
  relativePath: string;
}

/**
 * Recursively scans files and directories from DataTransfer items (drag and drop)
 * using the HTML5 FileSystem API (webkitGetAsEntry).
 */
export async function scanDataTransferItems(items: DataTransferItemList | null): Promise<TraversedFile[]> {
  if (!items || items.length === 0) return [];

  const results: TraversedFile[] = [];

  async function traverseEntry(entry: any, currentPath = ''): Promise<void> {
    if (!entry) return;

    if (entry.isFile) {
      return new Promise<void>((resolve) => {
        entry.file(
          (file: File) => {
            const rel = currentPath ? `${currentPath}/${file.name}` : file.name;
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
                // Directory reader might return entries in batches of 100, so recurse
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
