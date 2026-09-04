import React, { useCallback } from 'react';
import { MovieGrid } from '../movies/MovieGrid';
import { useApp } from '../../context/AppContext';
import { fetchTrendingPage } from '../../services/tmdb';
import { useInfiniteCatalog } from '../../hooks/useInfiniteCatalog';
import { Movie } from '../../types';
import { Flame } from 'lucide-react';

export const TrendingView: React.FC = () => {
  const { apiSettings } = useApp();
  const key = apiSettings.tmdbApiKey;

  const fetchFn = useCallback(
    (page: number) => fetchTrendingPage(page, key),
    [key]
  );

  const { items, loading, hasMore, sentinelRef } = useInfiniteCatalog<Movie>(
    fetchFn,
    [key] as const
  );

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="p-6 rounded-3xl bg-[#0f141f] border border-[#1e293b] shadow-lg">
        <div className="flex items-center gap-2.5 text-red-400 text-xs font-black uppercase tracking-wider mb-2">
          <Flame className="w-4 h-4 text-red-500 fill-red-500 animate-pulse" />
          <span>Cinéma &amp; Streaming en Direct</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white">Films Tendances du Moment</h1>
        <p className="text-xs sm:text-sm text-slate-300 max-w-xl mt-1">
          Défilement infini automatique — synchronisé chaque semaine avec le catalogue mondial TMDB.
        </p>
      </div>

      <MovieGrid
        title={`Top Tendances Mondiales (${items.length})`}
        movies={items}
        showAiMatch={false}
        sentinelRef={sentinelRef}
        isLoadingMore={loading}
        hasMore={hasMore}
      />

    </div>
  );
};
