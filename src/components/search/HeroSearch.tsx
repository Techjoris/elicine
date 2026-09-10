import React, { useState, useRef, useEffect } from 'react';
import { Search as SearchIcon, Sparkles, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface HeroSearchProps {
  onSearch?: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export const HeroSearch: React.FC<HeroSearchProps> = ({
  onSearch,
  isLoading = false,
  placeholder = "Décrivez une ambiance, une émotion..."
}) => {
  const { quota, user, setIsProModalOpen, showToast, useAiQuota } = useApp();
  const [query, setQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remainingCredits = quota.remaining;
  const isPro = user?.isPro;

  // Auto-resize du textarea : démarre strictement à 1 ligne (28px) et grandit UNIQUEMENT si le texte dépasse
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (!query) {
      textarea.style.height = '28px';
      return;
    }

    textarea.style.height = 'auto';
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 28), 120);
    textarea.style.height = `${nextHeight}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [query]);

  useEffect(() => {
    const handleResize = () => adjustTextareaHeight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      const isMobileDevice = typeof window !== 'undefined' && (
        window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      );

      // Sur mobile : saut de ligne naturel
      if (isMobileDevice) {
        return;
      }

      // Sur desktop : Entrée soumet la recherche, Shift + Entrée insère un saut de ligne
      if (!e.shiftKey) {
        e.preventDefault();
        handleSearchSubmit();
      }
    }
  };

  const handleSearchSubmit = () => {
    const q = query.trim();

    if (!q) {
      showToast('Veuillez décrire le film ou l\'ambiance souhaitée.');
      return;
    }

    if (!useAiQuota()) {
      return;
    }

    if (onSearch) {
      onSearch(q);
    }
  };

  return (
    <div className="relative flex items-end min-h-[48px] w-full max-w-2xl mx-auto rounded-2xl border border-white/15 dark:border-zinc-700/80 bg-zinc-900/80 dark:bg-zinc-950/80 backdrop-blur-xl px-2.5 sm:px-3 py-1.5 shadow-2xl focus-within:border-cyan-500/80 transition-all">
      {/* Search icon - Aligné au centre vertical de la première ligne */}
      <div className="pl-1 pr-2 text-zinc-400 flex-shrink-0 self-start mt-2">
        <SearchIcon className="w-4 h-4 sm:w-5 sm:h-5" />
      </div>

      {/* Textarea auto-extensible */}
      <textarea
        ref={textareaRef}
        rows={1}
        className="flex-1 w-full bg-transparent text-sm sm:text-base text-zinc-100 placeholder-zinc-400 outline-none px-1.5 py-1 min-w-0 font-normal resize-none overflow-y-auto max-h-[120px] leading-6 scrollbar-thin scrollbar-thumb-zinc-700"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      {/* Integrated Quota Badge + Explorer Button inside the pill - Alignés en bas */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 self-end mb-0.5 sm:mb-1">
        {/* Quota Badge */}
        <button
          type="button"
          onClick={() => setIsProModalOpen(true)}
          title="Pass Pro : Quotas IA illimités, filtres avancés & alertes personnalisées" 
          className="text-[11px] font-semibold px-2 py-1 sm:py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20"
        >
          <span>⚡</span>
          <span className="hidden sm:inline font-bold">Illimité</span>
        </button>

        {/* Explorer Button */}
        <button
          type="button"
          onClick={handleSearchSubmit}
          disabled={isLoading}
          className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white font-medium text-xs sm:text-sm flex items-center gap-1 sm:gap-1.5 shadow-md shadow-blue-500/25 hover:opacity-95 active:scale-95 transition-transform disabled:opacity-50 cursor-pointer flex-shrink-0"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-white" />
          ) : (
            <span>✨</span>
          )}
          <span className="hidden sm:inline">
            {isLoading ? 'Recherche...' : 'Explorer'}
          </span>
        </button>
      </div>
    </div>
  );
};

export const SearchInput = HeroSearch;
export default HeroSearch;
