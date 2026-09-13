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
      className={`relative w-full max-w-xl mx-auto rounded-2xl transition-all duration-300 ${
        isPro 
          ? 'bg-zinc-900/60 border border-amber-500/30 p-2.5 sm:p-3 shadow-lg' 
          : 'bg-zinc-950/70 border border-amber-500/20 hover:border-amber-400/40 p-2.5 sm:p-3 shadow-md cursor-pointer group backdrop-blur-md'
      }`}
      title={!isPro ? "Filtres avancés réservés aux abonnés Pro (1.99$). Cliquez pour débloquer." : undefined}
    >
      {/* En-tête : Badge PRO & Indication */}
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
            <Crown className="w-3 h-3" />
          </span>
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
            Filtres Avancés
            {isPro ? (
              <span className="ml-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-md">
                PRO ACTIF
              </span>
            ) : (
              <span className="ml-1 text-[10px] font-semibold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-1.5 py-0.5 rounded-md flex items-center gap-1 group-hover:scale-105 transition-transform">
                <Lock className="w-2.5 h-2.5" />
                <span>PRO (1.99$)</span>
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
              className="text-[10px] sm:text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-white/10 transition-all cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Réinitialiser</span>
            </button>
          )
        ) : (
          <span className="text-[10px] font-medium text-amber-400/90 group-hover:text-amber-300 flex items-center gap-1 underline underline-offset-2">
            <span>Débloquer</span>
            <span>→</span>
          </span>
        )}
      </div>

      {/* Grille des sélecteurs (Plateformes & Notes) */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs transition-all ${
        !isPro ? 'opacity-65 pointer-events-none select-none filter blur-[0.3px]' : ''
      }`}>
        
        {/* 1. Sélecteur de Plateforme */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 pl-1">
            Plateforme SVOD
          </label>
          <div className="relative">
            <select
              value={selectedPlatform}
              disabled={!isPro}
              onChange={(e) => onSelectPlatform(e.target.value)}
              className="w-full appearance-none bg-black/60 border border-white/10 focus:border-amber-400/60 rounded-xl px-3 py-2 text-xs font-medium text-zinc-200 outline-none cursor-pointer transition-colors"
            >
              {STREAMING_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* 2. Sélecteur de Note Minimale */}
        <div className="flex flex-col gap-1 text-left">
          <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 pl-1">
            Note minimale (IMDb / TMDB)
          </label>
          <div className="relative">
            <select
              value={selectedMinRating}
              disabled={!isPro}
              onChange={(e) => onSelectMinRating(Number(e.target.value))}
              className="w-full appearance-none bg-black/60 border border-white/10 focus:border-amber-400/60 rounded-xl px-3 py-2 text-xs font-medium text-zinc-200 outline-none cursor-pointer transition-colors"
            >
              {MIN_RATING_OPTIONS.map((r) => (
                <option key={r.value} value={r.value} className="bg-zinc-900 text-white">
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

      </div>

      {/* Overlay informatif doux au survol pour les utilisateurs gratuits */}
      {!isPro && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[1px]">
          <div className="px-3 py-1.5 rounded-full bg-amber-500 text-black font-black text-[11px] shadow-lg flex items-center gap-1.5 transform scale-95 group-hover:scale-100 transition-transform">
            <Crown className="w-3.5 h-3.5 fill-current" />
            <span>Passer à Pro (1.99 $) pour filtrer par plateforme & note</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedSearchFilters;
