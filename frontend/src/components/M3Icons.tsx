import React from 'react';

// ============================================================================
// Material 3 Custom Iconography System
// Built according to https://m3.material.io/styles/icons/designing-icons
// - 24x24dp standard coordinate space (20x20dp live area)
// - 2dp consistent stroke width
// - 2dp-3dp smooth interior/exterior corner rounding
// - Optical centering and keyline geometric harmony
// ============================================================================

interface IconProps {
  className?: string;
  filled?: boolean;
}

/** M3 AirDrop / Beam Icon: Concentric rounded broadcast arcs with focal pill emitter */
export const M3AirDropIcon: React.FC<IconProps> = ({ className = "w-6 h-6", filled = false }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Focal point emitter */}
    <circle cx="12" cy="18" r={filled ? "2" : "1.75"} fill="currentColor" stroke="none" />
    
    {/* Inner broadcast arc (r=4.5) */}
    <path 
      d="M8.5 14.5C9.4 13.5 10.6 13 12 13C13.4 13 14.6 13.5 15.5 14.5" 
      stroke="currentColor" 
    />
    
    {/* Mid broadcast arc (r=7.5) */}
    <path 
      d="M5.5 11.5C7.2 9.7 9.5 8.7 12 8.7C14.5 8.7 16.8 9.7 18.5 11.5" 
      stroke="currentColor" 
      strokeOpacity={filled ? "1" : "0.85"}
    />
    
    {/* Outer broadcast arc (r=10.5) */}
    <path 
      d="M2.8 8.6C5.2 6.1 8.4 4.7 12 4.7C15.6 4.7 18.8 6.1 21.2 8.6" 
      stroke="currentColor" 
      strokeOpacity={filled ? "1" : "0.7"}
    />
  </svg>
);

/** M3 Universal Clipboard Icon: Rounded 24dp pad with clip tab and content geometry */
export const M3ClipboardIcon: React.FC<IconProps> = ({ className = "w-6 h-6", filled = false }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Main Clipboard Body (rounded rect) */}
    <rect 
      x="4" 
      y="5" 
      width="16" 
      height="16" 
      rx="3" 
      stroke="currentColor" 
      fill={filled ? "currentColor" : "none"}
      fillOpacity={filled ? "0.15" : "0"}
    />
    {/* Top Clip Tab */}
    <path 
      d="M9 3H15C15.55 3 16 3.45 16 4V5C16 5.55 15.55 6 15 6H9C8.45 6 8 5.55 8 5V4C8 3.45 8.45 3 9 3Z" 
      stroke="currentColor" 
      fill="currentColor"
    />
    {/* Content lines */}
    <path d="M8 10H16" stroke="currentColor" />
    <path d="M8 14H13" stroke="currentColor" />
  </svg>
);

/** M3 Messages / Chat Icon: Organic squircle bubble with conversation matrix */
export const M3ChatIcon: React.FC<IconProps> = ({ className = "w-6 h-6", filled = false }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path 
      d="M20 11C20 6.58 16.42 3 12 3C7.58 3 4 6.58 4 11C4 13.06 4.78 14.93 6.06 16.36C6.18 16.5 6.24 16.68 6.21 16.86L5.5 20.5L9.36 19.46C9.52 19.42 9.69 19.44 9.83 19.53C10.51 19.83 11.24 20 12 20C16.42 20 20 16.42 20 11Z" 
      stroke="currentColor" 
      fill={filled ? "currentColor" : "none"}
      fillOpacity={filled ? "0.15" : "0"}
    />
    {/* 3 Conversation dots */}
    <circle cx="8.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="11.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/** M3 Bento Tools & Utilities Icon: Precision slider toggles & spark glyph */
export const M3ToolsIcon: React.FC<IconProps> = ({ className = "w-6 h-6", filled = false }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Slider track 1 */}
    <path d="M4 7H12" stroke="currentColor" />
    <path d="M18 7H20" stroke="currentColor" />
    <circle cx="15" cy="7" r="2.5" stroke="currentColor" fill={filled ? "currentColor" : "none"} />

    {/* Slider track 2 */}
    <path d="M4 17H6" stroke="currentColor" />
    <path d="M12 17H20" stroke="currentColor" />
    <circle cx="9" cy="17" r="2.5" stroke="currentColor" fill={filled ? "currentColor" : "none"} />
  </svg>
);

/** M3 Sun Icon for Light Theme */
export const M3SunIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4.5" stroke="currentColor" fill="currentColor" fillOpacity="0.2" />
    <path d="M12 2V4" stroke="currentColor" />
    <path d="M12 20V22" stroke="currentColor" />
    <path d="M4.93 4.93L6.34 6.34" stroke="currentColor" />
    <path d="M17.66 17.66L19.07 19.07" stroke="currentColor" />
    <path d="M2 12H4" stroke="currentColor" />
    <path d="M20 12H22" stroke="currentColor" />
    <path d="M4.93 19.07L6.34 17.66" stroke="currentColor" />
    <path d="M17.66 6.34L19.07 4.93" stroke="currentColor" />
  </svg>
);

/** M3 Moon Icon for Dark Theme */
export const M3MoonIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path 
      d="M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79Z" 
      stroke="currentColor" 
      fill="currentColor"
      fillOpacity="0.2"
    />
  </svg>
);

/** M3 Laptop / MacBook Hardware Glyph */
export const M3MacBookIcon: React.FC<{ className?: string; active?: boolean }> = ({ 
  className = "w-8 h-8", 
  active = true 
}) => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Screen Outer Lid */}
    <rect 
      x="7" 
      y="9" 
      width="34" 
      height="22" 
      rx="3.5" 
      fill={active ? "#16181F" : "#22252F"} 
      stroke="#3A3F50" 
      strokeWidth="1.2" 
    />
    {/* Display Glass */}
    <rect 
      x="9" 
      y="11" 
      width="30" 
      height="18" 
      rx="2" 
      fill="url(#macRetinaGradient)" 
    />
    {/* Top FaceTime Notch */}
    <rect x="22" y="11" width="4" height="1.8" rx="0.9" fill="#16181F" />
    <circle cx="24" cy="11.9" r="0.5" fill="#38BDF8" />
    {/* Unibody Base with Rounded Corners */}
    <path 
      d="M4 31.5C4 30.67 4.67 30 5.5 30H42.5C43.33 30 44 30.67 44 31.5V32.5C44 34.43 42.43 36 40.5 36H7.5C5.57 36 4 34.43 4 32.5V31.5Z" 
      fill="#D1D5DB" 
      stroke="#9CA3AF" 
      strokeWidth="0.8" 
    />
    {/* Center Thumb Notch */}
    <path d="M21.5 30H26.5C26.5 31.1 25.6 32 24.5 32H23.5C22.4 32 21.5 31.1 21.5 30Z" fill="#9CA3AF" />
    {/* Ambient Screen Light Accent */}
    <defs>
      <linearGradient id="macRetinaGradient" x1="9" y1="11" x2="39" y2="29" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2563EB" />
        <stop offset="0.6" stopColor="#0284C7" />
        <stop offset="1" stopColor="#0D9488" />
      </linearGradient>
    </defs>
  </svg>
);

/** M3 Smartphone / Android Hardware Glyph */
export const M3PhoneIcon: React.FC<{ className?: string; active?: boolean }> = ({ 
  className = "w-8 h-8", 
  active = true 
}) => (
  <svg viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Phone Chassis */}
    <rect 
      x="6" 
      y="4" 
      width="24" 
      height="40" 
      rx="6" 
      fill={active ? "#13151B" : "#1F232D"} 
      stroke="#3A3F50" 
      strokeWidth="1.2" 
    />
    {/* Curved Edge Display */}
    <rect 
      x="7.5" 
      y="5.5" 
      width="21" 
      height="37" 
      rx="4.5" 
      fill="url(#phoneOledGradient)" 
    />
    {/* Punch-hole Camera */}
    <circle cx="18" cy="8.5" r="1.1" fill="#0A0B0E" />
    <circle cx="18" cy="8.5" r="0.45" fill="#10B981" />
    {/* Gesture Pill */}
    <rect x="13.5" y="39.5" width="9" height="1.5" rx="0.75" fill="rgba(255, 255, 255, 0.75)" />
    <defs>
      <linearGradient id="phoneOledGradient" x1="7.5" y1="5.5" x2="28.5" y2="42.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#064E3B" />
        <stop offset="0.5" stopColor="#047857" />
        <stop offset="1" stopColor="#10B981" />
      </linearGradient>
    </defs>
  </svg>
);

/** M3 Folder Icon */
export const M3FolderIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path 
      d="M3 6.5C3 5.4 3.9 4.5 5 4.5H9.2C9.7 4.5 10.2 4.7 10.6 5.1L12 6.5H19C20.1 6.5 21 7.4 21 8.5V17.5C21 18.6 20.1 19.5 19 19.5H5C3.9 19.5 3 18.6 3 17.5V6.5Z" 
      stroke="currentColor" 
      fill="currentColor"
      fillOpacity="0.15"
    />
  </svg>
);

/** M3 Photos / Media Rosette */
export const M3PhotosIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" />
    <circle cx="8.5" cy="8.5" r="1.75" fill="currentColor" stroke="none" />
    <path d="M21 15L16 10L6 20" stroke="currentColor" />
    <path d="M14 18L17 15L21 19" stroke="currentColor" />
  </svg>
);

/** M3 Camera Icon */
export const M3CameraIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path 
      d="M4 8C4 6.9 4.9 6 6 6H7.8C8.3 6 8.8 5.7 9.1 5.3L9.7 4.5C10.1 4 10.8 3.7 11.5 3.7H12.5C13.2 3.7 13.9 4 14.3 4.5L14.9 5.3C15.2 5.7 15.7 6 16.2 6H18C19.1 6 20 6.9 20 8V17C20 18.1 19.1 19 18 19H6C4.9 19 4 18.1 4 17V8Z" 
      stroke="currentColor" 
      fill="currentColor"
      fillOpacity="0.12"
    />
    <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" />
  </svg>
);

/** M3 Document / File Icon */
export const M3DocumentIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 2H14L19 7V20C19 21.1 18.1 22 17 22H6C4.9 22 4 21.1 4 20V4C4 2.9 4.9 2 6 2Z" stroke="currentColor" />
    <path d="M14 2V7H19" stroke="currentColor" />
    <path d="M8 12H15" stroke="currentColor" />
    <path d="M8 16H12" stroke="currentColor" />
  </svg>
);

/** M3 OLED Battery Capsule Pill */
export const M3BatteryPill: React.FC<{ level: number; charging?: boolean; className?: string }> = ({ 
  level, 
  charging = false, 
  className = "" 
}) => {
  const isLow = level <= 20;
  
  // Refined battery indicators
  const fillBg = isLow ? 'bg-red-500' : 'bg-emerald-500';

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono tabular-nums font-semibold bg-black/[0.05] dark:bg-white/[0.08] text-[#0F1115] dark:text-[#F3F4F6] border border-black/[0.05] dark:border-white/[0.08] ${className}`}>
      {/* Battery shell */}
      <div className="relative w-5 h-2.5 rounded-[3px] border border-black/40 dark:border-white/40 p-[1px] flex items-center">
        <div 
          className={`h-full rounded-[1.5px] transition-all duration-300 ${fillBg}`}
          style={{ width: `${Math.min(100, Math.max(10, level))}%` }}
        />
        {/* Positive terminal nub */}
        <div className="absolute -right-[2.5px] top-[2px] w-[1.5px] h-[3px] rounded-r-[0.5px] bg-black/40 dark:bg-white/40" />
      </div>
      <span>{level}%</span>
      {charging && (
        <svg className="w-2.5 h-2.5 fill-[#F59E0B] text-[#F59E0B]" viewBox="0 0 24 24">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      )}
    </div>
  );
};

/** M3 Send Message Icon */
export const M3SendIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 2L11 13" stroke="currentColor" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" />
  </svg>
);

/** M3 Checkmark Icon */
export const M3CheckIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6L9 17L4 12" stroke="currentColor" />
  </svg>
);

/** M3 Copy Icon */
export const M3CopyIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2.5" stroke="currentColor" />
    <path d="M5 15H4C2.9 15 2 14.1 2 13V4C2 2.9 2.9 2 4 2H13C14.1 2 15 2.9 15 4V5" stroke="currentColor" />
  </svg>
);

/** M3 Trash Icon */
export const M3TrashIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6H21" stroke="currentColor" />
    <path d="M19 6V20C19 21.1 18.1 22 17 22H7C5.9 22 5 21.1 5 20V6" stroke="currentColor" />
    <path d="M8 6V4C8 2.9 8.9 2 10 2H14C15.1 2 16 2.9 16 4V6" stroke="currentColor" />
  </svg>
);

/** M3 QR Code Icon */
export const M3QrCodeIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" />
    <path d="M14 14H15" stroke="currentColor" />
    <path d="M19 14V17" stroke="currentColor" />
    <path d="M14 19H17" stroke="currentColor" />
    <path d="M20 20H21" stroke="currentColor" />
  </svg>
);

/** M3 Volume / Sound Icon */
export const M3VolumeIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="currentColor" fill="currentColor" fillOpacity="0.15" />
    <path d="M15.54 8.46C16.48 9.4 17 10.65 17 12C17 13.35 16.48 14.6 15.54 15.54" stroke="currentColor" />
    <path d="M19.07 4.93C20.94 6.8 22 9.35 22 12C22 14.65 20.94 17.2 19.07 19.07" stroke="currentColor" />
  </svg>
);

/** M3 Volume Mute / Silent Icon */
export const M3VolumeMuteIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="currentColor" fill="currentColor" fillOpacity="0.15" />
    <line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" />
    <line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" />
  </svg>
);

/** M3 Phone Vibrate / Ring Icon */
export const M3VibrateIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="7" y="4" width="10" height="16" rx="2" stroke="currentColor" />
    <path d="M2 8L2 16" stroke="currentColor" />
    <path d="M22 8L22 16" stroke="currentColor" />
    <path d="M11 17H13" stroke="currentColor" />
  </svg>
);

/** M3 Sparkles / AI / Magic Icon */
export const M3SparklesIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    className={className}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 2L14.2 8.3L20.5 10.5L14.2 12.7L12 19L9.8 12.7L3.5 10.5L9.8 8.3L12 2Z" stroke="currentColor" fill="currentColor" fillOpacity="0.15" />
    <path d="M19 16L20 18.5L22.5 19.5L20 20.5L19 23L18 20.5L15.5 19.5L18 18.5L19 16Z" stroke="currentColor" />
  </svg>
);
