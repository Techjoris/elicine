import React, { useState, useEffect } from 'react';
import { 
  Star, 
  Play, 
  Heart, 
  Check, 
  Bell, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { Movie } from '../../types';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';
import { 
  resolveStreamingAction, 
  StreamingActionResult,
  buildStreamingUrl,
  getDirectStreamingUrl,
  isIntermediaryWatchLink 
} from '../../services/streamingResolver';
import { redirectToStreamingProvider } from '../../services/deepLinkHelper';
import { getCachedCountryCode } from '../../services/geoService';
import { getVpnAffiliateUrl } from '../../config/affiliates';

interface MovieCardProps {
  movie: Movie;
  showAiMatch?: boolean;
}

const getPlatformBadgeStyle = (name?: string): string => {
  if (!name) return 'bg-sky-600/90 border-sky-400/30 text-white';
  const n = name.toLowerCase();
  if (n.includes('netflix')) return 'bg-red-600/90 border-red-400/40 text-white';
  if (n.includes('prime')) return 'bg-sky-600/90 border-sky-400/40 text-white';
  if (n.includes('disney')) return 'bg-blue-800/90 border-blue-400/40 text-white';
  if (n.includes('apple')) return 'bg-zinc-800/90 border-zinc-500/40 text-white';
  if (n.includes('max') || n.includes('hbo')) return 'bg-purple-700/90 border-purple-400/40 text-white';
  if (n.includes('canal')) return 'bg-slate-900/90 border-slate-600/40 text-white';
  if (n.includes('paramount')) return 'bg-blue-600/90 border-blue-400/40 text-white';
  return 'bg-sky-600/90 border-sky-400/30 text-white';
};

export const MovieCard: React.FC<MovieCardProps> = ({ movie, showAiMatch = true }) => {
  const { 
    setSelectedMovie, 
    toggleWatchlist, 
    isInWatchlist, 
    addAlert, 
    isMovieAlertActive,
    apiSettings,
    showToast
  } = useApp();

  const { t } = useTranslation();

  const [streamingAction, setStreamingAction] = useState<StreamingActionResult | null>(null);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);

  const inWatchlist = isInWatchlist(movie.id);
  const alertActive = isMovieAlertActive(movie.id);

  const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : '2026';
  const mediaType = movie.media_type || (movie.title.toLowerCase().includes('série') ? 'SÉRIE' : 'FILM');
  const typeEndpoint = mediaType === 'SÉRIE' ? 'tv' : 'movie';

  useEffect(() => {
    let isMounted = true;
    const userCountry = getCachedCountryCode();

    resolveStreamingAction(movie.id, typeEndpoint, userCountry, movie.title, apiSettings?.tmdbApiKey, movie)
      .then((action) => {
        if (isMounted) {
          setStreamingAction(action);
          setIsLoadingProviders(false);
        }
      })
      .catch((err) => {
        console.warn('[Éliciné] resolveStreamingAction error:', err);
        if (isMounted) {
          setIsLoadingProviders(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [movie.id, typeEndpoint, movie.title, apiSettings?.tmdbApiKey, movie]);

  return (
    <div 
      onClick={() => setSelectedMovie(movie)}
      className="group relative flex flex-col rounded-xl bg-white dark:bg-[#121212] border border-slate-200/80 dark:border-white/[0.07] hover:border-slate-300 dark:hover:border-white/30 transition-all duration-500 overflow-hidden cursor-pointer select-none shadow-sm hover:shadow-md dark:hover:shadow-2xl"
    >
      
      {/* Poster Image Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-100 dark:bg-[#0a0a0a]">
        <img
          src={movie.poster_path || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80'}
          alt={movie.title}
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700 ease-out"
          loading="lazy"
        />

        {/* Gradient Overlay Cinématographique */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent dark:from-[#121212] dark:via-[#121212]/20 dark:to-black/40 opacity-75 group-hover:opacity-40 transition-opacity duration-500" />
        
        {/* Top-Left: Type & Match Rate */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 items-start">
          <div className="flex items-center gap-1">
            <span className="px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-zinc-300 text-[9px] font-bold tracking-widest uppercase">
              {mediaType === 'SÉRIE' ? t.badgeSerie : t.badgeFilm}
            </span>
            {movie.match_rate !== undefined && movie.match_rate > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md border border-white/10 text-zinc-300 text-[9px] font-medium tracking-wide">
                {movie.match_rate}%
              </span>
            )}
          </div>
        </div>

        {/* Top-Right: Quick Actions */}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 sm:opacity-80 sm:group-hover:opacity-100 transition-opacity">
          
          {/* Watchlist Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleWatchlist(movie);
            }}
            className={`p-1.5 rounded-full backdrop-blur-md border transition-all active:scale-90 cursor-pointer ${
              inWatchlist 
                ? 'bg-white text-black border-white' 
                : 'bg-black/60 text-white border-white/20 hover:bg-black hover:border-white/50'
            }`}
            title={inWatchlist ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
          >
            {inWatchlist ? <Check className="w-3 h-3 stroke-[3]" /> : <Heart className="w-3 h-3" />}
          </button>

          {/* Alert Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              addAlert(movie);
            }}
            className={`p-1.5 rounded-full backdrop-blur-md border transition-all active:scale-90 cursor-pointer ${
              alertActive 
                ? 'bg-[#e50914] text-white border-[#e50914]' 
                : 'bg-black/60 text-white border-white/20 hover:bg-black hover:border-white/50'
            }`}
            title="Activer une alerte"
          >
            <Bell className="w-3 h-3" />
          </button>
        </div>

        {/* Center Hover Play Icon */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-10 h-10 rounded-full bg-white/95 text-black flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-300">
            <Play className="w-4 h-4 fill-black ml-0.5" />
          </div>
        </div>

      </div>

      {/* Info Under Poster */}
      <div className="p-3 flex-1 flex flex-col justify-between space-y-1.5">
        <div>
          {/* Title */}
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white tracking-tight line-clamp-1 group-hover:text-[#e50914] dark:group-hover:text-zinc-200 transition-colors">
            {movie.title}
          </h3>

          {/* Year and Rating */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 font-medium pt-0.5">
            <span>{releaseYear}</span>
            <div className="flex items-center gap-1 text-slate-700 dark:text-zinc-300">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-slate-900 dark:text-white">{movie.vote_average ? movie.vote_average.toFixed(1) : '7.5'}</span>
            </div>
          </div>
        </div>

        {/* Section Streaming Épurée (Indicateur discret en 1 ligne) */}
        {streamingAction?.type === 'DIRECT' && streamingAction.providers.length > 0 ? (
          <div className="pt-1.5 border-t border-slate-200/80 dark:border-white/[0.06] flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e50914] flex-shrink-0" />
            <span className="truncate">Sur {streamingAction.providers[0].name}{streamingAction.providers.length > 1 ? ` +${streamingAction.providers.length - 1}` : ''}</span>
          </div>
        ) : streamingAction?.type === 'VPN_REQUIRED' ? (
          <div className="pt-1.5 border-t border-slate-200/80 dark:border-white/[0.06] flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-zinc-500">
            <span>{streamingAction.marketFlag || '🇺🇸'}</span>
            <span className="truncate">Stream {streamingAction.marketLabel || 'US'}</span>
          </div>
        ) : null}

        {/* AI Match Reason Pill if active */}
        {showAiMatch && movie.ai_match_reason && (
          <p className="mt-1 text-[10px] text-slate-600 dark:text-zinc-400 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-md p-1.5 leading-tight line-clamp-2">
            <span className="text-[#e50914] mr-1">●</span>{movie.ai_match_reason}
          </p>
        )}

      </div>

    </div>
  );
};
