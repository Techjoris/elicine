import React, { useState, useCallback } from 'react';
import { MovieGrid } from '../movies/MovieGrid';
import { fetchMoviesByPlatform, PLATFORM_PROVIDER_IDS } from '../../services/tmdb';
import { useInfiniteCatalog } from '../../hooks/useInfiniteCatalog';
import { useApp } from '../../context/AppContext';
import { Movie } from '../../types';
import { Tv, Film, Clapperboard, ArrowUpDown } from 'lucide-react';

interface PlatformItem {
  id: string;
  name: string;
  providerId: number;
  color: string;
}

const PLATFORMS: PlatformItem[] = [
  { id: 'netflix', name: 'Netflix',     providerId: PLATFORM_PROVIDER_IDS.NETFLIX, color: 'from-red-600 to-red-800'      },
  { id: 'prime',   name: 'Prime Video', providerId: PLATFORM_PROVIDER_IDS.PRIME,   color: 'from-sky-500 to-blue-700'     },
  { id: 'disney',  name: 'Disney+',     providerId: PLATFORM_PROVIDER_IDS.DISNEY,  color: 'from-blue-700 to-indigo-900'  },
  { id: 'canal',   name: 'Canal+',      providerId: PLATFORM_PROVIDER_IDS.CANAL,   color: 'from-slate-700 to-slate-900'  }
];

type MediaFilter = 'all' | 'movie' | 'tv';
type SortOption  = 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc';

export const PlatformsView: React.FC = () => {
  const { apiSettings } = useApp();
  const key = apiSettings.tmdbApiKey;

  const [selectedPlatform, setSelectedPlatform] = useState<PlatformItem>(PLATFORMS[0]);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('popularity.desc');

  // ─── Wrapped in useCallback so useInfiniteCatalog gets a stable reference ─
  const fetchFn = useCallback(
    (page: number) =>
      fetchMoviesByPlatform({
        providerId: selectedPlatform.providerId,
        page,
        mediaType: mediaFilter,
        sortBy,
        apiKey: key
      }).then(res => ({
        results: res.movies,
        total_pages: res.totalPages
      })),
    [selectedPlatform.id, mediaFilter, sortBy, key]
  );

  const { items, loading, hasMore, sentinelRef } = useInfiniteCatalog<Movie>(
    fetchFn,
    [selectedPlatform.id, mediaFilter, sortBy, key] as const
  );

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Controls Header */}
      <div className="p-6 rounded-3xl bg-[#0f141f] border border-[#1e293b] shadow-2xl space-y-6">

        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
            <Tv className="w-7 h-7 text-sky-400" />
            <span>Catalogues Streaming</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Défilement infini automatique — synchronisé en temps réel avec TMDB.
          </p>
        </div>

        {/* Platform Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PLATFORMS.map(p => {
            const isSel = selectedPlatform.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlatform(p)}
                className={`p-3.5 sm:p-4 rounded-2xl border text-center font-bold text-xs sm:text-sm transition-all duration-300 ${
                  isSel
                    ? `bg-gradient-to-br ${p.color} border-white/40 text-white shadow-neon-blue scale-[1.02]`
                    : 'bg-[#07090e] border-[#1e293b] text-slate-300 hover:bg-slate-800'
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>

        {/* Filter & Sort Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-[#1e293b]/70">

          {/* Media type filter pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#07090e] border border-[#1e293b] text-xs font-semibold">
            {([
              { id: 'all',   label: 'Tout voir', icon: Clapperboard },
              { id: 'movie', label: 'Films',      icon: Film         },
              { id: 'tv',    label: 'Séries',     icon: Tv           }
            ] as { id: MediaFilter; label: string; icon: any }[]).map(tab => {
              const Icon = tab.icon;
              const isSel = mediaFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setMediaFilter(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                    isSel ? 'bg-blue-600 text-white shadow-neon-blue font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Sort dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1 font-medium">
              <ArrowUpDown className="w-3.5 h-3.5 text-sky-400" />
              Trier par :
            </span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="bg-[#07090e] border border-[#1e293b] rounded-xl px-3 py-1.5 text-xs text-white font-semibold outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="popularity.desc">🔥 Les plus populaires</option>
              <option value="vote_average.desc">⭐ Les mieux notés</option>
              <option value="primary_release_date.desc">✨ Nouveautés</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid with sentinel inside MovieGrid */}
      <MovieGrid
        title={`${selectedPlatform.name} — ${mediaFilter === 'all' ? 'Films & Séries' : mediaFilter === 'movie' ? 'Films' : 'Séries'}`}
        subtitle={`${items.length} titres chargés${hasMore ? ' — défilez pour charger la suite' : ' — fin du catalogue'}`}
        movies={items}
        showAiMatch={false}
        sentinelRef={sentinelRef}
        isLoadingMore={loading}
        hasMore={hasMore}
      />

    </div>
  );
};
