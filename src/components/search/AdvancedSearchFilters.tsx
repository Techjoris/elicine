import React from 'react';
import { Lock, Crown, Sparkles, X, ChevronDown } from 'lucide-react';

export interface FilterPlatform {
  id: string;
  name: string;
  shortName: string;
  color: string;
  badgeBg: string;
  badgeText: string;
}

export const STREAMING_PLATFORMS: FilterPlatform[] = [
  { id: 'all', name: 'Toutes plateformes', shortName: 'Toutes', color: 'border-white/10', badgeBg: 'bg-zinc-800', badgeText: 'text-zinc-300' },
  { id: 'netflix', name: 'Netflix', shortName: 'Netflix', color: 'border-red-500/40', badgeBg: 'bg-red-600', badgeText: 'text-white' },
  { id: 'prime', name: 'Prime Video', shortName: 'Prime Video', color: 'border-sky-500/40', badgeBg: 'bg-[#00a8e1]', badgeText: 'text-white' },
  { id: 'disney', name: 'Disney+', shortName: 'Disney+', color: 'border-blue-500/40', badgeBg: 'bg-blue-600', badgeText: 'text-white' },
  { id: 'apple', name: 'Apple TV+', shortName: 'Apple TV+', color: 'border-zinc-400/40', badgeBg: 'bg-zinc-800', badgeText: 'text-zinc-100' },
  { id: 'canal', name: 'Canal+', shortName: 'Canal+', color: 'border-yellow-500/40', badgeBg: 'bg-black', badgeText: 'text-yellow-400' },
  { id: 'paramount', name: 'Paramount+', shortName: 'Paramount+', color: 'border-blue-600/40', badgeBg: 'bg-blue-700', badgeText: 'text-white' },
  { id: 'max', name: 'Max (HBO)', shortName: 'Max', color: 'border-purple-500/40', badgeBg: 'bg-purple-600', badgeText: 'text-white' },
];

export const MIN_RATING_OPTIONS = [
  { value: 0, label: 'Toutes les notes', shortLabel: 'Toutes' },
  { value: 6, label: '⭐ 6+ (Bien noté)', shortLabel: '6+ ⭐' },
  { value: 7, label: '⭐ 7+ (Très bon)', shortLabel: '7+ ⭐' },
  { value: 8, label: '⭐ 8+ (Chef-d\'œuvre)', shortLabel: '8+ ⭐' },
];

interface AdvancedSearchFiltersProps {
  selectedPlatform: string;
  onSelectPlatform: (platformId: string) => void;
  selectedMinRating: number;
  onSelectMinRating: (rating: number) => void;
  isPro: boolean;
  onTriggerProModal: () => void;
}

export const AdvancedSearchFilters: React.FC<AdvancedSearchFiltersProps> = ({
  selectedPlatform,
  onSelectPlatform,
  selectedMinRating,
  onSelectMinRating,
  isPro,
  onTriggerProModal
}) => {
  const hasActiveFilters = (selectedPlatform !== 'all' && Boolean(selectedPlatform)) || selectedMinRating > 0;

  const handleContainerClick = (e: React.MouseEvent) => {
    if (!isPro) {
      e.preventDefault();
      e.stopPropagation();
      onTriggerProModal();
    }
  };

  const resetFilters = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectPlatform('all');
    onSelectMinRating(0);
  };

  return (
    <div 
      onClick={handleContainerClick}
      className={`relative w-full max-w-lg mx-auto rounded-xl sm:rounded-2xl transition-all duration-300 p-2 sm:p-2.5 backdrop-blur-md ${
        isPro 
          ? 'bg-zinc-950/40 border border-white/10 hover:border-white/15 shadow-sm' 
          : 'bg-zinc-950/40 border border-white/10 hover:border-amber-500/30 shadow-sm cursor-pointer group'
      }`}
      title={!isPro ? "Filtres avancés réservés aux abonnés Pro (1.99$). Cliquez pour débloquer." : undefined}
    >
      {/* En-tête ultra-compact : Badge PRO & Réinitialiser/Débloquer */}
      <div className="flex items-center justify-between gap-2 mb-1.5 px-0.5">
        <div className="flex items-center gap-1.5">
          <Crown className="w-3 h-3 text-amber-400/90" />
          <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
            Filtres Pro
            {isPro ? (
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                ACTIF
              </span>
            ) : (
              <span className="text-[9px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5 group-hover:bg-amber-500/20 transition-colors">
                <Lock className="w-2.5 h-2.5" />
                <span>1.99$</span>
              </span>
            )}
          </span>
        </div>

        {/* Bouton de réinitialisation si Pro & filtres actifs, ou CTA Pro discret si Free */}
        {isPro ? (
          hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-2.5 h-2.5" />
              <span>Réinitialiser</span>
            </button>
          )
        ) : (
          <span className="text-[10px] font-medium text-amber-400/80 group-hover:text-amber-300 flex items-center gap-0.5">
            <span>Débloquer</span>
            <span>→</span>
          </span>
        )}
      </div>

      {/* Agencement Inline sur une seule ligne (Grid 2 colonnes) */}
      <div className={`grid grid-cols-2 gap-2 text-xs transition-all ${
        !isPro ? 'opacity-60 pointer-events-none select-none filter blur-[0.2px]' : ''
      }`}>
        
        {/* 1. Sélecteur Plateforme (Label fusionné dans le placeholder) */}
        <div className="relative">
          <select
            value={selectedPlatform}
            disabled={!isPro}
            onChange={(e) => onSelectPlatform(e.target.value)}
            className="w-full appearance-none bg-black/40 hover:bg-black/60 border border-white/10 focus:border-white/25 rounded-lg px-2.5 py-1.5 pr-7 text-[11px] sm:text-xs font-medium text-zinc-200 outline-none cursor-pointer transition-colors"
          >
            <option value="all" className="bg-zinc-900 text-white">Plateforme : Toutes</option>
            {STREAMING_PLATFORMS.filter(p => p.id !== 'all').map((p) => (
              <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* 2. Sélecteur Note Minimale (Label fusionné dans le placeholder) */}
        <div className="relative">
          <select
            value={selectedMinRating}
            disabled={!isPro}
            onChange={(e) => onSelectMinRating(Number(e.target.value))}
            className="w-full appearance-none bg-black/40 hover:bg-black/60 border border-white/10 focus:border-white/25 rounded-lg px-2.5 py-1.5 pr-7 text-[11px] sm:text-xs font-medium text-zinc-200 outline-none cursor-pointer transition-colors"
          >
            <option value={0} className="bg-zinc-900 text-white">Note : Toutes</option>
            {MIN_RATING_OPTIONS.filter(r => r.value !== 0).map((r) => (
              <option key={r.value} value={r.value} className="bg-zinc-900 text-white">
                {r.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

      </div>

      {/* Overlay informatif discret au survol pour les utilisateurs gratuits */}
      {!isPro && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl sm:rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
          <div className="px-2.5 py-1 rounded-full bg-amber-500 text-black font-bold text-[10px] sm:text-[11px] shadow-md flex items-center gap-1.5 transform scale-95 group-hover:scale-100 transition-transform">
            <Crown className="w-3 h-3 fill-current" />
            <span>Débloquer avec le Pass Pro (1.99 $)</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedSearchFilters;
