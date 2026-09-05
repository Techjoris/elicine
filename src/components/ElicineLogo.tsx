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

  // Dimensions adaptatives
  const sizeMap = {
    sm: { box: 'w-7 h-7', text: 'text-base sm:text-lg', gap: 'gap-2', dot: 'w-1.5 h-1.5' },
    md: { box: 'w-9 h-9', text: 'text-xl sm:text-2xl', gap: 'gap-2.5', dot: 'w-2 h-2' },
    lg: { box: 'w-12 h-12 sm:w-14 sm:h-14', text: 'text-2xl sm:text-3xl', gap: 'gap-3', dot: 'w-2.5 h-2.5' },
    xl: { box: 'w-20 h-20', text: 'text-4xl sm:text-5xl', gap: 'gap-4', dot: 'w-3 h-3' }
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  // L'emblème vectoriel officiel Éliciné : É sculpté, triangle Play cinéma et étincelle IA
  const iconSvg = (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${currentSize.box} flex-shrink-0 transition-transform duration-300 group-hover:scale-105 select-none drop-shadow-[0_0_12px_rgba(6,182,212,0.3)]`}
    >
      <defs>
        {/* Background Radial Gradient */}
        <radialGradient id={`${idPrefix}-bg`} cx="50%" cy="44%" r="65%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="50%" stopColor="#080c18" />
          <stop offset="100%" stopColor="#030509" />
        </radialGradient>

        {/* Outer Squircle Border Gradient */}
        <linearGradient id={`${idPrefix}-border`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.75" />
          <stop offset="40%" stopColor="#06b6d4" stopOpacity="0.9" />
          <stop offset="75%" stopColor="#f59e0b" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.5" />
        </linearGradient>

        {/* Ambient Core Glow */}
        <radialGradient id={`${idPrefix}-glow`} cx="50%" cy="52%" r="50%">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#6366f1" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </radialGradient>

        {/* 'É' Architectural Frame Gradient */}
        <linearGradient id={`${idPrefix}-frame`} x1="15%" y1="85%" x2="85%" y2="15%">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="30%" stopColor="#06b6d4" />
          <stop offset="70%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>

        {/* Frame Chiseled Highlight */}
        <linearGradient id={`${idPrefix}-chisel`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
        </linearGradient>

        {/* Dynamic Play Triangle Gradient */}
        <linearGradient id={`${idPrefix}-play`} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#0891b2" />
          <stop offset="35%" stopColor="#06b6d4" />
          <stop offset="70%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>

        {/* Play Core Luminous Gradient */}
        <linearGradient id={`${idPrefix}-playcore`} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.2" />
          <stop offset="50%" stopColor="#fffbeb" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>

        {/* Accent Gradient */}
        <linearGradient id={`${idPrefix}-accent`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="60%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>

        {/* AI Spark Gradient */}
        <radialGradient id={`${idPrefix}-spark`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#fffbeb" />
          <stop offset="70%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </radialGradient>
      </defs>

      {/* 1. Squircle Base Container */}
      <rect
        x="20"
        y="20"
        width="472"
        height="472"
        rx="112"
        fill={`url(#${idPrefix}-bg)`}
        stroke={`url(#${idPrefix}-border)`}
        strokeWidth="3.5"
      />

      {/* 2. Ambient Light Corona */}
      <circle cx="260" cy="272" r="160" fill={`url(#${idPrefix}-glow)`} />

      {/* 3. Architectural 'É' Outer Frame (Stem, Top and Bottom Arms) */}
      <path
        d="M 166 144
           L 338 144
           C 346 144 351 149 348 157
           L 337 186
           C 334 192 328 196 321 196
           L 194 196
           C 190.7 196 188 198.7 188 202
           L 188 338
           C 188 341.3 190.7 344 194 344
           L 321 344
           C 328 344 334 348 337 354
           L 348 383
           C 351 391 346 396 338 396
           L 166 396
           C 147.2 396 132 380.8 132 362
           L 132 178
           C 132 159.2 147.2 144 166 144 Z"
        fill={`url(#${idPrefix}-frame)`}
      />

      {/* Frame 3D Chiseled Overlay */}
      <path
        d="M 166 144
           L 338 144
           C 346 144 351 149 348 157
           L 337 186
           C 334 192 328 196 321 196
           L 194 196
           C 190.7 196 188 198.7 188 202
           L 188 338
           C 188 341.3 190.7 344 194 344
           L 321 344
           C 328 344 334 348 337 354
           L 348 383
           C 351 391 346 396 338 396
           L 166 396
           C 147.2 396 132 380.8 132 362
           L 132 178
           C 132 159.2 147.2 144 166 144 Z"
        fill={`url(#${idPrefix}-chisel)`}
      />

      {/* 4. Cinema 35mm Perforations on Stem */}
      <g>
        <rect x="152" y="222" width="14" height="22" rx="5" fill="#050811" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.8" />
        <rect x="152" y="259" width="14" height="22" rx="5" fill="#050811" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.8" />
        <rect x="152" y="296" width="14" height="22" rx="5" fill="#050811" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.8" />
      </g>

      {/* 5. Middle Bar: Dynamic Glowing Cinema Play Triangle */}
      <path
        d="M 218 223
           C 225 218 234 222 239 227
           L 348 263
           C 356 266 356 274 348 277
           L 239 313
           C 234 318 225 322 218 317
           C 212 312 212 304 212 296
           L 212 244
           C 212 236 212 228 218 223 Z"
        fill={`url(#${idPrefix}-play)`}
      />

      {/* Play Triangle Luminous Core */}
      <path
        d="M 224 238
           C 227 235 233 237 236 240
           L 326 267
           C 330 269 330 271 326 273
           L 236 300
           C 233 303 227 305 224 302
           C 220 299 220 294 220 288
           L 220 252
           C 220 246 220 241 224 238 Z"
        fill={`url(#${idPrefix}-playcore)`}
        opacity="0.95"
      />

      {/* 6. Acute Accent of the 'É' */}
      <path
        d="M 218 122
           L 282 82
           C 287 79 288 72 284 68
           C 280 64 273 65 269 68
           L 206 108
           C 201 111 200 118 204 122
           C 208 126 214 125 218 122 Z"
        fill={`url(#${idPrefix}-accent)`}
      />

      {/* 7. AI Intelligence 4-Pointed Starburst Spark */}
      <path
        d="M 310 28
           Q 310 68 350 68
           Q 310 68 310 108
           Q 310 68 270 68
           Q 310 68 310 28 Z"
        fill={`url(#${idPrefix}-spark)`}
      />

      {/* Inner Diamond Core */}
      <path
        d="M 310 46
           Q 310 68 332 68
           Q 310 68 310 90
           Q 310 68 288 68
           Q 310 68 310 46 Z"
        fill="#ffffff"
      />
      <circle cx="310" cy="68" r="4" fill="#ffffff" />
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
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-cyan-300 to-amber-400">
            ciné
          </span>
        </span>
        <span className={`${currentSize.dot} rounded-full bg-amber-400 ml-1.5 shadow-[0_0_10px_#f59e0b] animate-pulse`}></span>
      </div>
    </div>
  );
};

export default ElicineLogo;
