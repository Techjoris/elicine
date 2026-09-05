import React, { useState, useEffect } from 'react';
import { Tv } from 'lucide-react';
import { Movie, StreamingProvider } from '../../types';
import { getWatchProviders, getDirectStreamingUrl, isIntermediaryWatchLink } from '../../services/tmdb';
import { isNetflixProvider, handleStreamingClick } from '../../services/deepLinkHelper';
import { buildStreamingUrl } from '../../services/streamingResolver';
import { useApp } from '../../context/AppContext';

interface PlatformBadgesProps {
  movie: Movie;
}

export const PlatformBadges: React.FC<PlatformBadgesProps> = ({ movie }) => {
  const { showToast } = useApp();
  const [providers, setProviders] = useState<StreamingProvider[]>(() => {
    if (Array.isArray(movie.providers) && movie.providers.length > 0) {
      return movie.providers;
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState(!providers.length);

  useEffect(() => {
    if (Array.isArray(movie.providers) && movie.providers.length > 0) {
      setProviders(movie.providers);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const mediaType = movie.media_type === 'SÉRIE' ? 'tv' : 'movie';
    getWatchProviders(movie.id, mediaType, undefined, undefined, movie.title, movie)
      .then((data) => {
        if (isMounted) {
          setProviders(data || []);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [movie.id, movie.media_type, movie.providers, movie.title]);

  return (
    <div 
      onClick={(e) => e.stopPropagation()} 
      className="flex flex-col gap-1.5 my-1.5"
    >
      {isLoading ? (
        <div className="h-6 w-24 rounded-lg bg-slate-800/60 animate-pulse" />
      ) : providers.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
            Disponible sur ({providers.length}) :
          </span>
          <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto pr-1">
            {providers.map((p) => {
              const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : '';
              const catalogId = movie.netflix_id || movie.netflixId || p.netflixId;
              const watchLink = p.justWatchUrl || movie.watch_provider_link;
              const candidateUrl = p.deepLink || p.directUrl;
              const directHref = (!candidateUrl || isIntermediaryWatchLink(candidateUrl))
                ? getDirectStreamingUrl(p.name, movie.title, releaseYear, catalogId, watchLink)
                : candidateUrl;

              const isNetflix = isNetflixProvider(p.name);
              const hasDirectId = catalogId != null && String(catalogId).trim().length > 0;
              const badgeLabel = isNetflix ? 'Ouvrir sur Netflix' : p.name;
              const actionLabel = isNetflix && !hasDirectId ? '🔍' : '↗';

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStreamingClick(directHref, p.name, movie.title, catalogId, showToast);
                  }}
                  className="group/badge relative flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-sky-500/70 hover:bg-slate-800 transition-all shadow-sm cursor-pointer select-none"
                  title={`Regarder "${movie.title}" sur ${p.name}`}
                >
                {p.logo ? (
                  <img
                    src={p.logo}
                    alt={p.name}
                    className="w-4 h-4 rounded object-cover flex-shrink-0"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <span className="w-4 h-4 rounded bg-sky-950 text-sky-400 text-[9px] font-bold flex items-center justify-center">
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="text-[11px] font-medium text-slate-300 group-hover/badge:text-sky-300 transition-colors truncate max-w-[110px]">
                  {badgeLabel}
                </span>
                <span className="text-[8px] text-slate-500 group-hover/badge:text-sky-400">{actionLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-slate-500 italic flex items-center gap-1">
          <span>ℹ️</span> Disponible en VOD / Achat numérique
        </div>
      )}
    </div>
  );
};

export const StreamingBadges = PlatformBadges;
export default PlatformBadges;
