import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Movie, StreamingProvider } from '../../types';
import { getPlatformDirectUrl, getDirectStreamingUrl, isIntermediaryWatchLink } from '../../services/deepLinkHelper';
import { detectProviderKey } from '../../services/tmdb';

export interface StreamingLinksProps {
  movie: Movie;
  providers?: StreamingProvider[];
  variant?: 'compact' | 'expanded' | 'pills';
  className?: string;
  showTitle?: boolean;
}

export const StreamingLinks: React.FC<StreamingLinksProps> = ({
  movie,
  providers = movie.providers || [],
  variant = 'compact',
  className = '',
  showTitle = true
}) => {
  if (!providers || providers.length === 0) {
    return null;
  }

  return (
    <div 
      onClick={(e) => e.stopPropagation()} 
      className={`flex flex-col gap-1.5 ${className}`}
    >
      {showTitle && (
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-400">
          Disponible sur ({providers.length}) :
        </span>
      )}

      <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto pr-1">
        {providers.map((p, idx) => {
          const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : '';
          const catalogId = movie.netflix_id || movie.netflixId || p.netflixId;
          const watchLink = p.justWatchUrl || movie.watch_provider_link;
          const candidateLink = p.deepLink || p.directUrl;
          const directLink = (!candidateLink || isIntermediaryWatchLink(candidateLink))
            ? getDirectStreamingUrl(p.name, movie.title, releaseYear, catalogId, watchLink)
            : candidateLink;

          return (
            <a
              key={p.id || idx}
              href={directLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="group/badge relative flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/90 dark:bg-slate-900/90 border border-slate-700/80 dark:border-slate-800 hover:border-sky-500/70 hover:bg-slate-800 transition-all shadow-sm cursor-pointer select-none"
              title={`Regarder "${movie.title}" directement sur ${p.name}`}
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
  );
};

export default StreamingLinks;
