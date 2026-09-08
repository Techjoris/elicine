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

/** Discreet dark cinema animated skeleton card */
const MovieCardSkeleton: React.FC = () => (
  <div className="flex flex-col rounded-xl bg-[#121212] border border-white/[0.06] overflow-hidden animate-pulse">
    <div className="aspect-[2/3] w-full bg-zinc-900/60 relative">
      <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-transparent to-transparent" />
    </div>
    <div className="p-3.5 space-y-2.5">
      <div className="h-3.5 bg-zinc-800/80 rounded w-3/4" />
      <div className="flex items-center justify-between pt-1">
        <div className="h-2.5 bg-zinc-800/50 rounded w-1/3" />
        <div className="h-2.5 bg-zinc-800/50 rounded w-1/4" />
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
    <section id="results-section" className="w-full space-y-6">

      {/* AI Thought Banner Épuré */}
      {aiThought && (
        <div className="p-4 sm:p-6 rounded-2xl bg-[#121212] border border-white/10 space-y-2.5 shadow-xl">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#e50914]" />
              Vision &amp; Recommandation Cinéphile IA
            </span>
            {aiMood && (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/[0.06] text-zinc-300 border border-white/10 font-medium">
                Atmosphère : {aiMood}
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed italic">
            "{aiThought}"
          </p>
        </div>
      )}

      {/* Section Header - Typographie asymétrique imposante */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pt-2 border-b border-white/[0.06] pb-3">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight uppercase">
            {title}
          </h2>
          {subtitle && <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10 text-zinc-400 font-medium self-start sm:self-auto">
          {movies.length} titre{movies.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid — posters immersifs */}
      {movies.length === 0 && !isLoadingMore && !hasMore ? (
        <div className="text-center py-16 px-4 rounded-2xl bg-[#121212] border border-white/[0.08]">
          <p className="text-zinc-400 font-medium text-sm">Aucun résultat trouvé pour cette sélection.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 sm:gap-6">
          {movies.map((movie) => (
            <MovieCard key={`${movie.media_type || 'item'}-${movie.id}`} movie={movie} showAiMatch={showAiMatch} />
          ))}

          {/* Seamless skeleton placeholders during background fetch */}
          {isLoadingMore && (
            <>
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              {movies.length === 0 && (
                <>
                  <MovieCardSkeleton />
                  <MovieCardSkeleton />
                  <MovieCardSkeleton />
                  <MovieCardSkeleton />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Invisible sentinel for aggressive prefetch */}
      {sentinelRef && (
        <div ref={sentinelRef} className="h-6 w-full -mt-2">
          {!hasMore && movies.length > 0 && !isLoadingMore && (
            <p className="text-xs text-zinc-600 font-medium text-center py-6">
              — Fin du catalogue —
            </p>
          )}
        </div>
      )}

    </section>
  );
};
