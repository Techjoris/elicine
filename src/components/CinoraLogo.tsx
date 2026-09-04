import React from 'react';

interface CinoraLogoProps {
  className?: string;
  showSparkle?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const CinoraLogo: React.FC<CinoraLogoProps> = ({ 
  className = "h-8", 
  showSparkle = true,
  size = 'md'
}) => {
  const iconSizes = {
    sm: "w-8 h-8 rounded-xl",
    md: "w-10 h-10 rounded-2xl",
    lg: "w-12 h-12 rounded-2xl"
  };

  const svgSizes = {
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-7 h-7"
  };

  const textSizes = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl"
  };

  return (
    <div className={`flex items-center gap-3 select-none cursor-pointer group ${className}`}>
      {/* Symbole du C projecteur & Étincelle */}
      <div className={`relative flex items-center justify-center ${iconSizes[size]} bg-slate-950 border border-slate-800 shadow-md shadow-sky-500/10 group-hover:border-sky-500/40 group-hover:shadow-sky-500/25 transition-all flex-shrink-0`}>
        <svg viewBox="0 0 100 100" fill="none" className={svgSizes[size]}>
          <defs>
            <linearGradient id="cinoraGradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#38BDF8" />
              <stop offset="100%" stopColor="#6366F1" />
            </linearGradient>
            <filter id="sparkleGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* C majuscule sculpté comme un objectif/faisceau */}
          <path
            d="M75 26 C 62 13, 38 13, 25 26 C 10 41, 10 59, 25 74 C 38 87, 62 87, 75 74"
            stroke="url(#cinoraGradient)"
            strokeWidth="11"
            strokeLinecap="round"
          />

          {/* Faisceau lumineux subtil en transparence */}
          <polygon
            points="38,50 72,32 72,68"
            fill="url(#cinoraGradient)"
            fillOpacity="0.18"
          />

          {/* Étincelle IA à 4 branches (✦) */}
          {showSparkle && (
            <path
              d="M70 38 C 70 45, 74 48, 81 48 C 74 48, 70 51, 70 58 C 70 51, 66 48, 59 48 C 66 48, 70 45, 70 38 Z"
              fill="#38BDF8"
              filter="url(#sparkleGlow)"
              className="animate-pulse"
            />
          )}
        </svg>
      </div>

      {/* Typographie Cinora */}
      <div className="flex items-baseline tracking-tight">
        <span className={`${textSizes[size]} font-black text-white`}>Cin</span>
        <span className={`${textSizes[size]} font-extrabold bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent`}>
          ora
        </span>
        <span className="w-1.5 h-1.5 ml-1 rounded-full bg-sky-400 inline-block shadow-sm shadow-sky-400"></span>
      </div>
    </div>
  );
};

export default CinoraLogo;
