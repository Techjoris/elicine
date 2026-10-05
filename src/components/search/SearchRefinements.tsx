import React from 'react';
import { Wand2 } from 'lucide-react';
import type { SearchRefinement } from '../../search/refinementSuggestions';

interface SearchRefinementsProps {
  refinements: SearchRefinement[];
  /** Plateforme citée dans la requête et effectivement appliquée aux résultats. */
  appliedPlatform?: { id: string; label: string };
  onSelect?: (query: string) => void;
}

/**
 * Bandeau d'affinage affiché sous les résultats d'une recherche par catégorie.
 * Chaque puce relance la recherche avec une précision supplémentaire.
 */
export const SearchRefinements: React.FC<SearchRefinementsProps> = ({
  refinements,
  appliedPlatform,
  onSelect
}) => {
  if ((!refinements || refinements.length === 0) && !appliedPlatform) return null;

  const handleSelect = (query: string) => {
    if (onSelect) onSelect(query);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('elicine-trigger-search', { detail: { prompt: query } })
      );
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#121212] p-3.5 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
          <Wand2 className="w-3.5 h-3.5 text-[#e50914]" />
          <span>Affiner la recherche</span>
        </div>

        {appliedPlatform && (
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-400 font-semibold">
            Uniquement sur {appliedPlatform.label}
          </span>
        )}
      </div>

      {refinements && refinements.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {refinements.map((refinement) => (
            <button
              key={refinement.id}
              type="button"
              onClick={() => handleSelect(refinement.query)}
              title={`Relancer la recherche : ${refinement.query}`}
              className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-white/[0.06] hover:bg-[#e50914]/10 dark:hover:bg-[#e50914]/15 text-slate-700 dark:text-zinc-200 hover:text-[#e50914] dark:hover:text-red-300 border border-slate-200 dark:border-white/10 hover:border-[#e50914]/40 transition-all cursor-pointer active:scale-[0.98]"
            >
              <span aria-hidden="true">{refinement.emoji}</span>
              <span>{refinement.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchRefinements;
