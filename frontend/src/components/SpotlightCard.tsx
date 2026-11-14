import React, { useRef } from 'react';

interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  spotlightColor?: string;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  onClick,
  spotlightColor = 'rgba(0, 113, 227, 0.08)',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // Emil Kowalski performance rule: direct DOM mutation without triggering React re-renders
    if (!cardRef.current || !spotlightRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spotlightRef.current.style.background = `radial-gradient(350px circle at ${x}px ${y}px, ${spotlightColor}, transparent 70%)`;
  };

  const handleMouseEnter = () => {
    if (spotlightRef.current) {
      spotlightRef.current.style.opacity = '1';
    }
  };

  const handleMouseLeave = () => {
    if (spotlightRef.current) {
      spotlightRef.current.style.opacity = '0';
    }
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`relative overflow-hidden apple-glass-card rounded-3xl border border-black/[0.06] shadow-apple-card transition-[border-color,box-shadow] duration-200 ${className}`}
    >
      {/* Specular Radial Light Sheen: 120fps hardware accelerated via direct DOM style mutation */}
      <div
        ref={spotlightRef}
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-200 ease-out"
        style={{
          background: `radial-gradient(350px circle at 0px 0px, ${spotlightColor}, transparent 70%)`,
        }}
      />
      
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
