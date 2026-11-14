import React from 'react';

// ============================================================================
// Authentic Apple SF Symbols & Hardware Icons (Engineered to match macOS Sequoia & iOS 18)
// ============================================================================

/** Official Apple AirDrop Broadcasting Waves Glyph */
export const AppleAirDropIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Central Target Dot */}
    <circle cx="12" cy="18" r="1.75" fill="currentColor" />
    {/* Inner Wave Arc */}
    <path
      d="M8.2 14.2C9.25 13.15 10.55 12.6 12 12.6C13.45 12.6 14.75 13.15 15.8 14.2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    {/* Middle Wave Arc */}
    <path
      d="M5.4 11.4C7.15 9.65 9.45 8.7 12 8.7C14.55 8.7 16.85 9.65 18.6 11.4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeOpacity="0.85"
    />
    {/* Outer Wave Arc */}
    <path
      d="M2.6 8.6C5.05 6.15 8.35 4.8 12 4.8C15.65 4.8 18.95 6.15 21.4 8.6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeOpacity="0.7"
    />
  </svg>
);

/** Authentic Apple Messages SF Symbol */
export const AppleMessagesIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 3C6.48 3 2 7.03 2 12C2 14.28 2.94 16.36 4.52 17.94C4.24 19.34 3.48 20.47 2.37 21.28C2.18 21.42 2.1 21.66 2.17 21.89C2.25 22.11 2.46 22.26 2.7 22.26C5.58 22.26 8.01 20.69 9.32 19.68C10.18 19.89 11.07 20 12 20C17.52 20 22 15.97 22 11C22 6.03 17.52 3 12 3Z"
      fill="currentColor"
    />
  </svg>
);

/** Authentic Apple MacBook Pro Hardware Glyph */
export const AppleMacBookIcon: React.FC<{ className?: string; active?: boolean }> = ({ 
  className = "w-10 h-10", 
  active: _active = true 
}) => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Screen Outer Aluminum Shell */}
    <rect x="6" y="8" width="36" height="24" rx="3.5" fill="#1D1D1F" stroke="#2C2C2E" strokeWidth="1" />
    {/* Retina Glass Display */}
    <rect x="8" y="10" width="32" height="20" rx="2" fill="url(#macRetinaScreen)" />
    {/* macOS Menu Bar line */}
    <rect x="8" y="10" width="32" height="2.2" fill="rgba(255, 255, 255, 0.2)" />
    {/* Center FaceTime HD Camera dot */}
    <circle cx="24" cy="9.2" r="0.8" fill="#3A3A3C" />
    <circle cx="24" cy="9.2" r="0.4" fill="#5AC8FA" />
    {/* Unibody Aluminum Base */}
    <path
      d="M3 32.5C3 31.67 3.67 31 4.5 31H43.5C44.33 31 45 31.67 45 32.5V33.5C45 35.43 43.43 37 41.5 37H6.5C4.57 37 3 35.43 3 33.5V32.5Z"
      fill="#D1D1D6"
      stroke="#8E8E93"
      strokeWidth="0.75"
    />
    {/* Thumb Display Notch Cutout */}
    <path d="M21 31H27C27 32.1 26.1 33 25 33H23C21.9 33 21 32.1 21 31Z" fill="#8E8E93" />
    {/* Specular Display Glare Line */}
    <path d="M8 10L24 10L14 30H8V10Z" fill="white" fillOpacity="0.06" />
    <defs>
      <linearGradient id="macRetinaScreen" x1="8" y1="10" x2="40" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0071E3" />
        <stop offset="0.6" stopColor="#5AC8FA" />
        <stop offset="1" stopColor="#AF52DE" />
      </linearGradient>
    </defs>
  </svg>
);

/** Authentic Smartphone / Android OLED Hardware Glyph */
export const AppleAndroidPhoneIcon: React.FC<{ className?: string; active?: boolean }> = ({ 
  className = "w-10 h-10", 
  active: _active = true 
}) => (
  <svg viewBox="0 0 36 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Phone Chassis */}
    <rect x="6" y="3" width="24" height="42" rx="6" fill="#1D1D1F" stroke="#3A3A3C" strokeWidth="1" />
    {/* Curved Edge-to-Edge OLED Display */}
    <rect x="7.5" y="4.5" width="21" height="39" rx="4.5" fill="url(#phoneOledScreen)" />
    {/* Punch-hole Selfie Camera */}
    <circle cx="18" cy="7.5" r="1.2" fill="#000000" />
    <circle cx="18" cy="7.5" r="0.5" fill="#34C759" />
    {/* Gesture Home Bar */}
    <rect x="13" y="40.5" width="10" height="1.5" rx="0.75" fill="rgba(255, 255, 255, 0.6)" />
    {/* Screen Glass Reflection */}
    <path d="M7.5 4.5L20 4.5L11 43.5H7.5V4.5Z" fill="white" fillOpacity="0.07" />
    <defs>
      <linearGradient id="phoneOledScreen" x1="7.5" y1="4.5" x2="28.5" y2="43.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0F382A" />
        <stop offset="0.5" stopColor="#1B4D3E" />
        <stop offset="1" stopColor="#34C759" stopOpacity="0.9" />
      </linearGradient>
    </defs>
  </svg>
);

/** Official Apple Photos Multi-Petal Rosette Glyph */
export const ApplePhotosIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* 8-Petal Apple Photos Rosette */}
    <g transform="translate(12, 12)">
      {/* Top Petal - Yellow/Orange */}
      <ellipse cx="0" cy="-6" rx="2.4" ry="4" fill="#FF9500" />
      {/* Top Right - Orange/Red */}
      <ellipse cx="4.24" cy="-4.24" rx="2.4" ry="4" transform="rotate(45 4.24 -4.24)" fill="#FF3B30" />
      {/* Right - Magenta */}
      <ellipse cx="6" cy="0" rx="4" ry="2.4" fill="#AF52DE" />
      {/* Bottom Right - Purple/Blue */}
      <ellipse cx="4.24" cy="4.24" rx="2.4" ry="4" transform="rotate(135 4.24 4.24)" fill="#5856D6" />
      {/* Bottom - System Blue */}
      <ellipse cx="0" cy="6" rx="2.4" ry="4" fill="#0071E3" />
      {/* Bottom Left - Cyan/Teal */}
      <ellipse cx="-4.24" cy="4.24" rx="2.4" ry="4" transform="rotate(45 -4.24 4.24)" fill="#5AC8FA" />
      {/* Left - Mint/Green */}
      <ellipse cx="-6" cy="0" rx="4" ry="2.4" fill="#30B0C7" />
      {/* Top Left - Green */}
      <ellipse cx="-4.24" cy="-4.24" rx="2.4" ry="4" transform="rotate(135 -4.24 -4.24)" fill="#34C759" />
      {/* Center Specular Core */}
      <circle cx="0" cy="0" r="2.8" fill="white" />
    </g>
  </svg>
);

/** Official macOS Finder Aqua Blue Folder */
export const AppleFolderIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Folder Back Plate */}
    <path
      d="M2.5 6C2.5 4.895 3.395 4 4.5 4H8.8C9.33 4 9.84 4.21 10.21 4.59L11.8 6.18C12.18 6.55 12.69 6.76 13.22 6.76H19.5C20.6 6.76 21.5 7.66 21.5 8.76V16.5C21.5 17.6 20.6 18.5 19.5 18.5H4.5C3.395 18.5 2.5 17.6 2.5 16.5V6Z"
      fill="url(#macFolderBack)"
    />
    {/* Folder Front Flap */}
    <path
      d="M2 9.5C2 8.4 2.9 7.5 4 7.5H20C21.1 7.5 22 8.4 22 9.5V16.5C22 17.6 21.1 18.5 20 18.5H4C2.9 18.5 2 17.6 2 16.5V9.5Z"
      fill="url(#macFolderFront)"
      stroke="rgba(255, 255, 255, 0.45)"
      strokeWidth="0.6"
    />
    <defs>
      <linearGradient id="macFolderBack" x1="2.5" y1="4" x2="21.5" y2="18.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#0062C4" />
        <stop offset="1" stopColor="#004791" />
      </linearGradient>
      <linearGradient id="macFolderFront" x1="2" y1="7.5" x2="22" y2="18.5" gradientUnits="userSpaceOnUse">
        <stop stopColor="#5AC8FA" />
        <stop offset="1" stopColor="#0071E3" />
      </linearGradient>
    </defs>
  </svg>
);

/** Official Apple Camera SF Symbol */
export const AppleCameraIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Camera Body */}
    <path
      d="M4 8C4 6.895 4.895 6 6 6H7.83C8.42 6 8.98 5.74 9.36 5.28L9.95 4.57C10.45 3.97 11.2 3.62 11.98 3.62H12.02C12.8 3.62 13.55 3.97 14.05 4.57L14.64 5.28C15.02 5.74 15.58 6 16.17 6H18C19.105 6 20 6.895 20 8V17C20 18.105 19.105 19 18 19H6C4.895 19 4 18.105 4 17V8Z"
      fill="#1D1D1F"
    />
    {/* Outer Lens Ring */}
    <circle cx="12" cy="12.5" r="4.25" fill="#3A3A3C" stroke="#48484A" strokeWidth="0.8" />
    {/* Inner Lens Glass */}
    <circle cx="12" cy="12.5" r="2.75" fill="#0071E3" />
    {/* Lens Specular Reflection */}
    <circle cx="13" cy="11.5" r="0.75" fill="white" fillOpacity="0.8" />
    {/* Flash Dot */}
    <circle cx="17.2" cy="8.2" r="0.9" fill="#FFCC00" />
  </svg>
);

/** Official Apple Document Icon */
export const AppleDocumentIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    {/* Page body with folded corner */}
    <path
      d="M5 3.5C5 2.67 5.67 2 6.5 2H14.5L19 6.5V20.5C19 21.33 18.33 22 17.5 22H6.5C5.67 22 5 21.33 5 20.5V3.5Z"
      fill="#FFFFFF"
      stroke="#D1D1D6"
      strokeWidth="1"
    />
    {/* Fold flap */}
    <path
      d="M14 2V6C14 6.55 14.45 7 15 7H19L14 2Z"
      fill="#E5E5EA"
      stroke="#D1D1D6"
      strokeWidth="0.8"
    />
    {/* Content preview bars */}
    <rect x="7.5" y="11" width="9" height="1.5" rx="0.75" fill="#8E8E93" />
    <rect x="7.5" y="14.5" width="7" height="1.5" rx="0.75" fill="#AEAEB2" />
    <rect x="7.5" y="18" width="5" height="1.5" rx="0.75" fill="#D1D1D6" />
  </svg>
);

/** Official Apple Battery Capsule Pill */
export const AppleBatteryPill: React.FC<{ level: number; charging?: boolean; className?: string }> = ({ 
  level, 
  charging = false, 
  className = "" 
}) => {
  const isLow = level <= 20;
  const fillColor = isLow ? '#FF3B30' : '#34C759';

  return (
    <div className={`inline-flex items-center gap-1.5 bg-black/[0.04] px-2 py-0.5 rounded-full text-[11px] font-mono tabular-nums font-semibold text-[#1D1D1F] ${className}`}>
      {/* Battery capsule */}
      <div className="relative w-5 h-2.5 rounded-[3px] border border-black/40 p-[1px] flex items-center">
        <div 
          className="h-full rounded-[1.5px] transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(10, level))}%`, backgroundColor: fillColor }}
        />
        {/* Positive terminal nub */}
        <div className="absolute -right-[2.5px] top-[2px] w-[1.5px] h-[3px] rounded-r-[0.5px] bg-black/40" />
      </div>
      <span>{level}%</span>
      {charging && (
        <svg className="w-2.5 h-2.5 fill-[#34C759]" viewBox="0 0 24 24">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      )}
    </div>
  );
};
