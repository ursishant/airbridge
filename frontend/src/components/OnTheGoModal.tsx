import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Smartphone, 
  Laptop, 
  Cable, 
  Download, 
  Plane,
  Radio
} from 'lucide-react';

interface OnTheGoModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredPrompt: any;
  onInstallPwa: () => void;
  isAndroid: boolean;
  isMac: boolean;
}

export const OnTheGoModal: React.FC<OnTheGoModalProps> = ({
  isOpen,
  onClose,
  deferredPrompt,
  onInstallPwa,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'install' | 'hotspot' | 'usb'>('install');

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="onthego-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl"
          onClick={onClose}
        >
          <motion.div 
            key="onthego-modal"
            initial={{ opacity: 0, scale: 0.96, filter: 'blur(4px)', y: 6 }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 }}
            exit={{ opacity: 0, scale: 0.97, filter: 'blur(3px)', y: 4 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl bg-white dark:bg-[#13151B] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl shadow-2xl p-6 sm:p-7 text-[#0F1115] dark:text-[#F3F4F6] max-h-[90vh] overflow-y-auto transition-colors"
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

            {/* Modal Header */}
            <div className="text-center mb-6">
              <div className="inline-flex p-3 rounded-2xl bg-[#0071E3]/15 text-[#0071E3] dark:text-[#38BDF8] mb-2 shadow-sm">
                <Plane className="w-6 h-6" />
              </div>
              <h2 className="font-display text-xl font-extrabold tracking-tight text-[#0F1115] dark:text-[#F3F4F6]">
                AirBridge "On The Go"
              </h2>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
                Install as native apps and connect anywhere without home Wi-Fi.
              </p>
            </div>

            {/* Segmented Control */}
            <div className="grid grid-cols-3 gap-1 bg-black/[0.05] dark:bg-white/[0.06] p-1 rounded-2xl mb-6 text-xs font-semibold">
              <button
                onClick={() => setActiveSubTab('install')}
                className={`apple-press relative py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeSubTab === 'install'
                    ? 'bg-white dark:bg-[#1F222C] text-[#0F1115] dark:text-white shadow-sm'
                    : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white'
                }`}
              >
                <Download className="w-3.5 h-3.5 text-[#0071E3] dark:text-[#38BDF8]" />
                <span className="font-display">Install Apps</span>
              </button>

              <button
                onClick={() => setActiveSubTab('hotspot')}
                className={`apple-press relative py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeSubTab === 'hotspot'
                    ? 'bg-white dark:bg-[#1F222C] text-[#0F1115] dark:text-white shadow-sm'
                    : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-[#10B981] dark:text-[#34D399]" />
                <span className="font-display">Hotspot Mode</span>
              </button>

              <button
                onClick={() => setActiveSubTab('usb')}
                className={`apple-press relative py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeSubTab === 'usb'
                    ? 'bg-white dark:bg-[#1F222C] text-[#0F1115] dark:text-white shadow-sm'
                    : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F1115] dark:hover:text-white'
                }`}
              >
                <Cable className="w-3.5 h-3.5 text-[#8B5CF6] dark:text-[#A78BFA]" />
                <span className="font-display">USB Cable</span>
              </button>
            </div>

            {/* Sub Tab Views */}
            <AnimatePresence mode="wait">
              {activeSubTab === 'install' && (
                <motion.div 
                  key="install-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4"
                >
                  {/* Android Card */}
                  <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-[#10B981]/15 text-[#10B981]">
                          <Smartphone className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-display text-sm font-bold text-[#0F1115] dark:text-[#F3F4F6]">Android App (PWA)</h4>
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Add to home screen & Share Sheet</p>
                        </div>
                      </div>

                      {deferredPrompt ? (
                        <button
                          onClick={onInstallPwa}
                          className="apple-press flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#10B981] text-white shadow-sm"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Install</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981]">
                          Ready
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-[#0F1115] dark:text-[#F3F4F6] space-y-1.5 bg-white dark:bg-[#181A22] p-3.5 rounded-xl border border-black/[0.05] dark:border-white/[0.06] shadow-sm">
                      <p className="font-semibold text-[#10B981]">How to install on Android:</p>
                      <p>1. Open Chrome or Samsung Internet on Android.</p>
                      <p>2. Tap the <strong>⋮ (three dots menu)</strong>.</p>
                      <p>3. Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</p>
                      <p className="text-[#64748B] dark:text-[#94A3B8] text-[11px] mt-1">
                        Automatically appears in your Android <strong>Share Sheet</strong>! Beam photos directly from Gallery.
                      </p>
                    </div>
                  </div>

                  {/* Mac Card */}
                  <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-[#0071E3]/15 dark:bg-[#38BDF8]/15 text-[#0071E3] dark:text-[#38BDF8]">
                          <Laptop className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-display text-sm font-bold text-[#0F1115] dark:text-[#F3F4F6]">macOS Desktop App</h4>
                          <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">AirBridge.app bundle in your folder</p>
                        </div>
                      </div>

                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#0071E3]/10 dark:bg-[#38BDF8]/10 text-[#0071E3] dark:text-[#38BDF8]">
                        Ready
                      </span>
                    </div>

                    <div className="text-xs text-[#0F1115] dark:text-[#F3F4F6] space-y-1.5 bg-white dark:bg-[#181A22] p-3.5 rounded-xl border border-black/[0.05] dark:border-white/[0.06] shadow-sm">
                      <p className="font-semibold text-[#0071E3] dark:text-[#38BDF8]">How to use on Mac:</p>
                      <p>1. Double-click <strong>AirBridge.app</strong> in your project directory.</p>
                      <p>2. Drag it into your <strong>/Applications</strong> folder or Dock for 1-click launch anytime.</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeSubTab === 'hotspot' && (
                <motion.div 
                  key="hotspot-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4"
                >
                  <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06] space-y-3 text-xs text-[#0F1115] dark:text-[#F3F4F6]">
                    <div className="flex items-center gap-2 font-bold text-sm text-[#0F1115] dark:text-[#F3F4F6]">
                      <Radio className="w-4 h-4 text-[#0071E3] dark:text-[#38BDF8]" />
                      <span>Connect Anywhere (Trains, Flights, Parks, Cafes)</span>
                    </div>
                    <p className="text-[#64748B] dark:text-[#94A3B8]">
                      You don't need a Wi-Fi router or home internet to connect Mac & Android.
                    </p>

                    <div className="space-y-2 mt-2">
                      <div className="p-4 rounded-xl bg-white dark:bg-[#181A22] border border-black/[0.05] dark:border-white/[0.06] shadow-sm space-y-1.5">
                        <p className="font-semibold text-[#10B981]">Android Personal Hotspot (Recommended)</p>
                        <p>1. On your Android phone, turn on <strong>Personal Hotspot</strong>.</p>
                        <p>2. Connect your Mac to your phone's Wi-Fi network.</p>
                        <p>3. Open AirBridge — everything works at full speed, even with zero cellular data!</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeSubTab === 'usb' && (
                <motion.div 
                  key="usb-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-4"
                >
                  <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06] space-y-3 text-xs text-[#0F1115] dark:text-[#F3F4F6]">
                    <div className="flex items-center gap-2 font-bold text-sm text-[#8B5CF6] dark:text-[#A78BFA]">
                      <Cable className="w-4 h-4 text-[#8B5CF6] dark:text-[#A78BFA]" />
                      <span>Zero Wi-Fi USB-C Cable Mode</span>
                    </div>
                    <p className="text-[#64748B] dark:text-[#94A3B8]">
                      When Wi-Fi is disabled (e.g., inside an airplane cabin):
                    </p>

                    <div className="p-4 rounded-xl bg-white dark:bg-[#181A22] border border-black/[0.05] dark:border-white/[0.06] shadow-sm space-y-1.5">
                      <p className="font-semibold text-[#8B5CF6] dark:text-[#A78BFA]">1-Toggle USB Tethering:</p>
                      <p>1. Connect your Android phone to your Mac with a USB-C cable.</p>
                      <p>2. On Android, go to <strong>Settings → Network → Hotspot &amp; tethering → USB tethering</strong> (toggle ON).</p>
                      <p>3. macOS instantly establishes a direct hardware network link at up to 10 Gbps speeds!</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Done Button */}
            <button
              onClick={onClose}
              className="apple-press mt-6 w-full py-2.5 px-4 rounded-2xl font-bold text-xs sm:text-sm bg-[#0F1115] hover:bg-black text-white dark:bg-white dark:hover:bg-slate-100 dark:text-[#0B0D13] shadow-sm transition-colors"
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
