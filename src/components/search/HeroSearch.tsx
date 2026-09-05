import React, { useState } from 'react';
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
  placeholder = "Décrivez une émotion, une ambiance..."
}) => {
  const { quota, user, setIsProModalOpen, showToast, useAiQuota } = useApp();
  const [query, setQuery] = useState('');

  const remainingCredits = quota.remaining;
  const isPro = user?.isPro;

  const handleSearchSubmit = () => {
    const q = query.trim();

    if (!q) {
      showToast('Veuillez décrire le film ou l\'ambiance souhaitée.');
      return;
    }

    useAiQuota();

    if (onSearch) {
      onSearch(q);
    }
  };

  return (
    <div className="relative flex items-center w-full max-w-2xl mx-auto rounded-2xl border border-white/15 dark:border-zinc-700/80 bg-zinc-900/80 dark:bg-zinc-950/80 backdrop-blur-xl p-1.5 sm:p-2 shadow-2xl focus-within:border-cyan-500/80 transition-all">
      {/* Search icon */}
      <div className="pl-3 pr-2 text-zinc-400 flex-shrink-0">
        <SearchIcon className="w-5 h-5" />
      </div>

      {/* Input field */}
      <input
        type="text"
        className="flex-1 bg-transparent text-sm sm:text-base text-zinc-100 placeholder-zinc-400 outline-none px-1 py-2 min-w-0"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSearchSubmit();
        }}
      />

      {/* Integrated Quota Badge + Explorer Button inside the pill */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {/* Quota Badge */}
        <button
          type="button"
          onClick={() => setIsProModalOpen(true)}
          title="Exploration IA illimitée" 
          className="text-[11px] font-semibold px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20"
        >
          <span>⚡</span>
          <span className="font-bold">Illimité</span>
        </button>

        {/* Explorer Button */}
        <button
          type="button"
          onClick={handleSearchSubmit}
          disabled={isLoading}
          className="px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:opacity-95 active:scale-95 transition-transform disabled:opacity-50 cursor-pointer flex-shrink-0"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <span>✨</span>
          )}
          <span className="hidden xs:inline sm:inline">
            {isLoading ? 'Recherche...' : 'Explorer'}
          </span>
        </button>
      </div>
    </div>
  );
};

export const SearchInput = HeroSearch;
export default HeroSearch;
