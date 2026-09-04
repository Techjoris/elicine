import React from 'react';

export interface ElicineLogoProps {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export const ElicineLogo: React.FC<ElicineLogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
  onClick
}) => {
  // Dimensions selon la taille choisie
  const sizeMap = {
    sm: { box: 'w-6 h-6', text: 'text-lg', play: 'w-2 h-2 -top-1.5 left-0.5', gap: 'gap-2' },
    md: { box: 'w-9 h-9', text: 'text-xl', play: 'w-2.5 h-2.5 -top-2 left-0.5', gap: 'gap-2.5' },
    lg: { box: 'w-12 h-12', text: 'text-3xl', play: 'w-3.5 h-3.5 -top-3 left-1', gap: 'gap-3.5' }
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  // L'icône vectorielle SVG pure : Diaphragme cinéma 35mm + étincelle IA centrale
  const iconSvg = (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${currentSize.box} flex-shrink-0 transition-transform duration-300 group-hover:scale-105 select-none`}
    >
      <defs>
        <linearGradient id="elApertureCyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
        <linearGradient id="elApertureAmber" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#FBBF24" />
        </linearGradient>
        <radialGradient id="elApertureGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.55" />
          <stop offset="60%" stopColor="#0284C7" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0284C7" stopOpacity="0" />
        </radialGradient>
        <filter id="elSparkGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Cadre Squircle / Boîtier optique */}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="26"
        fill="#030712"
        stroke="url(#elApertureCyan)"
        strokeWidth="2.5"
        strokeOpacity="0.9"
      />

      {/* Repères optiques 35mm */}
      <circle cx="50" cy="50" r="39" stroke="#1E293B" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
      <circle cx="50" cy="11" r="1.5" fill="#38BDF8" opacity="0.9" />
      <circle cx="89" cy="50" r="1.5" fill="#38BDF8" opacity="0.9" />
      <circle cx="50" cy="89" r="1.5" fill="#38BDF8" opacity="0.9" />
      <circle cx="11" cy="50" r="1.5" fill="#38BDF8" opacity="0.9" />

      {/* 6 Lames d'ouverture cinématographique (Iris Aperture) */}
      <g stroke="url(#elApertureCyan)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 50 16 C 63 16 74 24 79 36 L 59 47 C 56 38 52 35 50 34 Z" fill="#0A1120" fillOpacity="0.9" />
        <path d="M 50 16 C 63 16 74 24 79 36 L 59 47 C 56 38 52 35 50 34 Z" fill="#0A1120" fillOpacity="0.9" transform="rotate(60, 50, 50)" />
        <path d="M 50 16 C 63 16 74 24 79 36 L 59 47 C 56 38 52 35 50 34 Z" fill="#0A1120" fillOpacity="0.9" transform="rotate(120, 50, 50)" />
        <path d="M 50 16 C 63 16 74 24 79 36 L 59 47 C 56 38 52 35 50 34 Z" fill="#0A1120" fillOpacity="0.9" transform="rotate(180, 50, 50)" />
        <path d="M 50 16 C 63 16 74 24 79 36 L 59 47 C 56 38 52 35 50 34 Z" fill="#0A1120" fillOpacity="0.9" transform="rotate(240, 50, 50)" />
        <path d="M 50 16 C 63 16 74 24 79 36 L 59 47 C 56 38 52 35 50 34 Z" fill="#0A1120" fillOpacity="0.9" transform="rotate(300, 50, 50)" />
      </g>

      {/* Halo radial central */}
      <circle cx="50" cy="50" r="22" fill="url(#elApertureGlow)" />

      {/* Étincelle IA centrale à 4 pointes (AI Sparkle) */}
      <path
        d="M 50 28 Q 50 50 72 50 Q 50 50 50 72 Q 50 50 28 50 Q 50 50 50 28 Z"
        fill="url(#elApertureAmber)"
        filter="url(#elSparkGlow)"
      />

      {/* Cœur lumineux étincelant */}
      <path
        d="M 50 39 Q 50 50 61 50 Q 50 50 50 61 Q 50 50 39 50 Q 50 50 50 39 Z"
        fill="#FFFDF2"
      />
      <circle cx="50" cy="50" r="2.2" fill="#FFFFFF" />
    </svg>
  );

  if (variant === 'icon') {
    return (
      <div
        onClick={onClick}
        className={`inline-flex items-center justify-center cursor-pointer select-none group ${className}`}
        title="Éliciné"
      >
        {iconSvg}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center ${currentSize.gap} cursor-pointer select-none group ${className}`}
      title="Éliciné — Le cinéma d'exception, élu pour vous"
    >
      {iconSvg}

      {/* Typographie intégrée : "Éliciné" avec accent aigu en flèche Play */}
      <div className="flex items-baseline leading-none">
        <span className={`${currentSize.text} font-black tracking-tight text-white font-sans flex items-baseline`}>
          {/* Lettre É avec accent aigu en miniature flèche Play */}
          <span className="relative inline-block">
            <svg
              viewBox="0 0 12 12"
              className={`absolute ${currentSize.play} -rotate-12 fill-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.9)]`}
            >
              <polygon points="2,1 11,6 2,11" />
            </svg>
            <span>E</span>
          </span>
          <span>li</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-300">
            ciné
          </span>
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-1 shadow-[0_0_8px_#f59e0b]"></span>
      </div>
    </div>
  );
};

export default ElicineLogo;
