import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  Trash2,
  Image as ImageIcon,
  Film,
  Music,
  Package,
  FileText,
  FolderArchive,
  Loader2,
  Search,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  Eye,
  FolderOpen,
} from 'lucide-react';
import type { UploadedFileItem, ServerInfo } from '../hooks/useWebSocket';
import { M3FolderIcon, M3DocumentIcon } from './M3Icons';
import { ConfirmModal } from './ConfirmModal';
import { FilePreviewModal, isPreviewableFile } from './FilePreviewModal';
import { getAuthHeaders } from '../utils/device';
import { downloadFileSafely } from '../utils/download';

interface FileItemWithFolder extends UploadedFileItem {
  isDirectory?: boolean;
  fileCount?: number;
}

interface FileTransferProps {
  isAndroid: boolean;
  isMac: boolean;
  isWindows?: boolean;
  serverInfo?: ServerInfo | null;
  recentFiles: UploadedFileItem[];
  showToast: (msg: string) => void;
  companionDeck?: React.ReactNode;
}

type FilterCategory = 'all' | 'folders' | 'media' | 'docs';

export const FileTransfer: React.FC<FileTransferProps> = ({
  isMac,
  isWindows = false,
  serverInfo,
  recentFiles,
  showToast,
}) => {
  const [allFiles, setAllFiles] = useState<FileItemWithFolder[]>(() => {
    try {
      const cached = localStorage.getItem('airbridge_cached_files');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });
  const [previewFile, setPreviewFile] = useState<FileItemWithFolder | null>(null);
  const [downloadingName, setDownloadingName] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; isDirectory?: boolean } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const fetchFiles = async () => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/files', { headers });
      if (res.ok) {
        const data = await res.json();
        const filesList = data.files || [];
        setAllFiles(filesList);
        try {
          localStorage.setItem('airbridge_cached_files', JSON.stringify(filesList));
        } catch (e) {}
      }
    } catch (e) {
      console.error('Failed to fetch files:', e);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchFiles();
    }, 1000);
    return () => clearTimeout(timer);
  }, [recentFiles]);

  useEffect(() => {
    const handleFileDeleted = (e: Event) => {
      const customEvent = e as CustomEvent<{ filename: string }>;
      const deletedName = customEvent.detail?.filename;
      if (deletedName) {
        setAllFiles((prev) => prev.filter((f) => f.name !== deletedName));
      }
      fetchFiles();
    };
    window.addEventListener('airbridge_file_deleted', handleFileDeleted);
    return () => window.removeEventListener('airbridge_file_deleted', handleFileDeleted);
  }, []);

  const executeDelete = async (filename: string) => {
    try {
      const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
      let res = await fetch('/api/files/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ filename }),
      });

      if (!res.ok) {
        res = await fetch(`/api/files/${encodeURIComponent(filename)}`, {
          method: 'DELETE',
          headers,
        });
      }

      if (res.ok) {
        showToast(`Removed ${filename}`);
        setAllFiles((prev) => {
          const updated = prev.filter((f) => f.name !== filename);
          try {
            localStorage.setItem('airbridge_cached_files', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
        fetchFiles();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to delete file');
      }
    } catch (e) {
      showToast('Failed to delete file');
    }
  };

  const toggleSelectFile = (filename: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length && filteredFiles.length > 0) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map((f) => f.name)));
    }
  };

  const executeBulkDelete = async () => {
    if (selectedFiles.size === 0) return;
    setIsBulkDeleting(true);
    const toDelete = Array.from(selectedFiles);
    try {
      const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/files/bulk-delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ filenames: toDelete }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`Deleted ${data.deletedCount || toDelete.length} item(s)`);
        setAllFiles((prev) => prev.filter((f) => !selectedFiles.has(f.name)));
        setSelectedFiles(new Set());
        fetchFiles();
      } else {
        showToast('Failed to bulk delete items');
      }
    } catch (e) {
      showToast('Error during bulk deletion');
    } finally {
      setIsBulkDeleting(false);
      setShowBulkConfirm(false);
    }
  };

  const handleOpenInFinder = async (filename?: string) => {
    try {
      const headers = getAuthHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/open-in-finder', {
        method: 'POST',
        headers,
        body: JSON.stringify({ filename }),
      });
      if (res.ok) {
        const isWin = isWindows || serverInfo?.isWindows || serverInfo?.platform === 'win32';
        showToast(isWin ? 'Revealed in Explorer' : 'Revealed in Finder');
      }
    } catch (e) {
      showToast('Failed to open file manager');
    }
  };

  const handleSafeDownload = async (url: string, filename: string, fileSize?: number) => {
    setDownloadingName(filename);
    showToast(`Downloading ${filename}...`);
    try {
      const success = await downloadFileSafely(url, filename, fileSize);
      showToast(success ? `Saved ${filename}` : 'Download started');
    } catch (e) {
      showToast('Download error');
    } finally {
      setDownloadingName(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileBadge = (name: string, isDirectory?: boolean) => {
    if (isDirectory) return { icon: <FolderArchive className="w-4 h-4 text-amber-500" />, label: 'FOLDER', type: 'folder' };
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'].includes(ext || '')) {
      return { icon: <ImageIcon className="w-4 h-4 text-purple-500" />, label: ext?.toUpperCase() || 'IMG', type: 'media' };
    }
    if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext || '')) {
      return { icon: <Film className="w-4 h-4 text-blue-500" />, label: ext?.toUpperCase() || 'VID', type: 'media' };
    }
    if (['mp3', 'm4a', 'wav', 'flac', 'aac'].includes(ext || '')) {
      return { icon: <Music className="w-4 h-4 text-amber-500" />, label: ext?.toUpperCase() || 'AUDIO', type: 'media' };
    }
    if (['apk'].includes(ext || '')) {
      return { icon: <Package className="w-4 h-4 text-emerald-500" />, label: 'APK', type: 'docs' };
    }
    return { icon: <FileText className="w-4 h-4 text-blue-500" />, label: ext?.toUpperCase() || 'FILE', type: 'docs' };
  };

  const isImageFile = (name: string, isDirectory?: boolean) => {
    if (isDirectory) return false;
    const ext = name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'].includes(ext || '');
  };

  const filteredFiles = useMemo(() => {
    return allFiles.filter((f) => {
      if (activeCategory === 'folders' && !f.isDirectory) return false;
      if (activeCategory === 'media' && getFileBadge(f.name, f.isDirectory).type !== 'media') return false;
      if (activeCategory === 'docs' && getFileBadge(f.name, f.isDirectory).type !== 'docs') return false;
      if (searchQuery.trim() && !f.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [allFiles, activeCategory, searchQuery]);

  const totalVaultSize = useMemo(
    () => allFiles.reduce((sum, f) => sum + (Number(f.size) || 0), 0),
    [allFiles]
  );

  const folderCount = allFiles.filter((f) => f.isDirectory).length;
  const mediaCount = allFiles.filter((f) => getFileBadge(f.name, f.isDirectory).type === 'media').length;
  const docCount = allFiles.filter((f) => getFileBadge(f.name, f.isDirectory).type === 'docs').length;

  const vaultPathLabel = (serverInfo?.downloadsDir || '~/Downloads/AirBridge')
    .replace(/^\/Users\/[^/]+/, '~')
    .replace(/^[a-zA-Z]:\\Users\\[^\\]+/i, '~');

  return (
    <div className="w-full space-y-4">
      {/* Header Row — shows item count + total size cleanly on mobile & desktop */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 min-w-0">
          <h3 className="font-display text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Shared Vault
          </h3>
          <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
            {allFiles.length} {allFiles.length === 1 ? 'item' : 'items'}
            {allFiles.length > 0 ? ` · ${formatBytes(totalVaultSize)}` : ''}
          </span>
          <span className="hidden md:inline text-xs font-mono truncate" style={{ color: 'var(--text-tertiary)' }}>
            · {vaultPathLabel}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(isMac || isWindows || serverInfo?.isWindows) && (
            <button
              onClick={() => handleOpenInFinder()}
              className="ab-btn ab-btn-ghost h-8 px-2.5 text-xs"
              title={isWindows || serverInfo?.isWindows ? 'Reveal in Explorer' : 'Reveal in Finder'}
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
              <span>{isWindows || serverInfo?.isWindows ? 'Explorer' : 'Finder'}</span>
            </button>
          )}

          {allFiles.length > 0 && (
            <button
              onClick={() => handleSafeDownload('/api/download-zip', 'AirBridge_Files.zip')}
              disabled={downloadingName === 'AirBridge_Files.zip'}
              className="ab-btn ab-btn-ghost h-8 px-3 text-xs"
            >
              {downloadingName === 'AirBridge_Files.zip' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Download className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>Download All ({formatBytes(totalVaultSize)})</span>
            </button>
          )}

          {allFiles.length > 0 && (
            <div
              className="flex items-center p-0.5 rounded-lg ml-auto sm:ml-0"
              style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
            >
              <button
                onClick={() => setViewMode('table')}
                className="relative w-7 h-7 rounded-md flex items-center justify-center transition-colors"
                style={{
                  color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
                title="List view"
              >
                {viewMode === 'table' && (
                  <motion.div
                    layoutId="vaultViewModePill"
                    className="absolute inset-0 rounded-md"
                    style={{ background: 'var(--surface)' }}
                    transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                  />
                )}
                <List className="w-3.5 h-3.5 relative z-10" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className="relative w-7 h-7 rounded-md flex items-center justify-center transition-colors"
                style={{
                  color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
                title="Grid view"
              >
                {viewMode === 'grid' && (
                  <motion.div
                    layoutId="vaultViewModePill"
                    className="absolute inset-0 rounded-md"
                    style={{ background: 'var(--surface)' }}
                    transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                  />
                )}
                <LayoutGrid className="w-3.5 h-3.5 relative z-10" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter Tabs + Search (only shown when files exist) */}
      {allFiles.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div
            className="flex items-center gap-4 border-b sm:border-b-0 overflow-x-auto scrollbar-none pb-1 sm:pb-0"
            style={{ borderColor: 'var(--border)' }}
          >
            {(
              [
                { id: 'all', label: `All (${allFiles.length})` },
                ...(folderCount > 0 ? [{ id: 'folders' as const, label: `Folders (${folderCount})` }] : []),
                ...(mediaCount > 0 ? [{ id: 'media' as const, label: `Media (${mediaCount})` }] : []),
                ...(docCount > 0 ? [{ id: 'docs' as const, label: `Docs (${docCount})` }] : []),
              ] as { id: FilterCategory; label: string }[]
            ).map((tab) => {
              const active = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveCategory(tab.id)}
                  className="relative pb-2 text-xs transition-colors shrink-0"
                  style={{
                    color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {tab.label}
                  {active && (
                    <motion.div
                      layoutId="vaultFilterUnderline"
                      className="absolute bottom-0 inset-x-0 h-0.5 rounded-full"
                      style={{ background: 'var(--text-primary)' }}
                      transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-60 shrink-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: 'var(--text-tertiary)' }}
            />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ab-input pl-9 pr-3 h-9 text-xs"
            />
          </div>
        </div>
      )}

      {/* Contextual Bulk Action Bar */}
      <AnimatePresence>
      {selectedFiles.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl"
          style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)' }}
        >
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-xs font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            <CheckSquare className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            <span>{selectedFiles.size} of {filteredFiles.length} selected</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedFiles(new Set())}
              className="text-xs font-medium px-2 py-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              Clear
            </button>
            <button
              onClick={() => setShowBulkConfirm(true)}
              disabled={isBulkDeleting}
              className="apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
            >
              {isBulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Delete ({selectedFiles.size})</span>
            </button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* File List or Grid */}
      {filteredFiles.length === 0 ? (
        <div className="py-10 text-center rounded-2xl" style={{ border: '1px solid var(--border)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {searchQuery ? 'No matching files' : 'No shared files yet'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Drop files or folders above to transfer across devices
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-2xl overflow-hidden divide-y" style={{ border: '1px solid var(--border)', borderColor: 'var(--border)' }}>
          {filteredFiles.map((file) => {
            const isDirectory = !!file.isDirectory;
            const badge = getFileBadge(file.name, isDirectory);
            const isThisDownloading = downloadingName === file.name;
            const isSelected = selectedFiles.has(file.name);

            return (
              <div
                key={file.name}
                className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 transition-colors group"
                style={{
                  background: isSelected ? 'var(--accent-soft)' : 'var(--surface)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <button
                    onClick={() => toggleSelectFile(file.name)}
                    className={`w-6 h-6 flex items-center justify-center rounded-md transition-opacity shrink-0 ${
                      isSelected ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'
                    }`}
                    style={{ color: isSelected ? 'var(--accent)' : 'var(--text-tertiary)' }}
                    title={isSelected ? 'Deselect' : 'Select'}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>

                  <div
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
                  >
                    {isDirectory ? (
                      <M3FolderIcon className="w-4 h-4 text-amber-500" />
                    ) : (
                      <M3DocumentIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    )}
                  </div>

                  <div
                    onClick={() => {
                      if (isPreviewableFile(file.name, isDirectory)) setPreviewFile(file);
                    }}
                    className={`min-w-0 flex-1 ${isPreviewableFile(file.name, isDirectory) ? 'cursor-pointer' : ''}`}
                  >
                    <p className="font-display text-xs sm:text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {file.name}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums truncate" style={{ color: 'var(--text-tertiary)' }}>
                      <span>{badge.label}</span>
                      <span>·</span>
                      {isDirectory ? (
                        <span className="truncate">
                          {file.fileCount || 0} items · {formatBytes(file.size)}
                        </span>
                      ) : (
                        <span>{formatBytes(file.size)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {isPreviewableFile(file.name, isDirectory) && (
                    <button
                      onClick={() => setPreviewFile(file)}
                      className="apple-press w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                      style={{ color: 'var(--text-secondary)' }}
                      title="Preview"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => handleSafeDownload(file.path, isDirectory ? `${file.name}.zip` : file.name, file.size)}
                    disabled={isThisDownloading}
                    className="ab-btn ab-btn-primary h-8 px-2.5 sm:px-3 text-xs"
                  >
                    {isThisDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{isDirectory ? 'ZIP' : 'Save'}</span>
                  </button>

                  {(isMac || isWindows || serverInfo?.isWindows) && (
                    <button
                      onClick={() => handleOpenInFinder(file.name)}
                      className="apple-press hidden md:flex w-8 h-8 rounded-lg items-center justify-center transition-colors"
                      style={{ color: 'var(--text-secondary)' }}
                      title={isWindows || serverInfo?.isWindows ? 'Reveal in Explorer' : 'Reveal in Finder'}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => setDeleteTarget({ name: file.name, isDirectory: file.isDirectory })}
                    className="apple-press w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA3AF] hover:text-rose-500 transition-colors"
                    title={file.isDirectory ? 'Delete folder' : 'Delete file'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredFiles.map((file) => {
            const isDirectory = !!file.isDirectory;
            const isImg = isImageFile(file.name, isDirectory) && !brokenImages.has(file.name);
            const badge = getFileBadge(file.name, isDirectory);
            const isThisDownloading = downloadingName === file.name;
            const isSelected = selectedFiles.has(file.name);

            return (
              <div
                key={file.name}
                className="rounded-xl p-3.5 flex flex-col justify-between transition-colors"
                style={{
                  background: isSelected ? 'var(--accent-soft)' : 'var(--surface-alt)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {/* Uniform Visual Top Preview Area (Thumbnail or Folder/File Emblem) */}
                {isImg ? (
                  <div
                    onClick={() => setPreviewFile(file)}
                    className="relative w-full h-28 mb-3 rounded-lg overflow-hidden cursor-pointer bg-black/5 dark:bg-black/20"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <img
                      src={file.path}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={() => {
                        setBrokenImages((prev) => {
                          const next = new Set(prev);
                          next.add(file.name);
                          return next;
                        });
                      }}
                    />
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      if (isPreviewableFile(file.name, isDirectory)) setPreviewFile(file);
                    }}
                    className={`relative w-full h-28 mb-3 rounded-lg flex flex-col items-center justify-center gap-1.5 ${
                      isPreviewableFile(file.name, isDirectory) ? 'cursor-pointer' : ''
                    }`}
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  >
                    {isDirectory ? (
                      <M3FolderIcon className="w-7 h-7 text-amber-500" />
                    ) : (
                      <M3DocumentIcon className="w-7 h-7" style={{ color: 'var(--accent)' }} />
                    )}
                    <span
                      className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'var(--surface-alt)', color: 'var(--text-secondary)' }}
                    >
                      {formatBytes(file.size)}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => toggleSelectFile(file.name)}
                    className="w-5 h-5 flex items-center justify-center shrink-0"
                    style={{ color: isSelected ? 'var(--accent)' : 'var(--text-tertiary)' }}
                    title={isSelected ? 'Deselect' : 'Select'}
                  >
                    {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 opacity-50" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {badge.label} ·{' '}
                      {isDirectory
                        ? `${file.fileCount || 0} items · ${formatBytes(file.size)}`
                        : formatBytes(file.size)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={() => handleSafeDownload(file.path, isDirectory ? `${file.name}.zip` : file.name, file.size)}
                    disabled={isThisDownloading}
                    className="ab-btn ab-btn-primary h-8 px-3 text-xs"
                  >
                    {isThisDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>{isDirectory ? 'ZIP' : 'Save'}</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {isPreviewableFile(file.name, isDirectory) && (
                      <button
                        onClick={() => setPreviewFile(file)}
                        className="apple-press w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ color: 'var(--text-secondary)' }}
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteTarget({ name: file.name, isDirectory: file.isDirectory })}
                      className="apple-press w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA3AF] hover:text-rose-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FilePreviewModal
        file={previewFile}
        files={filteredFiles}
        onSelectFile={setPreviewFile}
        onDownload={(f) => handleSafeDownload(f.path, f.isDirectory ? `${f.name}.zip` : f.name, f.size)}
        onClose={() => setPreviewFile(null)}
        showToast={showToast}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={deleteTarget?.isDirectory ? 'Delete Folder?' : 'Delete File?'}
        message={
          deleteTarget?.isDirectory
            ? 'All nested files inside this folder will be permanently erased.'
            : 'This file will be permanently removed from AirBridge storage.'
        }
        itemName={deleteTarget?.name}
        itemType={deleteTarget?.isDirectory ? 'folder' : 'file'}
        confirmLabel={deleteTarget?.isDirectory ? 'Delete Folder' : 'Delete File'}
        onConfirm={() => {
          if (deleteTarget) executeDelete(deleteTarget.name);
        }}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        isOpen={showBulkConfirm}
        title={`Delete ${selectedFiles.size} Item${selectedFiles.size === 1 ? '' : 's'}?`}
        message={`Permanently delete ${selectedFiles.size} selected item(s) from AirBridge storage?`}
        itemName={`${selectedFiles.size} selected items`}
        itemType="file"
        confirmLabel={isBulkDeleting ? 'Deleting...' : `Delete ${selectedFiles.size}`}
        onConfirm={executeBulkDelete}
        onClose={() => setShowBulkConfirm(false)}
      />
    </div>
  );
};
