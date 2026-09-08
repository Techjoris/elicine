import React, { useState, useCallback } from 'react';
import { MovieGrid } from '../movies/MovieGrid';
import { fetchMoviesByPlatform, PLATFORM_PROVIDER_IDS } from '../../services/tmdb';
import { useInfiniteCatalog } from '../../hooks/useInfiniteCatalog';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';
import { Movie } from '../../types';
import { Tv, Film, Clapperboard, ArrowUpDown } from 'lucide-react';

export interface PlatformItem {
  id: string;
  name: string;
  shortName: string;
  providerId: number;
  color: string;
  badgeBg: string;
  badgeText: string;
  symbol: string;
}

export const PLATFORMS: PlatformItem[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    shortName: 'Netflix',
    providerId: PLATFORM_PROVIDER_IDS.NETFLIX,
    color: 'from-red-600 via-red-700 to-red-900',
    badgeBg: 'bg-red-600',
    badgeText: 'text-white',
    symbol: 'N'
  },
  {
    id: 'prime',
    name: 'Amazon Prime Video',
    shortName: 'Prime Video',
    providerId: PLATFORM_PROVIDER_IDS.PRIME,
    color: 'from-sky-500 via-blue-600 to-blue-800',
    badgeBg: 'bg-[#00a8e1]',
    badgeText: 'text-white',
    symbol: 'P'
  },
  {
    id: 'disney',
    name: 'Disney+',
    shortName: 'Disney+',
    providerId: PLATFORM_PROVIDER_IDS.DISNEY,
    color: 'from-blue-700 via-indigo-800 to-indigo-950',
    badgeBg: 'bg-blue-600',
    badgeText: 'text-white',
    symbol: 'D+'
  },
  {
    id: 'apple',
    name: 'Apple TV+',
    shortName: 'Apple TV+',
    providerId: PLATFORM_PROVIDER_IDS.APPLE_TV,
    color: 'from-zinc-700 via-zinc-800 to-zinc-950',
    badgeBg: 'bg-zinc-800',
    badgeText: 'text-white',
    symbol: ''
  },
  {
    id: 'max',
    name: 'Max / HBO',
    shortName: 'Max',
    providerId: PLATFORM_PROVIDER_IDS.MAX,
    color: 'from-purple-600 via-indigo-700 to-purple-900',
    badgeBg: 'bg-purple-600',
    badgeText: 'text-white',
    symbol: 'MAX'
  },
  {
    id: 'canal',
    name: 'Canal+',
    shortName: 'Canal+',
    providerId: PLATFORM_PROVIDER_IDS.CANAL,
    color: 'from-slate-800 via-slate-900 to-black',
    badgeBg: 'bg-black',
    badgeText: 'text-white',
    symbol: 'C+'
  },
  {
    id: 'paramount',
    name: 'Paramount+',
    shortName: 'Paramount+',
    providerId: PLATFORM_PROVIDER_IDS.PARAMOUNT,
    color: 'from-blue-600 via-blue-700 to-blue-900',
    badgeBg: 'bg-[#0064ff]',
    badgeText: 'text-white',
    symbol: 'P+'
  }
];

type MediaFilter = 'all' | 'movie' | 'tv';
type SortOption  = 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc';

export const PlatformsView: React.FC = () => {
  const { apiSettings } = useApp();
  const { t } = useTranslation();
  const key = apiSettings.tmdbApiKey;

  const [selectedPlatform, setSelectedPlatform] = useState<PlatformItem>(PLATFORMS[0]);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('popularity.desc');

  // ─── Wrapped in useCallback so useInfiniteCatalog gets a stable reference ─
  const fetchFn = useCallback(
    (page: number) =>
      fetchMoviesByPlatform({
        providerId: selectedPlatform.providerId,
        platformName: selectedPlatform.shortName,
        page,
        mediaType: mediaFilter,
        sortBy,
        apiKey: key,
        language: t.tmdbLang
      }).then(res => ({
        results: res.movies,
        total_pages: res.totalPages
      })),
    [selectedPlatform.id, selectedPlatform.providerId, selectedPlatform.shortName, mediaFilter, sortBy, key, t.tmdbLang]
  );

  const { items, loading, hasMore, sentinelRef } = useInfiniteCatalog<Movie>(
    fetchFn,
    [selectedPlatform.id, selectedPlatform.providerId, mediaFilter, sortBy, key, t.tmdbLang] as const
  );

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Controls Header */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#121212] border border-white/10 space-y-6">

        <div>
          <div className="flex items-center gap-2 text-[#e50914] text-[11px] font-bold uppercase tracking-widest mb-2">
            <Tv className="w-3.5 h-3.5 text-[#e50914]" />
            <span>Catalogue par Fournisseur</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tight">
            Classement par Plateforme
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1.5">
            Explorez les sélections exclusives par service de streaming avec défilement continu.
          </p>
        </div>

        {/* Horizontal Platform Selector Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-none">
          {PLATFORMS.map(p => {
            const isSel = selectedPlatform.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlatform(p)}
                className={`flex-shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer select-none ${
                  isSel
                    ? 'bg-white border-white text-black font-extrabold shadow-md'
                    : 'bg-[#18181b] border-white/10 text-zinc-300 hover:text-white hover:border-white/20'
                }`}
                title={`Explorer le catalogue ${p.name}`}
              >
                <span className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center flex-shrink-0 ${isSel ? 'bg-black text-white' : `${p.badgeBg} ${p.badgeText}`}`}>
                  {p.symbol}
                </span>
                <span className="whitespace-nowrap">{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Filter & Sort Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-white/10">

          {/* Media type filter pills */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-black/60 border border-white/10 text-xs font-semibold self-start">
            {([
              { id: 'all',   label: 'Tous',    icon: Clapperboard },
              { id: 'movie', label: 'Films',   icon: Film         },
              { id: 'tv',    label: 'Séries',  icon: Tv           }
            ] as { id: MediaFilter; label: string; icon: any }[]).map(tab => {
              const Icon = tab.icon;
              const isSel = mediaFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setMediaFilter(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer select-none ${
                    isSel ? 'bg-white text-black font-extrabold shadow-sm' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sort dropdown */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs text-zinc-400 flex items-center gap-1 font-medium whitespace-nowrap">
              <ArrowUpDown className="w-3.5 h-3.5 text-zinc-400" />
              Trier par :
            </span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="bg-[#18181b] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white font-semibold outline-none focus:border-white cursor-pointer"
            >
              <option value="popularity.desc">🔥 Populaires</option>
              <option value="vote_average.desc">⭐ Mieux notés</option>
              <option value="primary_release_date.desc">✨ Nouveautés</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid with sentinel inside MovieGrid */}
      <MovieGrid
        title={`${selectedPlatform.name} — ${mediaFilter === 'all' ? 'Films & Séries' : mediaFilter === 'movie' ? 'Films' : 'Séries'}`}
        subtitle={`${items.length} titres chargés${hasMore ? ' — défilez vers le bas pour charger la suite' : ' — fin du catalogue'}`}
        movies={items}
        showAiMatch={false}
        sentinelRef={sentinelRef}
        isLoadingMore={loading}
        hasMore={hasMore}
      />

    </div>
  );
};
