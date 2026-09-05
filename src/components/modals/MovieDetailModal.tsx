import React, { useState, useEffect } from 'react';
import { 
  X, 
  Star, 
  Play, 
  Bookmark, 
  Check, 
  Bell, 
  Share2, 
  ExternalLink, 
  Tv, 
  Users, 
  Clock, 
  Calendar,
  Sparkles,
  Youtube,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';
import { Movie } from '../../types';
import { getMovieTrailer } from '../../services/tmdb';
import { getVpnAffiliateUrl } from '../../config/affiliates';
import { 
  getMediaProviders, 
  MediaProvidersResult,
  getDirectStreamingUrl,
  isIntermediaryWatchLink
} from '../../services/streamingResolver';
import { isNetflixProvider, handleStreamingClick } from '../../services/deepLinkHelper';
import { getCachedCountryCode } from '../../services/geoService';

export const MovieDetailModal: React.FC = () => {
  const { 
    selectedMovie, 
    setSelectedMovie, 
    toggleWatchlist, 
    isInWatchlist, 
    addAlert, 
    isMovieAlertActive,
    apiSettings,
    showToast 
  } = useApp();

  const { lang, t } = useTranslation();

  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [isLoadingTrailer, setIsLoadingTrailer] = useState(false);
  const [providerData, setProviderData] = useState<MediaProvidersResult>({
    svod: { status: 'none', providers: [] },
    vod: []
  });
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);

  // Fetch dynamic trailer and watch providers whenever selectedMovie or language changes
  useEffect(() => {
    if (!selectedMovie) {
      setTrailerKey(null);
      setProviderData({ svod: { status: 'none', providers: [] }, vod: [] });
      setIsPlayingTrailer(false);
      return;
    }

    let isMounted = true;
    setIsLoadingTrailer(true);
    setIsLoadingProviders(true);
    setTrailerKey(selectedMovie.trailer_key || null);

    const isTv = (
      selectedMovie.media_type === 'SÉRIE' || 
      selectedMovie.media_type === 'tv' ||
      selectedMovie.title.toLowerCase().includes('série')
    );
    const mediaTypeEndpoint = isTv ? 'tv' : 'movie';

    getMovieTrailer(selectedMovie.id, apiSettings.tmdbApiKey, selectedMovie.media_type, lang)
      .then((key) => {
        if (isMounted) {
          setTrailerKey(key);
          setIsLoadingTrailer(false);
        }
      })
      .catch((err) => {
        console.warn('Trailer load error:', err);
        if (isMounted) {
          setIsLoadingTrailer(false);
        }
      });

    const userCountry = getCachedCountryCode();
    getMediaProviders(
      selectedMovie.id, 
      mediaTypeEndpoint, 
      userCountry, 
      selectedMovie.title, 
      apiSettings.tmdbApiKey,
      selectedMovie
    )
      .then((res) => {
        if (isMounted) {
          setProviderData(res);
          setIsLoadingProviders(false);
        }
      })
      .catch((err) => {
        console.warn('[Éliciné] Watch providers load error:', err);
        if (isMounted) {
          setIsLoadingProviders(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMovie?.id, selectedMovie?.media_type, selectedMovie?.title, apiSettings.tmdbApiKey, lang, selectedMovie]);

  if (!selectedMovie) return null;

  const inWatchlist = isInWatchlist(selectedMovie.id);
  const alertActive = isMovieAlertActive(selectedMovie.id);

  const isTv = (
    selectedMovie.media_type === 'SÉRIE' ||
    selectedMovie.media_type === 'tv' ||
    selectedMovie.title.toLowerCase().includes('série')
  );
  const mediaTypeBadge = isTv ? 'SÉRIE' : 'FILM';

  // 3. Correction du double badge "Série" : dédupliquer et exclure la redondance
  const uniqueGenres = Array.from(
    new Map(
      (selectedMovie.genres || [])
        .filter(g => {
          const n = g.name.toLowerCase().trim();
          return n !== 'série' && n !== 'serie' && n !== 'film';
        })
        .map(g => [g.name.toLowerCase().trim(), g])
    ).values()
  );

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: selectedMovie.title,
        text: `Découvre "${selectedMovie.title}" sur Éliciné !`,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast('🔗 Lien copié dans le presse-papier !');
    }
  };

  const openYouTubeFallback = () => {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(selectedMovie.title + ' bande annonce vf')}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-md animate-fade-in">
      
      {/* Modal Card */}
      <div className="relative w-full max-w-4xl rounded-3xl bg-[#0e1424] border border-white/15 shadow-2xl overflow-hidden text-slate-100 max-h-[92vh] flex flex-col">
        
        {/* Close Button */}
        <button
          onClick={() => setSelectedMovie(null)}
          className="absolute top-4 right-4 z-20 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/10 transition-all hover:scale-105"
          title="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Media Hero: Video Trailer or Backdrop */}
        <div className="relative w-full aspect-video max-h-[420px] bg-slate-950 flex items-center justify-center overflow-hidden flex-shrink-0">
          {isPlayingTrailer ? (
            trailerKey ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
                title={`Bande-annonce de ${selectedMovie.title}`}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-amber-400" />
                <p className="text-sm text-slate-300">
                  Aucune bande-annonce officielle intégrable disponible directement pour ce titre.
                </p>
                <button
                  onClick={openYouTubeFallback}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all"
                >
                  <Youtube className="w-4 h-4" />
                  <span>Rechercher sur YouTube</span>
                </button>
              </div>
            )
          ) : (
            <div className="relative w-full h-full">
              <img
                src={selectedMovie.backdrop_path || selectedMovie.poster_path || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&q=80'}
                alt={selectedMovie.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e1424] via-[#0e1424]/40 to-transparent" />

              {/* Play Trailer Overlay Button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  onClick={() => setIsPlayingTrailer(true)}
                  className="group flex items-center gap-3 px-6 py-3.5 rounded-2xl bg-blue-600/90 hover:bg-blue-500 text-white font-bold shadow-neon-blue backdrop-blur-md transition-all hover:scale-105"
                >
                  <div className="w-10 h-10 rounded-full bg-white text-blue-600 flex items-center justify-center">
                    <Play className="w-5 h-5 fill-blue-600 ml-0.5" />
                  </div>
                  <span className="text-sm uppercase tracking-wider">Regarder la Bande-annonce</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto">
          
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-bold">
                  100% FICHE GRATUITE
                </span>
                <span className="text-xs text-slate-400">
                  {selectedMovie.release_date}
                </span>
                {selectedMovie.runtime && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {selectedMovie.runtime} min
                  </span>
                )}
              </div>

              <h2 className="text-2xl sm:text-4xl font-black text-white">
                {selectedMovie.title}
              </h2>
              {selectedMovie.original_title && selectedMovie.original_title !== selectedMovie.title && (
                <p className="text-xs text-slate-400 italic">
                  Titre original : {selectedMovie.original_title}
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => toggleWatchlist(selectedMovie)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all ${
                  inWatchlist
                    ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {inWatchlist ? <Check className="w-4 h-4 text-emerald-400" /> : <Bookmark className="w-4 h-4" />}
                <span>{inWatchlist ? `${t.myListBtn} ✓` : t.myListBtn}</span>
              </button>

              <button
                onClick={() => addAlert(selectedMovie)}
                className={`p-2 rounded-xl border text-xs font-semibold transition-all ${
                  alertActive
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-amber-300'
                }`}
                title={t.alertBtn}
              >
                <Bell className="w-4 h-4" />
              </button>

              <button
                onClick={handleShare}
                className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition-all"
                title="Partager"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* AI Match Insight if available */}
          {selectedMovie.ai_match_reason && (
            <div className="p-4 rounded-2xl bg-blue-950/40 border border-blue-500/30 flex items-start gap-3 text-sm text-blue-200">
              <Sparkles className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-400 text-xs uppercase tracking-wider block mb-1">
                  {t.critiqueTitle}
                </span>
                <p className="leading-relaxed text-xs sm:text-sm">
                  {selectedMovie.ai_match_reason}
                </p>
              </div>
            </div>
          )}

          {/* Genres & Rating (DÉDUPLICATION DU BADGE SÉRIE) */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-black">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span>{selectedMovie.vote_average.toFixed(1)} / 10</span>
              {selectedMovie.vote_count && (
                <span className="text-[10px] text-slate-400 font-normal">({selectedMovie.vote_count.toLocaleString()} avis)</span>
              )}
            </div>

            {/* Badge Type Unique (Film ou Série) */}
            <span className="px-3 py-1 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-bold uppercase">
              {mediaTypeBadge === 'SÉRIE' ? t.badgeSerie : t.badgeFilm}
            </span>

            {/* Genres dédupliqués (sans répéter "Série" ou "Film") */}
            {uniqueGenres.map(g => (
              <span key={g.id} className="px-3 py-1 rounded-xl bg-slate-800/80 border border-slate-700 text-xs font-semibold text-slate-300">
                {g.name}
              </span>
            ))}
          </div>

          {/* Synopsis */}
          {(() => {
            const rawOverview = (selectedMovie.overview || '').trim();
            const isOriginalShort = rawOverview.length < 40;
            const isAiEnrichedSynopsis = selectedMovie.is_ai_overview || (isOriginalShort && Boolean(selectedMovie.ai_match_reason || selectedMovie.synopsis));
            const displayOverview = (isOriginalShort && (selectedMovie.synopsis || selectedMovie.ai_match_reason))
              ? (selectedMovie.synopsis || selectedMovie.ai_match_reason)
              : (rawOverview || selectedMovie.ai_match_reason || "Synopsis complet en cours de synchronisation par Éliciné AI.");

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {t.synopsisTitle}
                  </h3>
                  {isAiEnrichedSynopsis && (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold animate-fade-in shadow-sm">
                      <Sparkles className="w-3 h-3 text-cyan-400" />
                      <span>Synopsis optimisé par Éliciné AI</span>
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-200 leading-relaxed font-normal">
                  {displayOverview}
                </p>
              </div>
            );
          })()}

          {/* 1. SECTION STREAMING ILLIMITÉ (SVOD) */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Tv className="w-4 h-4 text-cyan-400" />
                <span>📺 {t.streamingSection}</span>
              </span>
            </div>

            {isLoadingProviders ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                <span>Vérification des disponibilités en streaming...</span>
              </div>
            ) : (
              <>
                {/* Cas local : lecture directe */}
                {providerData.svod.status === 'local' && (
                  <div className="flex flex-wrap gap-2">
                    {providerData.svod.providers.map((p, i) => {
                      const releaseYear = selectedMovie.release_date ? selectedMovie.release_date.split('-')[0] : '';
                      const catalogId = selectedMovie.netflix_id || selectedMovie.netflixId || p.providerId;
                      const watchLink = providerData.svod.justWatchLink || selectedMovie.watch_provider_link;
                      const directUrl = (!p.url || isIntermediaryWatchLink(p.url))
                        ? getDirectStreamingUrl(p.name, selectedMovie.title, releaseYear, catalogId, watchLink)
                        : p.url;

                      const isNetflix = isNetflixProvider(p.name);
                      const hasDirectId = catalogId != null && String(catalogId).trim().length > 0;
                      const badgeLabel = isNetflix ? 'Ouvrir sur Netflix' : p.name;
                      const actionLabel = isNetflix && !hasDirectId ? '🔍' : 'Lancer ↗';

                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStreamingClick(directUrl, p.name, selectedMovie.title, catalogId, showToast);
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-sky-500 transition-all shadow-sm group hover:scale-105 cursor-pointer select-none"
                          title={`Regarder "${selectedMovie.title}" sur ${p.name}`}
                        >
                          {p.logo && <img src={p.logo} alt={p.name} className="w-5 h-5 rounded object-cover flex-shrink-0" />}
                          <span className="text-xs font-semibold text-white">{badgeLabel}</span>
                          <span className="text-[10px] text-sky-400 group-hover:translate-x-0.5 transition-transform">{actionLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Cas étranger : VPN STRICTEMENT ICI */}
                {providerData.svod.status === 'vpn_needed' && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-500/10 p-3.5 rounded-xl border border-amber-500/20">
                    <div>
                      <p className="text-xs text-amber-300 font-medium">
                        {t.vpnNeededDesc} <strong>{providerData.svod.flag} {providerData.svod.targetCountry}</strong> :
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        {providerData.svod.providers.map((p, i) => (
                          <span key={i} className="flex items-center gap-1.5 text-xs text-slate-200 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                            {p.logo && <img src={p.logo} alt="" className="w-4 h-4 rounded object-cover" />}
                            <span>{p.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                    <a
                      href={getVpnAffiliateUrl('nordvpn')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold whitespace-nowrap shadow-md shadow-sky-500/20 text-center transition-all hover:scale-105 flex-shrink-0"
                    >
                      {t.vpnButton} ⚡
                    </a>
                  </div>
                )}

                {/* Cas absent du SVOD : AUCUN BOUTON VPN */}
                {providerData.svod.status === 'none' && (
                  <p className="text-xs text-slate-400 italic">
                    {t.vodOnlyMessage}
                  </p>
                )}
              </>
            )}
          </div>

          {/* 2. SECTION ACHAT & LOCATION NUMÉRIQUE (VOD) */}
          {!isLoadingProviders && providerData.vod && providerData.vod.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                💳 {t.vodSection}
              </span>
              <div className="flex flex-wrap gap-2">
                {providerData.vod.map((item, idx) => (
                  <a
                    key={idx}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 transition-all text-xs text-slate-300 hover:text-white"
                    title={`Louer ou acheter sur ${item.name}`}
                  >
                    {item.logo && <img src={item.logo} alt={item.name} className="w-4 h-4 rounded object-cover flex-shrink-0" />}
                    <span>{item.name}</span>
                    <span className="text-[10px] text-slate-500">↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Cast */}
          {selectedMovie.cast && selectedMovie.cast.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Users className="w-4 h-4" />
                <span>Acteurs Principaux</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {selectedMovie.cast.slice(0, 4).map(actor => (
                  <div key={actor.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                    <img
                      src={actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80'}
                      alt={actor.name}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-white truncate">{actor.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{actor.character}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
