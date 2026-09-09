import React, { useCallback } from 'react';
import { MovieGrid } from '../movies/MovieGrid';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';
import { fetchTrendingPage } from '../../services/tmdb';
import { useInfiniteCatalog } from '../../hooks/useInfiniteCatalog';
import { Movie } from '../../types';
import { Flame } from 'lucide-react';

export const TrendingView: React.FC = () => {
  const { apiSettings } = useApp();
  const { t } = useTranslation();
  const key = apiSettings.tmdbApiKey;

  const fetchFn = useCallback(
    (page: number) => fetchTrendingPage(page, key, t.tmdbLang),
    [key, t.tmdbLang]
  );

  const { items, loading, hasMore, sentinelRef } = useInfiniteCatalog<Movie>(
    fetchFn,
    [key, t.tmdbLang] as const
  );

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 shadow-sm transition-colors">
        <div className="flex items-center gap-2 text-[#e50914] text-[11px] font-bold uppercase tracking-widest mb-2">
          <Flame className="w-3.5 h-3.5 text-[#e50914] fill-[#e50914]" />
          <span>Cinéma &amp; Streaming en Direct</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Films Tendances du Moment</h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 max-w-xl mt-1.5">
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
