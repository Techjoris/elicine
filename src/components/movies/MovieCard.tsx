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
  buildStreamingUrl 
} from '../../services/streamingResolver';
import { getCachedCountryCode } from '../../services/geoService';
import { getVpnAffiliateUrl } from '../../config/affiliates';

interface MovieCardProps {
  movie: Movie;
  showAiMatch?: boolean;
}

export const MovieCard: React.FC<MovieCardProps> = ({ movie, showAiMatch = true }) => {
  const { 
    setSelectedMovie, 
    toggleWatchlist, 
    isInWatchlist, 
    addAlert, 
    isMovieAlertActive,
    apiSettings
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
    <div className="group relative flex flex-col rounded-2xl bg-white dark:bg-[#0f141f] border border-slate-200/80 dark:border-[#1e293b] hover:border-blue-500/60 dark:hover:border-[#0ea5e9]/60 transition-all duration-300 overflow-hidden shadow-sm dark:shadow-lg hover:shadow-md dark:hover:shadow-neon-cyan hover:-translate-y-1">
      
      {/* Poster Image Container */}
      <div 
        onClick={() => setSelectedMovie(movie)}
        className="relative aspect-[2/3] w-full overflow-hidden cursor-pointer bg-slate-100 dark:bg-[#07090e]"
      >
        <img
          src={movie.poster_path || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&q=80'}
          alt={movie.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 dark:from-[#0f141f] via-transparent to-black/50 opacity-85 group-hover:opacity-60 transition-opacity" />

        {/* Top-Left: Type Badge + Match Rate Badge */}
        <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1.5 items-start">
          <span className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-white text-[10px] font-black tracking-wider uppercase">
            {mediaType === 'SÉRIE' ? t.badgeSerie : t.badgeFilm}
          </span>
          {movie.match_rate !== undefined && movie.match_rate > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 backdrop-blur-md shadow-sm">
              🎯 {movie.match_rate}% match
            </span>
          )}
        </div>

        {/* Top-Right: Quick Actions */}
        <div className="absolute top-2.5 right-2.5 z-10 flex flex-col gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
          
          {/* Watchlist Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleWatchlist(movie);
            }}
            className={`p-1.5 rounded-lg backdrop-blur-md border transition-all ${
              inWatchlist 
                ? 'bg-emerald-500 text-slate-950 border-emerald-400' 
                : 'bg-black/60 text-white border-white/20 hover:bg-blue-600'
            }`}
            title={inWatchlist ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
          >
            {inWatchlist ? <Check className="w-3 h-3 stroke-[3]" /> : <Heart className="w-3 h-3" />}
          </button>

          {/* Alert Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              addAlert(movie);
            }}
            className={`p-1.5 rounded-lg backdrop-blur-md border transition-all ${
              alertActive 
                ? 'bg-amber-500 text-slate-950 border-amber-400' 
                : 'bg-black/60 text-white border-white/20 hover:bg-amber-500 hover:text-slate-950'
            }`}
            title="Activer une alerte"
          >
            <Bell className="w-3 h-3" />
          </button>
        </div>

        {/* Center Hover Play Icon */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md dark:shadow-neon-blue scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-4 h-4 fill-white ml-0.5" />
          </div>
        </div>

      </div>

      {/* Info Under Poster */}
      <div 
        onClick={() => setSelectedMovie(movie)}
        className="p-3 flex-1 flex flex-col justify-between cursor-pointer space-y-1.5"
      >
        <div>
          {/* Title */}
          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-[#0ea5e9] transition-colors line-clamp-1">
            {movie.title}
          </h3>

          {/* Year and Rating with Golden Star */}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
            <span>{releaseYear}</span>
            <div className="flex items-center gap-1 text-amber-500 dark:text-amber-400 font-bold">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{movie.vote_average ? movie.vote_average.toFixed(1) : '7.5'}</span>
            </div>
          </div>
        </div>

        {/* Section Streaming Découplée (Catalogue 100% universel, action contextualisée) */}
        {isLoadingProviders ? (
          <div className="h-7 w-24 rounded-lg bg-slate-200 dark:bg-slate-800/60 animate-pulse mt-2" />
        ) : streamingAction?.type === 'DIRECT' ? (
          <div className="flex flex-col gap-1.5 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Disponible chez vous ({streamingAction.providers.length}) :
              </span>
            </div>
            
            {/* Grille fluide de badges plateformes locales */}
            <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto pr-1">
              {streamingAction.providers.map((p) => (
                <a
                  key={p.id}
                  href={p.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="group/badge relative flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-500/30 hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all shadow-sm"
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
                    <span className="w-4 h-4 rounded bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300 text-[9px] font-bold flex items-center justify-center">
                      {p.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-200 group-hover/badge:text-emerald-950 dark:group-hover/badge:text-white transition-colors truncate max-w-[90px]">
                    {p.name}
                  </span>
                  <span className="text-[8px] text-emerald-600 dark:text-emerald-400">↗</span>
                </a>
              ))}
            </div>
          </div>
        ) : streamingAction?.type === 'VPN_REQUIRED' ? (
          <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex flex-col gap-2 transition-colors hover:border-slate-300 dark:hover:border-slate-700">
            
            {/* En-tête discret */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="text-xs">{streamingAction.marketFlag || '🇺🇸'}</span> {t.vpnNeededTitle} ({streamingAction.marketLabel || 'USA'})
              </span>
              <a
                href={streamingAction.vpnUrl || getVpnAffiliateUrl('nordvpn')}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="group/vpn flex items-center gap-1 text-[10px] text-blue-600 dark:text-sky-400 hover:text-blue-700 dark:hover:text-sky-300 font-medium transition-colors"
              >
                <span>{t.vpnButton}</span>
                <span className="group-hover/vpn:translate-x-0.5 transition-transform">↗</span>
              </a>
            </div>

            {/* Liste horizontale compacte des plateformes disponibles */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
              {streamingAction.providers.map((p, idx) => {
                const cleanName = p.name.replace(/\s*\([^)]*\)/, '') || p.name;
                return (
                  <a
                    key={p.id || idx}
                    href={p.vpnUrl || streamingAction.vpnUrl || getVpnAffiliateUrl('nordvpn')}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-blue-500/40 transition-all flex-shrink-0 shadow-sm"
                    title={`${t.availableOn} ${cleanName} (${streamingAction.marketLabel})`}
                  >
                    {p.logo && (
                      <img src={p.logo} alt={cleanName} className="w-3.5 h-3.5 rounded object-cover" />
                    )}
                    <span className="text-[10px] text-slate-700 dark:text-slate-300 font-normal">
                      {cleanName}
                    </span>
                  </a>
                );
              })}
            </div>

          </div>
        ) : (
          <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 italic flex items-center gap-1">
            <span>ℹ️</span> {t.vodSection}
          </div>
        )}

        {/* AI Match Reason Pill if active */}
        {showAiMatch && movie.ai_match_reason && (
          <p className="mt-1 text-[11px] text-blue-800 dark:text-cyan-300/80 bg-blue-50/80 dark:bg-[#07090e] border border-blue-200 dark:border-[#1e293b] rounded-lg p-1.5 leading-tight flex items-start gap-1 line-clamp-2">
            <Sparkles className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <span>{movie.ai_match_reason}</span>
          </p>
        )}

      </div>

    </div>
  );
};
