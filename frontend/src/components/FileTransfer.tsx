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
  CheckCircle2
} from 'lucide-react';
import type { UploadedFileItem, ServerInfo } from '../hooks/useWebSocket';
import { M3FolderIcon, M3DocumentIcon } from './M3Icons';
import { ConfirmModal } from './ConfirmModal';
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
  companionDeck,
}) => {
  const getPin = () => {
    try {
      return localStorage.getItem('airbridge_office_pin') || '';
    } catch (e) {
      return '';
    }
  };
  const [allFiles, setAllFiles] = useState<FileItemWithFolder[]>(() => {
    try {
      const cached = localStorage.getItem('airbridge_cached_files');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [downloadingName, setDownloadingName] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; isDirectory?: boolean } | null>(null);

  const fetchFiles = async () => {
    try {
      const pin = getPin();
      const headers: Record<string, string> = {};
      if (pin) headers['x-airbridge-pin'] = pin;
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
    fetchFiles();
  }, [recentFiles]);

  // Synchronize deletions from WebSocket broadcasts across all connected tabs/devices
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
      const pin = getPin();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pin) headers['x-airbridge-pin'] = pin;

      // 1. Try POST /api/files/delete with JSON body (handles spaces and special characters reliably)
      let res = await fetch('/api/files/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ filename }),
      });

      // 2. Fall back to DELETE /api/files/:filename if needed
      if (!res.ok) {
        res = await fetch(`/api/files/${encodeURIComponent(filename)}`, {
          method: 'DELETE',
          headers,
        });
      }

      if (res.ok) {
        showToast(`Removed ${filename}`);
        // Instantly remove from view for responsive feedback
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

  const handleOpenInFinder = async (filename?: string) => {
    try {
      const pin = getPin();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (pin) headers['x-airbridge-pin'] = pin;

      const res = await fetch('/api/open-in-finder', {
        method: 'POST',
        headers,
        body: JSON.stringify({ filename }),
      });
      if (res.ok) {
        const isWin = isWindows || serverInfo?.isWindows || serverInfo?.platform === 'win32';
        showToast(isWin ? 'Revealed in Windows File Explorer' : 'Revealed in Finder');
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
      if (success) {
        showToast(`Saved ${filename}`);
      } else {
        showToast('Download started');
      }
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
    if (isDirectory) {
      return { icon: <FolderArchive className="w-4 h-4 text-[#F59E0B]" />, label: 'FOLDER', type: 'folder' };
    }
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'].includes(ext || '')) {
      return { icon: <ImageIcon className="w-4 h-4 text-[#A855F7]" />, label: ext?.toUpperCase() || 'IMG', type: 'media' };
    }
    if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext || '')) {
      return { icon: <Film className="w-4 h-4 text-[#3B82F6]" />, label: ext?.toUpperCase() || 'VID', type: 'media' };
    }
    if (['mp3', 'm4a', 'wav', 'flac', 'aac'].includes(ext || '')) {
      return { icon: <Music className="w-4 h-4 text-[#F59E0B]" />, label: ext?.toUpperCase() || 'AUDIO', type: 'media' };
    }
    if (['apk'].includes(ext || '')) {
      return { icon: <Package className="w-4 h-4 text-[#10B981]" />, label: 'APK', type: 'docs' };
    }
    return { icon: <FileText className="w-4 h-4 text-[#3B82F6]" />, label: ext?.toUpperCase() || 'DOC', type: 'docs' };
  };

  const isImageFile = (name: string, isDirectory?: boolean) => {
    if (isDirectory) return false;
    const ext = name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'svg'].includes(ext || '');
  };

  // Filtered files based on category and search query
  const filteredFiles = useMemo(() => {
    return allFiles.filter((f) => {
      // Category filter
      if (activeCategory === 'folders' && !f.isDirectory) return false;
      if (activeCategory === 'media') {
        const badge = getFileBadge(f.name, f.isDirectory);
        if (badge.type !== 'media') return false;
      }
      if (activeCategory === 'docs') {
        const badge = getFileBadge(f.name, f.isDirectory);
        if (badge.type !== 'docs') return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!f.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allFiles, activeCategory, searchQuery]);

  const folderCount = allFiles.filter(f => f.isDirectory).length;
  const mediaCount = allFiles.filter(f => getFileBadge(f.name, f.isDirectory).type === 'media').length;
  const docCount = allFiles.filter(f => getFileBadge(f.name, f.isDirectory).type === 'docs').length;

  return (
    <div className="bento-card rounded-[32px] p-5 sm:p-7 transition-colors duration-200 space-y-5">
      {/* 1. Header: Brand Icon, Title, Path, and Actions (Finder, Download All, Layout Switcher) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#0F1115] text-white dark:bg-[#C6F432] dark:text-[#0A0D14] flex items-center justify-center font-bold shadow-sm shrink-0 transition-colors">
            <M3FolderIcon className="w-5 h-5 text-inherit" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold text-[#0F1115] dark:text-white tracking-tight">
                Office Shared Files Folder
              </h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-black/[0.05] dark:bg-white/[0.08] text-[#0071E3] dark:text-[#C6F432]">
                {allFiles.length} {allFiles.length === 1 ? 'FILE' : 'FILES'}
              </span>
            </div>
            <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
              Direct Wi-Fi storage in <code className="font-mono text-[#0F1115] dark:text-white bg-black/[0.04] dark:bg-white/10 px-1.5 py-0.5 rounded text-[11px]">{serverInfo?.downloadsDir || '~/Downloads/AirBridge'}</code>
            </p>
          </div>
        </div>

        {/* Action Tools: Finder Reveal, ZIP Download All, Layout Switcher */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {(isMac || isWindows || serverInfo?.isWindows) && (
            <button
              onClick={() => {
                handleOpenInFinder();
              }}
              className="apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F8FAFC] dark:bg-[#181E2E] hover:bg-black/[0.04] dark:hover:bg-[#222A3E] text-[#0F1115] dark:text-white border border-black/[0.06] dark:border-white/[0.08] shadow-sm transition-colors"
              title={isWindows || serverInfo?.isWindows ? "Reveal in File Explorer" : "Reveal in Finder"}
            >
              <M3FolderIcon className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#38BDF8]" />
              <span>{isWindows || serverInfo?.isWindows ? 'Explorer' : 'Finder'}</span>
            </button>
          )}

          {allFiles.length > 0 && (
            <button
              onClick={() => handleSafeDownload('/api/download-zip', 'AirBridge_Files.zip')}
              disabled={downloadingName === 'AirBridge_Files.zip'}
              className="apple-press flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-[#C6F432] dark:hover:bg-[#B5E22B] dark:text-[#0A0D14] transition-all shadow-sm disabled:opacity-50"
            >
              {downloadingName === 'AirBridge_Files.zip' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Download All</span>
            </button>
          )}

          {/* Layout Toggle (Table vs Grid) */}
          <div className="flex items-center bg-black/[0.04] dark:bg-[#181E2E] p-0.5 rounded-xl border border-black/[0.04] dark:border-white/[0.08]">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                viewMode === 'table' 
                  ? 'bg-white dark:bg-[#2A344C] text-[#0F1115] dark:text-white shadow-sm' 
                  : 'text-[#64748B] hover:text-[#0F1115] dark:text-[#94A3B8] dark:hover:text-white'
              }`}
              title="Table list view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-white dark:bg-[#2A344C] text-[#0F1115] dark:text-white shadow-sm' 
                  : 'text-[#64748B] hover:text-[#0F1115] dark:text-[#94A3B8] dark:hover:text-white'
              }`}
              title="Grid card view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Filter Pills & Live Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setActiveCategory('all')}
            className={`apple-press px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeCategory === 'all'
                ? 'bg-[#0F1115] text-white dark:bg-[#C6F432] dark:text-[#0A0D14] shadow-sm'
                : 'bg-black/[0.04] hover:bg-black/[0.08] text-[#64748B] hover:text-[#0F1115] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-[#94A3B8] dark:hover:text-white'
            }`}
          >
            All Files ({allFiles.length})
          </button>

          <button
            onClick={() => setActiveCategory('folders')}
            className={`apple-press px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeCategory === 'folders'
                ? 'bg-[#0F1115] text-white dark:bg-[#C6F432] dark:text-[#0A0D14] shadow-sm'
                : 'bg-black/[0.04] hover:bg-black/[0.08] text-[#64748B] hover:text-[#0F1115] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-[#94A3B8] dark:hover:text-white'
            }`}
          >
            Folders ({folderCount})
          </button>

          <button
            onClick={() => setActiveCategory('media')}
            className={`apple-press px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeCategory === 'media'
                ? 'bg-[#0F1115] text-white dark:bg-[#C6F432] dark:text-[#0A0D14] shadow-sm'
                : 'bg-black/[0.04] hover:bg-black/[0.08] text-[#64748B] hover:text-[#0F1115] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-[#94A3B8] dark:hover:text-white'
            }`}
          >
            Media ({mediaCount})
          </button>

          <button
            onClick={() => setActiveCategory('docs')}
            className={`apple-press px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
              activeCategory === 'docs'
                ? 'bg-[#0F1115] text-white dark:bg-[#C6F432] dark:text-[#0A0D14] shadow-sm'
                : 'bg-black/[0.04] hover:bg-black/[0.08] text-[#64748B] hover:text-[#0F1115] dark:bg-white/[0.06] dark:hover:bg-white/[0.1] dark:text-[#94A3B8] dark:hover:text-white'
            }`}
          >
            Docs ({docCount})
          </button>
        </div>

        {/* Quick Search Input */}
        <div className="relative sm:w-60 shrink-0">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#64748B] dark:text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Filter vault..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#F8FAFC] dark:bg-[#181E2E] pl-8 pr-3 py-1.5 rounded-xl text-xs border border-black/[0.06] dark:border-white/[0.08] text-[#0F1115] dark:text-white placeholder-[#64748B] dark:placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#0071E3] dark:focus:ring-[#C6F432] font-sans"
          />
        </div>
      </div>

      {/* 3. Slab Body: Balanced 2-Column Split (Files Stream on Left, Companion Deck on Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-2">
        {/* Left Column: Files Table / Grid */}
        <div className={companionDeck ? "lg:col-span-7 xl:col-span-7 space-y-3" : "lg:col-span-12 space-y-3"}>
          {filteredFiles.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-[#F8FAFC] dark:bg-[#141926] border border-black/[0.04] dark:border-white/[0.04]">
              <p className="font-display text-xs font-bold text-[#0F1115] dark:text-white">
                {searchQuery ? 'No matching files found' : 'Vault is clean and ready'}
              </p>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-1 max-w-sm mx-auto">
                Drop files or entire folders onto the AirDrop stage above to beam them across Wi-Fi.
              </p>
            </div>
          ) : viewMode === 'table' ? (
            /* Luxury Table Stream */
            <div className="space-y-2">
              {filteredFiles.map((file, idx) => {
                const isDirectory = !!file.isDirectory;
                const badge = getFileBadge(file.name, isDirectory);
                const isThisDownloading = downloadingName === file.name;

                return (
                  <motion.div
                    key={file.name}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.1) }}
                    className="p-3 sm:p-3.5 rounded-2xl bg-[#F8FAFC] hover:bg-[#F1F5F9] dark:bg-[#141926] dark:hover:bg-[#1A2030] border border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between gap-3 transition-colors group"
                  >
                    {/* Icon + Name + Metadata */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] shadow-xs flex items-center justify-center shrink-0">
                        {isDirectory ? (
                          <M3FolderIcon className="w-5 h-5 text-[#F59E0B]" />
                        ) : (
                          <M3DocumentIcon className="w-5 h-5 text-[#0071E3] dark:text-[#38BDF8]" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="font-display text-xs sm:text-sm font-bold text-[#0F1115] dark:text-white truncate tracking-tight">
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono tabular-nums">
                          <span className="font-bold text-[#0F1115] dark:text-white uppercase font-sans">
                            {badge.label}
                          </span>
                          <span>•</span>
                          {isDirectory ? (
                            <span>{file.fileCount || 0} items ({formatBytes(file.size)})</span>
                          ) : (
                            <span>{formatBytes(file.size)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status Pill Badge */}
                    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#10B981]/10 dark:bg-[#C6F432]/15 text-[#10B981] dark:text-[#C6F432] text-[10px] font-bold font-mono shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-inherit" />
                      <span>{isDirectory ? 'FOLDER READY' : 'COMPLETE'}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleSafeDownload(file.path, isDirectory ? `${file.name}.zip` : file.name, file.size)}
                        disabled={isThisDownloading}
                        className="apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-[#C6F432] dark:hover:bg-[#B5E22B] dark:text-[#0A0D14] shadow-sm transition-all disabled:opacity-50"
                      >
                        {isThisDownloading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3 text-inherit" />
                        )}
                        <span>{isDirectory ? 'Get ZIP' : 'Download'}</span>
                      </button>

                      {(isMac || isWindows || serverInfo?.isWindows) && (
                        <button
                          onClick={() => {
                            handleOpenInFinder(file.name);
                          }}
                          className="apple-press hidden xs:flex p-1.5 rounded-xl text-[#64748B] hover:text-[#0F1115] dark:text-[#94A3B8] dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.08] transition-colors"
                          title={isWindows || serverInfo?.isWindows ? "Reveal in File Explorer" : "Reveal in Finder"}
                        >
                          <M3FolderIcon className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8]" />
                        </button>
                      )}

                      <button
                        onClick={() => setDeleteTarget({ name: file.name, isDirectory: file.isDirectory })}
                        className="apple-press p-1.5 rounded-xl text-[#64748B] hover:text-red-500 dark:text-[#94A3B8] dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title={file.isDirectory ? "Delete folder" : "Delete file"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* Grid Card View */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredFiles.map((file, idx) => {
                const isDirectory = !!file.isDirectory;
                const isImg = isImageFile(file.name, isDirectory);
                const badge = getFileBadge(file.name, isDirectory);
                const isThisDownloading = downloadingName === file.name;

                return (
                  <motion.div
                    key={file.name}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.1) }}
                    className="rounded-2xl p-3.5 bg-[#F8FAFC] hover:bg-[#F1F5F9] dark:bg-[#141926] dark:hover:bg-[#1A2030] border border-black/[0.04] dark:border-white/[0.04] flex flex-col justify-between transition-colors group"
                  >
                    {isImg && (
                      <div
                        onClick={() => {
                          setPreviewImage(file.path);
                        }}
                        className="relative w-full h-28 mb-2.5 rounded-xl overflow-hidden bg-black/[0.04] dark:bg-black/40 cursor-pointer border border-black/[0.06] dark:border-white/[0.06]"
                      >
                        <img
                          src={file.path}
                          alt={file.name}
                          className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          loading="lazy"
                        />
                      </div>
                    )}

                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="shrink-0 p-2 rounded-xl bg-white dark:bg-white/[0.06] border border-black/[0.04] dark:border-transparent">
                        {isDirectory ? (
                          <M3FolderIcon className="w-5 h-5 text-[#F59E0B]" />
                        ) : (
                          <M3DocumentIcon className="w-5 h-5 text-[#0071E3] dark:text-[#38BDF8]" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#0F1115] dark:text-white truncate tracking-tight" title={file.name}>
                          {file.name}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-[#64748B] dark:text-[#94A3B8] font-mono tabular-nums">
                          <span className="font-semibold text-[#0F1115] dark:text-white uppercase font-sans">
                            {badge.label}
                          </span>
                          <span>•</span>
                          {isDirectory ? (
                            <span>{file.fileCount || 0} items ({formatBytes(file.size)})</span>
                          ) : (
                            <span>{formatBytes(file.size)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between gap-1.5">
                      <button
                        onClick={() => handleSafeDownload(file.path, isDirectory ? `${file.name}.zip` : file.name, file.size)}
                        disabled={isThisDownloading}
                        className="apple-press flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-[#C6F432] dark:hover:bg-[#B5E22B] dark:text-[#0A0D14] shadow-sm transition-all disabled:opacity-50"
                      >
                        {isThisDownloading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Download className="w-3 h-3" />
                        )}
                        <span>{isDirectory ? 'Get ZIP' : 'Download'}</span>
                      </button>

                      <button
                        onClick={() => setDeleteTarget({ name: file.name, isDirectory: file.isDirectory })}
                        className="apple-press p-1.5 rounded-xl text-[#64748B] hover:text-red-500 dark:text-[#94A3B8] dark:hover:text-red-400 transition-colors"
                        title={isDirectory ? "Delete folder" : "Delete file"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Companion Control Deck */}
        {companionDeck && (
          <div className="lg:col-span-5 xl:col-span-5 w-full">
            {companionDeck}
          </div>
        )}
      </div>

      {/* Full-Screen Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-4xl max-h-[85vh] rounded-3xl overflow-hidden bg-black/50 border border-white/20 shadow-2xl relative"
            >
              <img
                src={previewImage}
                alt="Full preview"
                className="w-full h-full object-contain max-h-[80vh]"
              />
              <button
                onClick={() => setPreviewImage(null)}
                className="apple-press absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
              >
                X
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Website-Grade Custom Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={deleteTarget?.isDirectory ? 'Delete Folder?' : 'Delete File?'}
        message={
          deleteTarget?.isDirectory
            ? 'Are you sure you want to delete this folder? All files and nested items inside will be permanently erased.'
            : 'Are you sure you want to permanently delete this file from AirBridge storage?'
        }
        itemName={deleteTarget?.name}
        itemType={deleteTarget?.isDirectory ? 'folder' : 'file'}
        confirmLabel={deleteTarget?.isDirectory ? 'Delete Folder' : 'Delete File'}
        onConfirm={() => {
          if (deleteTarget) {
            executeDelete(deleteTarget.name);
          }
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
};
