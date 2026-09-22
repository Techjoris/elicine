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
  AlertCircle,
  Globe2,
  ShieldCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';
import { Movie } from '../../types';
import { getMovieTrailer, fetchMovieDetails } from '../../services/tmdb';
import { 
  getMediaProviders, 
  MediaProvidersResult,
  getDirectStreamingUrl,
  isIntermediaryWatchLink
} from '../../services/streamingResolver';
import { isNetflixProvider, handleStreamingClick, redirectToStreamingProvider } from '../../services/deepLinkHelper';
import { getCachedCountryCode } from '../../services/geoService';
import { isSeriesMedia } from '../../lib/mediaType';
import { PrivateConnectionModal } from './PrivateConnectionModal';

export const MovieDetailModal: React.FC = () => {
  const { 
    selectedMovie, 
    setSelectedMovie, 
    toggleWatchlist, 
    isInWatchlist, 
    addAlert, 
    isMovieAlertActive,
    apiSettings,
    showToast,
    user
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
  const [isPrivateConnectionOpen, setIsPrivateConnectionOpen] = useState(false);

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

    const isTv = isSeriesMedia(selectedMovie.media_type);
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
  const alertActive = isMovieAlertActive(selectedMovie.id, selectedMovie.media_type);

  const releaseDateObj = selectedMovie.release_date ? new Date(selectedMovie.release_date) : null;
  const isUpcoming = Boolean(
    releaseDateObj && 
    !isNaN(releaseDateObj.getTime()) && 
    releaseDateObj.getTime() > Date.now()
  );

  const isUserSubscriberPro = Boolean(
    user && (
      user.isPro || 
      user.is_pro || 
      user.pass_status === 'pro' || 
      (user.email && ['ivanjoris959@gmail.com', 'techjoris@gmail.com', 'admin@elicine.app', 'joris@elicine.app'].includes(user.email.toLowerCase()))
    )
  );

  const isTv = isSeriesMedia(selectedMovie.media_type);
  const mediaTypeBadge = isTv ? 'SÉRIE' : 'FILM';

  const displayTitle = localizedDetails?.title || selectedMovie.title;
  const displayOriginalTitle = localizedDetails?.original_title || selectedMovie.original_title;
  
  // Sécurisation stricte des genres TMDB (tableaux d'objets, tableaux de chaînes ou formats hétérogènes)
  const rawGenres = (localizedDetails?.genres && Array.isArray(localizedDetails.genres) && localizedDetails.genres.length > 0)
    ? localizedDetails.genres
    : (Array.isArray(selectedMovie?.genres) ? selectedMovie.genres : []);

  const normalizedGenres = (Array.isArray(rawGenres) ? rawGenres : [])
    .map((g: any, index: number) => {
      if (!g) return null;
      if (typeof g === 'string') return { id: index, name: g };
      if (typeof g === 'object' && g.name) return { id: g.id || index, name: String(g.name) };
      return null;
    })
    .filter((g): g is { id: number | string; name: string } => g !== null && Boolean(g.name));

  // Correction du double badge "Série" : dédupliquer et exclure la redondance
  const uniqueGenres = Array.from(
    new Map(
      (Array.isArray(normalizedGenres) ? normalizedGenres : [])
        .filter(g => {
          if (!g || !g.name || typeof g.name !== 'string') return false;
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
                className={`p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  alertActive
                    ? 'bg-amber-500 border-amber-500 text-zinc-950 font-bold shadow-neon-gold'
                    : 'bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-white/15 text-slate-700 dark:text-zinc-200 hover:bg-slate-200 dark:hover:bg-zinc-800'
                }`}
                title={alertActive ? 'Alerte active (J-2 & Jour J)' : (isUpcoming ? 'Être notifié par email de la sortie (Pass Pro)' : t.alertBtn)}
              >
                <Bell className="w-4 h-4" />
                {isUpcoming && (
                  <span className="text-[11px] font-bold hidden sm:inline">
                    {alertActive ? 'Alerte active ✓' : 'M\'alerter'}
                  </span>
                )}
                {!isUserSubscriberPro && (
                  <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-black">
                    PRO
                  </span>
                )}
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

          {/* Bannière Dédiée Sortie à Venir & Notification Pass Pro */}
          {isUpcoming && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-zinc-900/80 to-zinc-900/50 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-black text-[10px] uppercase tracking-wider border border-amber-500/30">
                    Exclusivité Pass Pro
                  </span>
                  <span className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    Sortie le {releaseDateObj ? releaseDateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : selectedMovie.release_date}
                  </span>
                </div>
                <p className="text-zinc-400 text-[11px]">
                  Recevez un rappel par e-mail à <strong>J-2</strong> puis le <strong>Jour J</strong> dès sa disponibilité officielle.
                </p>
              </div>

              <button
                type="button"
                onClick={() => addAlert(selectedMovie)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 flex-shrink-0 shadow-md ${
                  alertActive
                    ? 'bg-amber-500 text-zinc-950 font-black shadow-neon-gold hover:bg-amber-400'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-zinc-950'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>{alertActive ? 'Alerte de sortie active ✓' : 'M\'alerter de la sortie'}</span>
                {!isUserSubscriberPro && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/20 text-zinc-950 font-black uppercase">
                    PRO
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Match Insight if available */}
          {selectedMovie.ai_match_reason && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-white/10 flex items-start gap-3 text-sm text-slate-800 dark:text-zinc-200">
              <Sparkles className="w-5 h-5 text-[#e50914] flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider block mb-1">
                  {t.critiqueTitle}
                </span>
                <p className="leading-relaxed text-xs sm:text-sm text-slate-600 dark:text-zinc-300">
                  {selectedMovie.ai_match_reason
                    .replace(/Recherche Intelligente LLM/gi, 'Sélection Éliciné')
                    .replace(/Recherche par contexte IA/gi, 'Sélection Éliciné')
                    .replace(/Recherche sémantique vectorielle/gi, 'Algorithme Éliciné')
                    .replace(/Aucune contrainte narrative.*/gi, 'Intrigue et atmosphère en accord avec votre recherche')
                    .replace(/Correspondance avec les éléments narratifs demandés/gi, 'Intrigue et atmosphère en accord avec votre recherche')
                    .replace(/\bTMDB\b/gi, 'Éliciné')
                    .replace(/\bLLM\b/gi, 'Éliciné')
                    .replace(/\s*\(Niveau\s*\d+\)/gi, '')}
                </p>
              </div>
            </div>
          )}

          {/* Genres & Rating */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div 
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.05] text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 text-xs font-bold"
              title={`Note moyenne spectateurs : ${selectedMovie.vote_average.toFixed(1)}/10`}
            >
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{selectedMovie.vote_average.toFixed(1)} / 10</span>
              {selectedMovie.vote_count && (
                <span className="text-[10px] text-slate-500 dark:text-zinc-400 font-normal">({selectedMovie.vote_count.toLocaleString()} avis)</span>
              )}
            </div>

            {/* Badge de correspondance si présent */}
            {selectedMovie.match_rate !== undefined && selectedMovie.match_rate > 0 && (
              <div 
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold"
                title={`Indice de correspondance Éliciné : ${selectedMovie.match_rate}% d'affinité avec votre recherche`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                <span>{selectedMovie.match_rate}% affinité</span>
              </div>
            )}

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
              : (rawOverview || selectedMovie.ai_match_reason || "Synopsis complet en cours de synchronisation par Éliciné.");

            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                    {t.synopsisTitle}
                  </h3>
                  {isAiEnrichedSynopsis && (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/10 text-[10px] font-semibold animate-fade-in">
                      <Sparkles className="w-3 h-3 text-[#e50914]" />
                      <span>Revue Éliciné</span>
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
          <div
            key={`streaming-block-${selectedMovie.id}`}
            className="streaming-block-enter p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/90 border border-slate-200 dark:border-white/10 flex flex-col gap-3"
          >
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
                {providerData.svod.status === 'local' && Array.isArray(providerData.svod.providers) && (
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

                {/* Disponibilité dans d'autres régions */}
                {providerData.svod.status === 'vpn_needed' && (
                  <div className="rounded-xl border border-slate-200/90 dark:border-white/10 bg-white/80 dark:bg-white/[0.035] p-4">
                    <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-zinc-400">
                      <Globe2 className="w-3.5 h-3.5 text-sky-600/70 dark:text-sky-400/80" />
                      <span>{t.vpnNeededTitle}</span>
                    </p>
                    <p className="mt-2 text-xs text-slate-700 dark:text-zinc-200">
                      <span>{providerData.svod.flag} </span>
                      <strong className="font-semibold">{providerData.svod.targetCountry}</strong>
                      <span className="mx-1 text-slate-300 dark:text-zinc-600">·</span>
                      <span className="text-slate-600 dark:text-zinc-300">
                        {Array.isArray(providerData.svod.providers)
                          ? providerData.svod.providers.map((provider) => provider.name).join(' · ')
                          : ''}
                      </span>
                    </p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-500">
                      {t.vpnNeededDesc}
                    </p>
                  </div>
                )}

                {/* Sous-carte : accès selon la localisation */}
                {providerData.svod.status === 'vpn_needed' && (
                  <div className="streaming-location-card rounded-xl border border-slate-200/60 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02] p-4">
                    <div className="streaming-location-drift flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="streaming-icon-pulse w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/15 flex items-center justify-center flex-shrink-0">
                          <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                            {t.vpnTravelTitle}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
                            {t.vpnTravelText}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setIsPrivateConnectionOpen(true);
                        }}
                        className="streaming-cta-glow group/cta w-full sm:w-auto flex-shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.06] px-3.5 py-2 text-[11px] font-semibold text-slate-700 dark:text-zinc-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-white/20 hover:shadow-[0_6px_18px_rgba(56,189,248,0.12)]"
                      >
                        <span>{t.vpnButton}</span>
                        <span
                          aria-hidden="true"
                          className="streaming-cta-arrow inline-block transition-transform duration-200 group-hover/cta:translate-x-0.5"
                        >
                          →
                        </span>
                      </button>
                    </div>
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
          {!isLoadingProviders && Array.isArray(providerData.vod) && providerData.vod.length > 0 && (
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
          {selectedMovie.cast && Array.isArray(selectedMovie.cast) && selectedMovie.cast.length > 0 && (
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

      <PrivateConnectionModal
        open={isPrivateConnectionOpen}
        onClose={() => setIsPrivateConnectionOpen(false)}
      />

    </div>
  );
};
