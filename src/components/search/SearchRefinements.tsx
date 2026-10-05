import React from 'react';
import { Wand2, Sparkles, X } from 'lucide-react';
import type { SearchRefinement } from '../../search/refinementSuggestions';

interface SearchRefinementsProps {
  refinements: SearchRefinement[];
  /** Requête d'origine, proposée telle quelle dans le bouton « rechercher sans affiner ». */
  baseQuery?: string;
  /** Plateforme citée dans la requête et effectivement appliquée aux résultats. */
  appliedPlatform?: { id: string; label: string };
  title?: string;
  onSelect?: (query: string) => void;
  /** Relance la recherche d'origine sans passer par une suggestion. */
  onSearchAsIs?: () => void;
  onDismiss?: () => void;
}

/**
 * Étape d'affinage proposée AVANT de lancer la recherche.
 *
 * Une demande qui n'exprime qu'une catégorie (« films d'action ») est confirmée
 * ici, gratuitement et sans appel IA : l'utilisateur choisit une précision, ou
 * demande explicitement les résultats tels quels. La recherche coûteuse n'est
 * déclenchée qu'après ce choix, ce qui évite de payer deux interprétations.
 */
export const SearchRefinements: React.FC<SearchRefinementsProps> = ({
  refinements,
  baseQuery,
  appliedPlatform,
  title,
  onSelect,
  onSearchAsIs,
  onDismiss
}) => {
  if ((!refinements || refinements.length === 0) && !appliedPlatform) return null;

  return (
    <div className="rounded-2xl border border-white/12 bg-zinc-950/85 backdrop-blur-2xl p-3.5 sm:p-4 space-y-3 shadow-xl text-left animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-zinc-300">
          <Wand2 className="w-3.5 h-3.5 text-[#e50914]" />
          <span>{title || 'Affiner la recherche'}</span>
        </div>

        <div className="flex items-center gap-2">
          {appliedPlatform && (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 font-semibold">
              Uniquement sur {appliedPlatform.label}
            </span>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              title="Fermer"
              aria-label="Fermer les suggestions d'affinage"
              className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {refinements && refinements.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {refinements.map((refinement) => (
            <button
              key={refinement.id}
              type="button"
              onClick={() => onSelect?.(refinement.query)}
              title={`Rechercher : ${refinement.query}`}
              className="group inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-white/[0.07] hover:bg-[#e50914]/20 text-zinc-100 hover:text-white border border-white/12 hover:border-[#e50914]/50 transition-all cursor-pointer active:scale-[0.98]"
            >
              <span aria-hidden="true">{refinement.emoji}</span>
              <span>{refinement.label}</span>
            </button>
          ))}
        </div>
      )}

      {onSearchAsIs && baseQuery && (
        <button
          type="button"
          onClick={onSearchAsIs}
          className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-semibold text-zinc-300 hover:text-white underline decoration-zinc-600 hover:decoration-white underline-offset-4 transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Lancer la recherche « {baseQuery} » sans affiner</span>
        </button>
      )}
    </div>
  );
};

export default SearchRefinements;
