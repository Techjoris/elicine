import React from 'react';

export interface ElicineLogoProps {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  textColor?: string;
  onClick?: () => void;
}

export const ElicineLogo: React.FC<ElicineLogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
  textColor = 'text-slate-900 dark:text-white',
  onClick
}) => {
  // Dimensions adaptatives ultra-précises
  const sizeMap = {
    sm: { box: 'w-7 h-7', text: 'text-base sm:text-lg', gap: 'gap-2', dot: 'w-1.5 h-1.5' },
    md: { box: 'w-9 h-9', text: 'text-xl sm:text-2xl', gap: 'gap-2.5', dot: 'w-2 h-2' },
    lg: { box: 'w-12 h-12 sm:w-14 sm:h-14', text: 'text-2xl sm:text-3xl', gap: 'gap-3', dot: 'w-2.5 h-2.5' },
    xl: { box: 'w-20 h-20', text: 'text-4xl sm:text-5xl', gap: 'gap-4', dot: 'w-3 h-3' }
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  // Emblème officiel Éliciné (carré arrondi noir, É blanc, play rouge), décliné par
  // `scripts/build-brand-assets.py` : un seul fichier source pour l'interface, la PWA
  // et l'application Android.
  const iconMark = (
    <img
      src="/logo-mark.png"
      alt="Éliciné"
      draggable={false}
      className={`${currentSize.box} flex-shrink-0 object-contain transition-transform duration-300 group-hover:scale-105 select-none drop-shadow-sm`}
    />
  );


  if (variant === 'icon') {
    return (
      <div
        onClick={onClick}
        className={`inline-flex items-center justify-center cursor-pointer select-none group ${className}`}
        title="Éliciné"
      >
        {iconMark}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center ${currentSize.gap} cursor-pointer select-none group ${className}`}
      title="Éliciné — Le cinéma d'exception, élu pour vous"
    >
      {iconMark}

      {/* Typographie intégrée : "Éliciné" haute précision adaptable clair / sombre */}
      <div className="flex items-baseline leading-none tracking-tight">
        <span className={`${currentSize.text} font-black tracking-tight font-sans flex items-baseline ${textColor} transition-colors`}>
          <span>É</span>
          <span>li</span>
          <span className="font-black">ciné</span>
        </span>
        <span className={`${currentSize.dot} rounded-full bg-[#e50914] ml-1.5`}></span>
      </div>
    </div>
  );
};

export default ElicineLogo;
