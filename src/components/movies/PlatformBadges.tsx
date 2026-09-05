import React, { useState, useEffect } from 'react';
import { Tv, ExternalLink } from 'lucide-react';
import { Movie, StreamingProvider } from '../../types';
import { getWatchProviders, getDirectStreamingUrl, isIntermediaryWatchLink } from '../../services/tmdb';
import { buildStreamingUrl } from '../../services/streamingResolver';

interface PlatformBadgesProps {
  movie: Movie;
}

export const PlatformBadges: React.FC<PlatformBadgesProps> = ({ movie }) => {
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
              const candidateUrl = p.deepLink || p.directUrl;
              const directHref = (!candidateUrl || isIntermediaryWatchLink(candidateUrl))
                ? getDirectStreamingUrl(p.name, movie.title, releaseYear)
                : candidateUrl;

              return (
                <a
                  key={p.id}
                  href={directHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="group/badge relative flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-sky-500/70 hover:bg-slate-800 transition-all shadow-sm"
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
                <span className="text-[11px] font-medium text-slate-300 group-hover/badge:text-sky-300 transition-colors truncate max-w-[90px]">
                  {p.name}
                </span>
                <span className="text-[8px] text-slate-500 group-hover/badge:text-sky-400">↗</span>
                </a>
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
