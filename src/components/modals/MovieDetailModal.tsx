import React, { useState, useEffect, useRef } from 'react';
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
import { getMovieTrailer, fetchMovieDetails } from '../../services/tmdb';
import { getVpnAffiliateUrl } from '../../config/affiliates';
import { 
  getMediaProviders, 
  MediaProvidersResult,
  getDirectStreamingUrl,
  isIntermediaryWatchLink
} from '../../services/streamingResolver';
import { isNetflixProvider, handleStreamingClick, redirectToStreamingProvider } from '../../services/deepLinkHelper';
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
  const [localizedDetails, setLocalizedDetails] = useState<Partial<Movie> | null>(null);
  const [providerData, setProviderData] = useState<MediaProvidersResult>({
    svod: { status: 'none', providers: [] },
    vod: []
  });
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);

  const mediaHeroRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // Fetch dynamic trailer, localized details and watch providers whenever selectedMovie or language changes
  useEffect(() => {
    if (!selectedMovie) {
      setTrailerKey(null);
      setLocalizedDetails(null);
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

    // 1. Recharger les métadonnées localisées (titre, synopsis, genres) dans la langue choisie
    fetchMovieDetails(selectedMovie.id, selectedMovie.media_type, apiSettings.tmdbApiKey, lang)
      .then((details) => {
        if (isMounted && details) {
          setLocalizedDetails(details);
        }
      })
      .catch((err) => {
        console.warn('[Éliciné] Localized details load error:', err);
      });

    // 2. Recharger la bande-annonce selon la langue de l'utilisateur
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

    // 3. Interroger les disponibilités de streaming selon la localisation géographique détectée
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

  // Handle hardware back button (Android) or swipe back to close modal
  useEffect(() => {
    if (!selectedMovie) return;

    // Push a dummy state to intercept the next back navigation
    window.history.pushState({ modal: 'MovieDetailModal' }, '');

    const handlePopState = (e: PopStateEvent) => {
      // The user pressed Back. Close the modal instead of going back in history.
      setSelectedMovie(null);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Clean up the dummy state we pushed, if the modal closes by other means
      if (window.history.state?.modal === 'MovieDetailModal') {
        window.history.back();
      }
    };
  }, [selectedMovie, setSelectedMovie]);

  if (!selectedMovie) return null;

  const inWatchlist = isInWatchlist(selectedMovie.id);
  const alertActive = isMovieAlertActive(selectedMovie.id);

  const isTv = (
    selectedMovie.media_type === 'SÉRIE' ||
    selectedMovie.media_type === 'tv' ||
    selectedMovie.title.toLowerCase().includes('série')
  );
  const mediaTypeBadge = isTv ? 'SÉRIE' : 'FILM';

  const displayTitle = localizedDetails?.title || selectedMovie.title;
  const displayOriginalTitle = localizedDetails?.original_title || selectedMovie.original_title;
  const currentGenres = (localizedDetails?.genres && localizedDetails.genres.length > 0)
    ? localizedDetails.genres
    : (selectedMovie.genres || []);

  // 3. Correction du double badge "Série" : dédupliquer et exclure la redondance
  const uniqueGenres = Array.from(
    new Map(
      currentGenres
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
        title: displayTitle,
        text: `Découvre "${displayTitle}" sur Éliciné !`,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast('🔗 Lien copié dans le presse-papier !');
    }
  };

  const openYouTubeFallback = () => {
    const trailerSuffix = lang === 'en' ? 'official trailer' : lang === 'es' ? 'trailer oficial' : 'bande annonce vf';
    window.open(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(`${displayTitle} ${trailerSuffix}`)}`,
      '_blank'
    );
  };

  const handleWatchTrailer = () => {
    if (trailerKey) {
      setIsPlayingTrailer(true);
      if (modalContainerRef.current) {
        modalContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (mediaHeroRef.current) {
        mediaHeroRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else if (isLoadingTrailer) {
      showToast('Recherche de la bande-annonce...');
    } else {
      openYouTubeFallback();
    }
  };

  return (
    <div 
      ref={modalContainerRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 pb-6 px-0 sm:px-4 overflow-y-auto bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setSelectedMovie(null);
        }
      }}
    >
      
      {/* Modal Card */}
      <div 
        className="relative w-full max-w-4xl min-h-[calc(100vh-4rem)] sm:min-h-0 sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl bg-white dark:bg-[#0e0e0e] border-t sm:border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden text-slate-800 dark:text-zinc-100 flex flex-col transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedMovie(null);
          }}
          className="absolute top-3 right-3 z-50 p-2.5 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md border border-white/20 shadow-lg active:scale-95 transition-all cursor-pointer"
          title="Fermer"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Media Hero: Video Trailer or Backdrop (Ratio standard 16/9 propre) */}
        <div 
          ref={mediaHeroRef}
          className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden flex-shrink-0"
        >
          {isPlayingTrailer ? (
            trailerKey ? (
              <div className="relative w-full h-full aspect-video">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
                  title={`Bande-annonce de ${selectedMovie.title}`}
                  className="w-full h-full border-0 aspect-video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
                {/* Bouton pour revenir à l'affiche */}
                <button
                  type="button"
                  onClick={() => setIsPlayingTrailer(false)}
                  className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/75 hover:bg-black text-white text-xs font-semibold backdrop-blur-md border border-white/20 shadow-lg cursor-pointer transition-all"
                  title="Revenir à l'affiche"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Affiche</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 aspect-video w-full">
                <AlertCircle className="w-10 h-10 text-zinc-400" />
                <p className="text-sm text-zinc-300 max-w-md">
                  Aucune bande-annonce officielle intégrable disponible directement pour ce titre.
                </p>
                <button
                  onClick={openYouTubeFallback}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white text-xs font-bold shadow-lg transition-all cursor-pointer"
                >
                  <Youtube className="w-4 h-4" />
                  <span>Rechercher sur YouTube</span>
                </button>
              </div>
            )
          ) : (
            <div className="relative w-full h-full aspect-video">
              <img
                src={selectedMovie.backdrop_path || selectedMovie.poster_path || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&q=80'}
                alt={selectedMovie.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0e] via-[#0e0e0e]/40 to-transparent" />

              {/* Play Trailer Overlay Button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  type="button"
                  onClick={handleWatchTrailer}
                  className="group flex items-center gap-3 px-6 py-3.5 rounded-full bg-white hover:bg-zinc-200 text-black font-bold shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center shadow">
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  </div>
                  <span className="text-xs sm:text-sm uppercase tracking-wider font-extrabold">Bande-annonce</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Content Body */}
        {/* Scrollable Content Body */}
        <div className="p-5 sm:p-8 space-y-6 overflow-y-auto">
          
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/10 text-xs font-semibold">
                  Fiche Détaillée
                </span>
                <span className="text-xs text-slate-500 dark:text-zinc-400">
                  {selectedMovie.release_date}
                </span>
                {selectedMovie.runtime && (
                  <span className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {selectedMovie.runtime} min
                  </span>
                )}
              </div>

              <h2 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                {displayTitle}
              </h2>
              {displayOriginalTitle && displayOriginalTitle !== displayTitle && (
                <p className="text-xs text-slate-500 dark:text-zinc-400 italic">
                  Titre original : {displayOriginalTitle}
                </p>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
              {/* Bouton d'action principal bien visible "▶ Bande-annonce" */}
              <button
                type="button"
                onClick={handleWatchTrailer}
                className="px-4 py-2 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer select-none whitespace-nowrap"
                title="Regarder la bande-annonce"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Bande-annonce</span>
              </button>

              <button
                type="button"
                onClick={() => toggleWatchlist(selectedMovie)}
                className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer select-none whitespace-nowrap ${
                  inWatchlist
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-black border-slate-900 dark:border-white'
                    : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-white/15 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-800'
                }`}
              >
                {inWatchlist ? <Check className="w-4 h-4 stroke-[3]" /> : <Bookmark className="w-4 h-4" />}
                <span>{inWatchlist ? `${t.myListBtn} ✓` : t.myListBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => addAlert(selectedMovie)}
                className={`p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  alertActive
                    ? 'bg-[#e50914] border-[#e50914] text-white'
                    : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-white/15 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-800'
                }`}
                title={t.alertBtn}
              >
                <Bell className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleShare}
                className="p-2 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-white/15 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-all cursor-pointer"
                title="Partager"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* AI Match Insight if available */}
          {selectedMovie.ai_match_reason && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-white/10 flex items-start gap-3 text-sm text-slate-800 dark:text-zinc-200">
              <Sparkles className="w-5 h-5 text-[#e50914] flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider block mb-1">
                  {t.critiqueTitle}
                </span>
                <p className="leading-relaxed text-xs sm:text-sm text-slate-600 dark:text-zinc-300">
                  {selectedMovie.ai_match_reason}
                </p>
              </div>
            </div>
          )}

          {/* Genres & Rating */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.05] text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 text-xs font-bold">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{selectedMovie.vote_average.toFixed(1)} / 10</span>
              {selectedMovie.vote_count && (
                <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-normal">({selectedMovie.vote_count.toLocaleString()} avis)</span>
              )}
            </div>

            {/* Badge Type Unique (Film ou Série) */}
            <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.05] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/10 text-xs font-semibold uppercase tracking-wider">
              {mediaTypeBadge === 'SÉRIE' ? t.badgeSerie : t.badgeFilm}
            </span>

            {/* Genres dédupliqués */}
            {uniqueGenres.map(g => (
              <span key={g.id} className="px-3 py-1 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-zinc-300">
                {g.name}
              </span>
            ))}
          </div>

          {/* Synopsis */}
          {(() => {
            const rawOverview = (localizedDetails?.overview || selectedMovie.overview || '').trim();
            const isOriginalShort = rawOverview.length < 40;
            const isAiEnrichedSynopsis = selectedMovie.is_ai_overview || (isOriginalShort && Boolean(selectedMovie.ai_match_reason || selectedMovie.synopsis));
            const displayOverview = (isOriginalShort && (selectedMovie.synopsis || selectedMovie.ai_match_reason))
              ? (selectedMovie.synopsis || selectedMovie.ai_match_reason)
              : (rawOverview || selectedMovie.ai_match_reason || "Synopsis complet en cours de synchronisation par Éliciné AI.");

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    {t.synopsisTitle}
                  </h3>
                  {isAiEnrichedSynopsis && (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/10 text-[10px] font-semibold animate-fade-in">
                      <Sparkles className="w-3 h-3 text-[#e50914]" />
                      <span>Synopsis enrichi par l'IA</span>
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-700 dark:text-zinc-200 leading-relaxed font-normal">
                  {displayOverview}
                </p>
              </div>
            );
          })()}

          {/* 1. SECTION STREAMING ILLIMITÉ (SVOD) */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#e50914]" />
                <span>{t.streamingSection}</span>
              </span>
            </div>

            {isLoadingProviders ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-slate-700 dark:text-white" />
                <span>Vérification des disponibilités en streaming...</span>
              </div>
            ) : (
              <>
                {/* Cas local : lecture directe */}
                {providerData.svod.status === 'local' && (
                  <div className="flex flex-wrap gap-2">
                    {providerData.svod.providers.map((p, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          redirectToStreamingProvider(selectedMovie, p, showToast);
                        }}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-black border border-slate-200 dark:border-white/15 hover:border-slate-400 dark:hover:border-white/40 transition-all shadow-sm group hover:scale-105 cursor-pointer select-none"
                        title={`Regarder "${selectedMovie.title}" sur ${p.name}`}
                      >
                        {p.logo && <img src={p.logo} alt={p.name} className="w-5 h-5 rounded object-cover flex-shrink-0" />}
                        <span className="text-xs font-semibold text-slate-800 dark:text-white group-hover:text-slate-950 dark:group-hover:text-zinc-200 transition-colors">
                          Regarder sur {p.name} ↗
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Cas étranger : VPN */}
                {providerData.svod.status === 'vpn_needed' && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100 dark:bg-black/60 p-3.5 rounded-xl border border-slate-200 dark:border-white/10">
                    <div>
                      <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium">
                        {t.vpnNeededDesc} <strong>{providerData.svod.flag} {providerData.svod.targetCountry}</strong> :
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        {providerData.svod.providers.map((p, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              redirectToStreamingProvider(selectedMovie, p, showToast);
                            }}
                            className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-white/40 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer transition-all"
                            title={`Regarder "${selectedMovie.title}" sur ${p.name}`}
                          >
                            {p.logo && <img src={p.logo} alt="" className="w-4 h-4 rounded object-cover" />}
                            <span>Regarder sur {p.name} ↗</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <a
                      href={getVpnAffiliateUrl('nordvpn')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white text-xs font-bold whitespace-nowrap shadow-md text-center transition-all hover:scale-105 flex-shrink-0"
                    >
                      {t.vpnButton} ⚡
                    </a>
                  </div>
                )}

                {/* Cas absent du SVOD */}
                {providerData.svod.status === 'none' && (
                  <p className="text-xs text-slate-500 dark:text-zinc-400 italic">
                    {t.vodOnlyMessage}
                  </p>
                )}
              </>
            )}
          </div>

          {/* 2. SECTION ACHAT & LOCATION NUMÉRIQUE (VOD) */}
          {!isLoadingProviders && providerData.vod && providerData.vod.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-white/10 flex flex-col gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
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
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-black border border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 transition-all text-xs text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white"
                    title={`Louer ou acheter sur ${item.name}`}
                  >
                    {item.logo && <img src={item.logo} alt={item.name} className="w-4 h-4 rounded object-cover flex-shrink-0" />}
                    <span>{item.name}</span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500">↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Cast */}
          {selectedMovie.cast && selectedMovie.cast.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                <Users className="w-4 h-4" />
                <span>Acteurs Principaux</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {selectedMovie.cast.slice(0, 4).map(actor => (
                  <div key={actor.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-white/10">
                    <img
                      src={actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&q=80'}
                      alt={actor.name}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{actor.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">{actor.character}</p>
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
