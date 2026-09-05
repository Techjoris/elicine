import React, { useId } from 'react';

export interface ElicineLogoProps {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

export const ElicineLogo: React.FC<ElicineLogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
  onClick
}) => {
  const idPrefix = useId().replace(/:/g, '');

  // Dimensions adaptatives ultra-précises
  const sizeMap = {
    sm: { box: 'w-7 h-7', text: 'text-base sm:text-lg', gap: 'gap-2', dot: 'w-1.5 h-1.5' },
    md: { box: 'w-9 h-9', text: 'text-xl sm:text-2xl', gap: 'gap-2.5', dot: 'w-2 h-2' },
    lg: { box: 'w-12 h-12 sm:w-14 sm:h-14', text: 'text-2xl sm:text-3xl', gap: 'gap-3', dot: 'w-2.5 h-2.5' },
    xl: { box: 'w-20 h-20', text: 'text-4xl sm:text-5xl', gap: 'gap-4', dot: 'w-3 h-3' }
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  // Emblème vectoriel minimaliste & architectural : "É" blanc optique, play-wedge cyan et étoile 4-points
  const iconSvg = (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${currentSize.box} flex-shrink-0 transition-transform duration-300 group-hover:scale-105 select-none`}
    >
      <defs>
        {/* Cyan Refraction Gradient for Play Triangle */}
        <linearGradient id={`${idPrefix}-play`} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#00b4d8" />
          <stop offset="50%" stopColor="#00d2ff" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>

        {/* Star Accent Gradient */}
        <linearGradient id={`${idPrefix}-star`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#ffffff" />
          <stop offset="80%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#00d2ff" />
        </linearGradient>
      </defs>

      {/* 1. Deep Slate Canvas with Precision Squircle (rx=120) */}
      <rect width="512" height="512" rx="120" fill="#090b10" />
      <rect x="1" y="1" width="510" height="510" rx="119" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="2" />

      {/* 2. The Architectural 'É' Spine and Arms (Solid Optical White #FFFFFF) */}
      <path
        d="M 144 160
           L 344 160
           C 346.2 160 348 161.8 348 164
           L 348 200
           C 348 202.2 346.2 204 344 204
           L 180 204
           L 180 336
           L 344 336
           C 346.2 336 348 337.8 348 340
           L 348 376
           C 348 378.2 346.2 380 344 380
           L 144 380
           C 139.6 380 136 376.4 136 372
           L 136 168
           C 136 163.6 139.6 160 144 160 Z"
        fill="#FFFFFF"
      />

      {/* 3. Dynamic Play Wedge / Triangle (Luminous Cyan #00d2ff) */}
      <path
        d="M 212 230
           C 216 226 222 229 226 232
           L 346 266
           C 352 268 352 272 346 274
           L 226 308
           C 222 311 216 314 212 310
           C 208 307 208 301 208 296
           L 208 244
           C 208 239 208 233 212 230 Z"
        fill={`url(#${idPrefix}-play)`}
      />

      {/* 4. Acute Accent: Elegant Razor-Thin 4-Point AI Discovery Diamond Star */}
      <path
        d="M 270 70
           Q 270 106 296 106
           Q 270 106 270 142
           Q 270 106 244 106
           Q 270 106 270 70 Z"
        fill={`url(#${idPrefix}-star)`}
      />
      <circle cx="270" cy="106" r="3.5" fill="#FFFFFF" />
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

      {/* Typographie intégrée : "Éliciné" haute précision */}
      <div className="flex items-baseline leading-none tracking-tight">
        <span className={`${currentSize.text} font-black tracking-tight text-white font-sans flex items-baseline`}>
          <span>Éli</span>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-200">
            ciné
          </span>
        </span>
        <span className={`${currentSize.dot} rounded-full bg-cyan-400 ml-1.5 shadow-[0_0_8px_#00d2ff] animate-pulse`}></span>
      </div>
    </div>
  );
};

export default ElicineLogo;
