import React from 'react';
import {
  M3MacBookIcon,
  M3PhoneIcon,
  M3WindowsPcIcon,
  M3IosPhoneIcon,
  M3LinuxIcon,
} from './M3Icons';

export type NormalizedOs = 'macOS' | 'Windows' | 'Linux' | 'iOS' | 'Android' | 'Browser';

/** Normalize raw OS / sender labels into a canonical platform identifier. */
export function normalizeOs(os?: string): NormalizedOs {
  const s = (os || '').toLowerCase();
  if (s.includes('win')) return 'Windows';
  if (s.includes('mac') || s.includes('darwin')) return 'macOS';
  if (s.includes('ios') || s.includes('iphone') || s.includes('ipad')) return 'iOS';
  if (s.includes('linux')) return 'Linux';
  if (s.includes('android')) return 'Android';
  return 'Browser';
}

/** Return a clean human-readable label for the local server host OS. */
export function getHostLabel(info?: { os?: string; isWindows?: boolean; isMac?: boolean } | null): string {
  if (info?.isWindows || (info?.os || '').toLowerCase().includes('win')) return 'Windows';
  if (info?.isMac || (info?.os || '').toLowerCase().includes('mac')) return 'Mac';
  if (info?.os) return info.os;
  return 'Host';
}

/** Semantic pill styling keyed by platform for uniform badge rendering across components. */
export function getOsBadgeTheme(os?: string): { pill: string; label: NormalizedOs } {
  const normalized = normalizeOs(os);
  switch (normalized) {
    case 'macOS':
      return {
        label: 'macOS',
        pill: 'bg-[#0071E3]/10 text-[#0071E3] dark:text-[#38BDF8] border border-[#0071E3]/20',
      };
    case 'Windows':
      return {
        label: 'Windows',
        pill: 'bg-[#0078D4]/10 text-[#0078D4] dark:text-[#60A5FA] border border-[#0078D4]/20',
      };
    case 'iOS':
      return {
        label: 'iOS',
        pill: 'bg-[#6366F1]/10 text-[#4F46E5] dark:text-[#A5B4FC] border border-[#6366F1]/20',
      };
    case 'Linux':
      return {
        label: 'Linux',
        pill: 'bg-[#F59E0B]/10 text-[#D97706] dark:text-[#FBBF24] border border-[#F59E0B]/20',
      };
    case 'Android':
      return {
        label: 'Android',
        pill: 'bg-[#10B981]/10 text-[#059669] dark:text-[#34D399] border border-[#10B981]/20',
      };
    default:
      return {
        label: 'Browser',
        pill: 'bg-black/[0.05] dark:bg-white/[0.08] text-[#475569] dark:text-[#CBD5E1] border border-black/[0.06] dark:border-white/[0.08]',
      };
  }
}

interface DeviceOsIconProps {
  os?: string;
  className?: string;
  active?: boolean;
}

/** Unified OS-aware hardware glyph renderer across macOS, Windows, Linux, iOS, and Android. */
export const DeviceOsIcon: React.FC<DeviceOsIconProps> = ({
  os,
  className = 'w-5 h-5',
  active = true,
}) => {
  const normalized = normalizeOs(os);
  if (normalized === 'Windows') {
    return <M3WindowsPcIcon className={className} active={active} />;
  }
  if (normalized === 'macOS') {
    return <M3MacBookIcon className={className} active={active} />;
  }
  if (normalized === 'iOS') {
    return <M3IosPhoneIcon className={className} active={active} />;
  }
  if (normalized === 'Linux') {
    return <M3LinuxIcon className={`${className} text-[#F59E0B]`} />;
  }
  return <M3PhoneIcon className={className} active={active} />;
};
