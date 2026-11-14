import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { M3CameraIcon, M3SendIcon } from './M3Icons';

interface CameraRapidSnapProps {
  isOpen: boolean;
  onClose: () => void;
  deviceName: string;
  showToast: (msg: string) => void;
}

export const CameraRapidSnap: React.FC<CameraRapidSnapProps> = ({
  isOpen,
  onClose,
  deviceName,
  showToast,
}) => {
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        setPhotoData(uploadEvent.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendToMac = async () => {
    if (!photoData) return;

    setIsSending(true);
    try {
      const blob = await (await fetch(photoData)).blob();
      const formData = new FormData();
      const filename = `AndroidSnap_${Date.now()}.jpg`;
      formData.append('file', blob, filename);
      formData.append('sender', deviceName);
      if (note) formData.append('note', note);

      const res = await fetch('/api/upload-snap', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#10B981', '#0071E3', '#38BDF8'],
        });
        showToast('Photo beamed straight to your Mac');
        setPhotoData(null);
        setNote('');
        onClose();
      } else {
        showToast('Failed to send photo');
      }
    } catch (e) {
      showToast('Error sending photo');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="snap-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl"
          onClick={onClose}
        >
          <motion.div 
            key="snap-modal"
            initial={{ opacity: 0, scale: 0.96, filter: 'blur(4px)', y: 6 }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 }}
            exit={{ opacity: 0, scale: 0.97, filter: 'blur(3px)', y: 4 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-md bg-white dark:bg-[#13151B] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl p-6 sm:p-7 text-[#0F1115] dark:text-[#F3F4F6] shadow-2xl transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="apple-press absolute top-4 right-4 w-8 h-8 rounded-full bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.1] dark:hover:bg-white/[0.14] text-[#64748B] dark:text-[#94A3B8] flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center mb-5">
              <div className="inline-flex p-3.5 rounded-2xl bg-[#10B981]/15 text-[#10B981] mb-2.5 shadow-sm">
                <M3CameraIcon className="w-7 h-7" />
              </div>
              <h3 className="font-display text-xl font-extrabold tracking-tight text-[#0F1115] dark:text-[#F3F4F6]">
                Continuity Snap
              </h3>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
                Snap documents or whiteboard notes on Android and beam them straight to your Mac.
              </p>
            </div>

            {/* Hidden Camera Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleCapture}
            />

            {photoData ? (
              <div className="space-y-4">
                <div className="relative max-h-72 rounded-2xl overflow-hidden bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08]">
                  <img
                    src={photoData}
                    alt="Snapped"
                    className="w-full h-auto max-h-72 object-contain mx-auto"
                  />
                  <button
                    onClick={() => setPhotoData(null)}
                    className="apple-press absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional label (e.g. Receipt, Passport, Note)..."
                  className="w-full bg-[#F8FAFC] dark:bg-[#181A22] text-xs text-[#0F1115] dark:text-[#F3F4F6] placeholder-[#64748B] rounded-2xl px-4 py-2.5 border border-black/[0.08] dark:border-white/[0.08] focus:outline-none focus:border-[#10B981] font-sans"
                />

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="apple-press flex-1 py-2.5 rounded-2xl text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] text-[#0F1115] dark:text-[#F3F4F6] transition-colors"
                  >
                    Retake
                  </button>

                  <button
                    onClick={handleSendToMac}
                    disabled={isSending}
                    className="apple-press flex-2 flex items-center justify-center gap-2 py-2.5 px-5 rounded-2xl text-xs sm:text-sm font-bold bg-[#0F1115] hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-[#0B0D13] shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isSending ? (
                      <Sparkles className="w-4 h-4 animate-spin" />
                    ) : (
                      <M3SendIcon className="w-4 h-4" />
                    )}
                    <span>Beam to Mac</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-8 flex flex-col items-center justify-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="apple-press hover-lift w-24 h-24 rounded-full bg-[#10B981]/10 dark:bg-[#10B981]/15 hover:bg-[#10B981]/25 border-2 border-[#10B981]/30 flex flex-col items-center justify-center gap-2 text-[#10B981] transition-colors shadow-sm"
                >
                  <M3CameraIcon className="w-8 h-8" />
                  <span className="text-[11px] font-bold">Snap Now</span>
                </button>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-4 font-medium">
                  Tap to open camera and take picture
                </p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
