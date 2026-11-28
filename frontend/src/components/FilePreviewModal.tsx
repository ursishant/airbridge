import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Copy,
  Check,
  Music,
  Film,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import type { UploadedFileItem } from '../hooks/useWebSocket';
import { getDeviceId, getAuthHeaders } from '../utils/device';
import { copyToClipboard } from '../utils/clipboard';

export interface PreviewableFileItem extends UploadedFileItem {
  isDirectory?: boolean;
  fileCount?: number;
}

interface FilePreviewModalProps {
  file: PreviewableFileItem | null;
  files: PreviewableFileItem[];
  onSelectFile: (file: PreviewableFileItem) => void;
  onDownload: (file: PreviewableFileItem) => void;
  onClose: () => void;
  showToast: (msg: string) => void;
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v', 'ogv']);
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg']);
const CODE_EXTS = new Set([
  'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'css', 'scss',
  'yml', 'yaml', 'csv', 'log', 'sh', 'sql', 'env', 'ini', 'toml', 'rs', 'go', 'java', 'cpp', 'c', 'h',
]);
const PDF_EXTS = new Set(['pdf']);

export function isPreviewableFile(name: string, isDirectory?: boolean): boolean {
  if (isDirectory) return false;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return (
    IMAGE_EXTS.has(ext) ||
    VIDEO_EXTS.has(ext) ||
    AUDIO_EXTS.has(ext) ||
    CODE_EXTS.has(ext) ||
    PDF_EXTS.has(ext)
  );
}

function getPreviewKind(name: string): 'image' | 'video' | 'audio' | 'code' | 'pdf' | 'unknown' {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (PDF_EXTS.has(ext)) return 'pdf';
  if (CODE_EXTS.has(ext)) return 'code';
  return 'unknown';
}

function buildRawMediaUrl(filePath: string): string {
  const rawPath = filePath.replace('/api/files/', '/api/files-raw/');
  try {
    const pin = localStorage.getItem('airbridge_office_pin') || '';
    const devId = getDeviceId();
    const params = new URLSearchParams();
    if (pin) params.set('pin', pin);
    if (devId) params.set('deviceId', devId);
    const qs = params.toString();
    return qs ? `${rawPath}?${qs}` : rawPath;
  } catch {
    return rawPath;
  }
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  files,
  onSelectFile,
  onDownload,
  onClose,
  showToast,
}) => {
  const [zoomed, setZoomed] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  const previewableList = files.filter((f) => isPreviewableFile(f.name, f.isDirectory));
  const currentIdx = file ? previewableList.findIndex((f) => f.name === file.name) : -1;
  const prevFile = currentIdx > 0 ? previewableList[currentIdx - 1] : null;
  const nextFile = currentIdx >= 0 && currentIdx < previewableList.length - 1 ? previewableList[currentIdx + 1] : null;

  const kind = file ? getPreviewKind(file.name) : 'unknown';

  useEffect(() => {
    setZoomed(false);
    setCopiedText(false);
    setTextContent(null);
    setTextError(null);

    if (!file || kind !== 'code') return;

    let cancelled = false;
    setTextLoading(true);
    const rawUrl = file.path.replace('/api/files/', '/api/files-raw/');
    fetch(rawUrl, { headers: getAuthHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!cancelled) {
          setTextContent(text.length > 250000 ? text.slice(0, 250000) + '\n\n... [Preview truncated at 250 KB]' : text);
        }
      })
      .catch((err) => {
        if (!cancelled) setTextError(err?.message || 'Unable to load preview');
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [file?.name, kind]);

  useEffect(() => {
    if (!file) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && prevFile) {
        onSelectFile(prevFile);
      } else if (e.key === 'ArrowRight' && nextFile) {
        onSelectFile(nextFile);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [file, prevFile, nextFile, onSelectFile, onClose]);

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleCopySnippet = async () => {
    if (!textContent) return;
    const ok = await copyToClipboard(textContent);
    if (ok) {
      setCopiedText(true);
      showToast('Copied file contents to clipboard');
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  const mediaUrl = file ? buildRawMediaUrl(file.path) : '';

  return (
    <AnimatePresence>
      {file && (
        <motion.div
          key="quicklook-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-2xl flex flex-col items-center justify-center p-3 sm:p-6"
        >
          {/* Top HUD Bar */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl flex items-center justify-between gap-3 px-4 py-3 mb-3 rounded-2xl bg-[#121621]/90 border border-white/10 text-white shadow-2xl"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 text-[#60A5FA]">
                {kind === 'image' && <ImageIcon className="w-4 h-4" />}
                {kind === 'video' && <Film className="w-4 h-4" />}
                {kind === 'audio' && <Music className="w-4 h-4" />}
                {kind === 'code' && <FileCode2 className="w-4 h-4" />}
                {(kind === 'pdf' || kind === 'unknown') && <FileText className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <p className="font-display text-xs sm:text-sm font-bold truncate text-white">
                  {file.name}
                </p>
                <p className="font-mono text-[10px] text-slate-400">
                  {formatBytes(file.size)}
                  {previewableList.length > 1 && ` • ${currentIdx + 1} of ${previewableList.length}`}
                  {' • Use ← → arrows'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {kind === 'image' && (
                <button
                  onClick={() => setZoomed((z) => !z)}
                  className="apple-press p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                  title={zoomed ? 'Fit to screen' : 'Zoom in'}
                >
                  {zoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                </button>
              )}

              {kind === 'code' && textContent && (
                <button
                  onClick={handleCopySnippet}
                  className="apple-press flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copiedText ? 'Copied' : 'Copy'}</span>
                </button>
              )}

              <button
                onClick={() => onDownload(file)}
                className="apple-press flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#F8FAFC] hover:bg-[#E2E8F0] text-[#0B0D11] text-xs font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>

              <button
                onClick={onClose}
                className="apple-press p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
                aria-label="Close preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>

          {/* Main Stage + Prev/Next Chevrons */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-5xl flex-1 min-h-0 flex items-center justify-center"
          >
            {prevFile && (
              <button
                onClick={() => onSelectFile(prevFile)}
                className="apple-press hidden sm:flex absolute left-2 z-20 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15 backdrop-blur-md transition-colors"
                title={`Previous: ${prevFile.name}`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            <motion.div
              key={file.name}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full max-h-[78vh] rounded-3xl overflow-hidden bg-[#0B0E14] border border-white/10 shadow-2xl flex items-center justify-center"
            >
              {kind === 'image' && (
                <div className={`w-full h-full flex items-center justify-center ${zoomed ? 'overflow-auto cursor-zoom-out' : 'cursor-zoom-in'}`}>
                  <img
                    src={mediaUrl}
                    alt={file.name}
                    onClick={() => setZoomed((z) => !z)}
                    className={`transition-transform duration-300 ${
                      zoomed ? 'scale-150 max-w-none' : 'max-w-full max-h-[76vh] object-contain'
                    }`}
                  />
                </div>
              )}

              {kind === 'video' && (
                <video
                  src={mediaUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full max-h-[76vh] bg-black outline-none"
                />
              )}

              {kind === 'audio' && (
                <div className="w-full max-w-md p-8 text-center space-y-6">
                  <div className="mx-auto w-24 h-24 rounded-2xl bg-[#1E293B] border border-white/10 flex items-center justify-center">
                    <div className="flex items-end gap-1.5 h-10">
                      <span className="w-1.5 h-8 bg-[#60A5FA] rounded-full animate-eq-bar" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-10 bg-[#60A5FA] rounded-full animate-eq-bar" style={{ animationDelay: '180ms' }} />
                      <span className="w-1.5 h-6 bg-[#60A5FA] rounded-full animate-eq-bar" style={{ animationDelay: '340ms' }} />
                      <span className="w-1.5 h-9 bg-[#60A5FA] rounded-full animate-eq-bar" style={{ animationDelay: '120ms' }} />
                    </div>
                  </div>
                  <div>
                    <h4 className="font-display text-base font-bold text-white truncate">{file.name}</h4>
                    <p className="font-mono text-xs text-slate-400 mt-1">Streaming directly over local Wi-Fi</p>
                  </div>
                  <audio src={mediaUrl} controls autoPlay className="w-full" />
                </div>
              )}

              {kind === 'pdf' && (
                <iframe
                  src={mediaUrl}
                  title={file.name}
                  className="w-full h-[76vh] bg-white border-0"
                />
              )}

              {kind === 'code' && (
                <div className="w-full h-[76vh] overflow-auto p-4 sm:p-6 font-mono text-xs text-slate-200 leading-relaxed text-left">
                  {textLoading ? (
                    <div className="h-full flex items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading file preview...</span>
                    </div>
                  ) : textError ? (
                    <div className="h-full flex items-center justify-center text-rose-400">
                      Preview unavailable ({textError})
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap break-words">{textContent}</pre>
                  )}
                </div>
              )}
            </motion.div>

            {nextFile && (
              <button
                onClick={() => onSelectFile(nextFile)}
                className="apple-press hidden sm:flex absolute right-2 z-20 p-3 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/15 backdrop-blur-md transition-colors"
                title={`Next: ${nextFile.name}`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
