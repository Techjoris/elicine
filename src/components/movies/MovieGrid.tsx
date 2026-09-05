import React from 'react';
import { MovieCard } from './MovieCard';
import { Movie } from '../../types';
import { Sparkles } from 'lucide-react';

interface MovieGridProps {
  title?: string;
  subtitle?: string;
  movies: Movie[];
  aiThought?: string;
  aiMood?: string;
  showAiMatch?: boolean;
  /** Optional sentinel ref for infinite scroll (pass from useInfiniteCatalog) */
  sentinelRef?: React.RefCallback<HTMLDivElement>;
  isLoadingMore?: boolean;
  hasMore?: boolean;
}

/** Discreet dark blue/slate animated skeleton card */
const MovieCardSkeleton: React.FC = () => (
  <div className="flex flex-col rounded-2xl bg-[#0f141f]/70 border border-[#1e293b]/60 overflow-hidden animate-pulse shadow-md">
    <div className="aspect-[2/3] w-full bg-slate-800/40 relative">
      <div className="absolute inset-0 bg-gradient-to-t from-[#0f141f] via-slate-800/10 to-transparent" />
    </div>
    <div className="p-3.5 space-y-2.5">
      <div className="h-3.5 bg-slate-800/80 rounded-md w-3/4" />
      <div className="flex items-center justify-between pt-1">
        <div className="h-2.5 bg-slate-800/50 rounded-md w-1/3" />
        <div className="h-2.5 bg-slate-800/50 rounded-md w-1/4" />
      </div>
    </div>
  </div>
);

export const MovieGrid: React.FC<MovieGridProps> = ({
  title = '🔥 Tendances populaires',
  subtitle,
  movies,
  aiThought,
  aiMood,
  showAiMatch = false,
  sentinelRef,
  isLoadingMore = false,
  hasMore = false
}) => {
  return (
    <section id="results-section" className="w-full space-y-5">

      {/* AI Thought Banner */}
      {aiThought && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white/90 dark:bg-gradient-to-r dark:from-blue-950/60 dark:via-[#0f141f] dark:to-slate-900 border border-slate-200 dark:border-[#1e293b] shadow-sm dark:shadow-neon-blue space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-500 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              Vision &amp; Recommandation Cinéphile IA
            </span>
            {aiMood && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30 font-semibold">
                Atmosphère : {aiMood}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed italic">
            "{aiThought}"
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-[#1e293b] text-slate-600 dark:text-slate-400 font-semibold self-start sm:self-auto">
          {movies.length} titre{movies.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid — seamlessly renders movies + skeletons when loading more */}
      {movies.length === 0 && !isLoadingMore ? (
        <div className="text-center py-16 px-4 rounded-2xl bg-white dark:bg-[#0f141f] border border-slate-200 dark:border-[#1e293b] shadow-sm">
          <p className="text-slate-700 dark:text-slate-300 font-semibold text-sm">Aucun résultat trouvé pour cette recherche.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 sm:gap-5">
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} showAiMatch={showAiMatch} />
          ))}

          {/* Seamless skeleton placeholders during background fetch */}
          {isLoadingMore && (
            <>
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              <MovieCardSkeleton />
            </>
          )}
        </div>
      )}

      {/* Invisible sentinel for aggressive prefetch */}
      {sentinelRef && (
        <div ref={sentinelRef} className="h-6 w-full -mt-2">
          {!hasMore && movies.length > 0 && !isLoadingMore && (
            <p className="text-xs text-slate-600 font-medium text-center py-6">
              — Fin du catalogue —
            </p>
          )}
        </div>
      )}

    </section>
  );
};
