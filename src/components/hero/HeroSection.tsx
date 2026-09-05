import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Plus, 
  Check, 
  Bell, 
  Sparkles, 
  Loader2, 
  AlertTriangle,
  Search
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';
import { executeCinoraSearch, AIRecommendationResult } from '../../services/aiEngine';
import { ElicineLogo } from '../ElicineLogo';
import { Movie } from '../../types';

interface HeroSectionProps {
  onAiResultsFound?: (results: {
    movies: Movie[];
    thought: string;
    mood: string;
    suggestedPrompts: string[];
  }) => void;
  onAiSearchStart?: () => void;
}

const DEFAULT_HERO_MOVIES: Movie[] = [
  {
    id: 693134,
    title: 'Dune : Deuxième Partie',
    original_title: 'Dune: Part Two',
    overview: "Paul Atreides s'unit à Chani et aux Fremen tout en préparant sa revanche contre les conspirateurs qui ont détruit sa famille.",
    backdrop_path: 'https://image.tmdb.org/t/p/original/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    poster_path: 'https://image.tmdb.org/t/p/w500/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg',
    release_date: '2024-02-28',
    vote_average: 8.3,
    vote_count: 5400,
    runtime: 166,
    media_type: 'FILM',
    genres: [{ id: 878, name: 'Science-Fiction' }, { id: 12, name: 'Aventure' }]
  },
  {
    id: 157336,
    title: 'Interstellar',
    original_title: 'Interstellar',
    overview: "Dans un futur proche, la Terre est devenue hostile. Une équipe d'astronautes traverse un trou de ver pour trouver un nouveau foyer pour l'humanité.",
    backdrop_path: 'https://image.tmdb.org/t/p/original/rAiYTsqhk0II7MmXWP3vY9bHj4a.jpg',
    poster_path: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    release_date: '2014-11-05',
    vote_average: 8.4,
    vote_count: 36000,
    runtime: 169,
    media_type: 'FILM',
    genres: [{ id: 878, name: 'Science-Fiction' }, { id: 18, name: 'Drame' }]
  },
  {
    id: 335984,
    title: 'Blade Runner 2049',
    original_title: 'Blade Runner 2049',
    overview: "En 2049, la société est fragilisée par les tensions entre humains et esclaves créés par bio-ingénierie. L'officier K déterre un secret enfoui.",
    backdrop_path: 'https://image.tmdb.org/t/p/original/sAtoMqDVhNDQBc3QJL3RF6hlxGq.jpg',
    poster_path: 'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg',
    release_date: '2017-10-04',
    vote_average: 8.0,
    vote_count: 13500,
    runtime: 164,
    media_type: 'FILM',
    genres: [{ id: 878, name: 'Science-Fiction' }, { id: 9648, name: 'Mystère' }]
  },
  {
    id: 27205,
    title: 'Inception',
    original_title: 'Inception',
    overview: "Dom Cobb est un voleur expérimenté dans l'art périlleux de l'extraction : voler les secrets enfouis au plus profond du subconscient pendant le sommeil.",
    backdrop_path: 'https://image.tmdb.org/t/p/original/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg',
    poster_path: 'https://image.tmdb.org/t/p/w500/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg',
    release_date: '2010-07-16',
    vote_average: 8.4,
    vote_count: 37000,
    runtime: 148,
    media_type: 'FILM',
    genres: [{ id: 28, name: 'Action' }, { id: 878, name: 'Science-Fiction' }]
  },
  {
    id: 546554,
    title: 'À couteaux tirés',
    original_title: 'Knives Out',
    overview: "Célèbre auteur de polars, Harlan Thrombey est retrouvé mort dans son manoir. Le détective Benoit Blanc est engagé pour mener l'enquête.",
    backdrop_path: 'https://image.tmdb.org/t/p/original/Ab8mkHmkYADjU7wQiOkia9BzGvS.jpg',
    poster_path: 'https://image.tmdb.org/t/p/w500/pThyQovXQrw2m0s9x82twj48Jq4.jpg',
    release_date: '2019-11-27',
    vote_average: 7.9,
    vote_count: 12000,
    runtime: 130,
    media_type: 'FILM',
    genres: [{ id: 35, name: 'Comédie' }, { id: 9648, name: 'Mystère' }]
  }
];

export const HeroSection: React.FC<HeroSectionProps> = ({ onAiResultsFound, onAiSearchStart }) => {
  const { 
    setSelectedMovie, 
    toggleWatchlist, 
    isInWatchlist, 
    addAlert, 
    isMovieAlertActive,
    useAiQuota,
    apiSettings,
    addHistoryItem,
    showToast
  } = useApp();

  const { t } = useTranslation();

  const [trendingHeroMovies, setTrendingHeroMovies] = useState<Movie[]>(DEFAULT_HERO_MOVIES);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [searchPrompt, setSearchPrompt] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'Tous' | 'Films' | 'Séries TV'>('Tous');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ─── 1. FETCH LIVE TMDB TRENDING MOVIES FOR HERO (5 RÉCENTS BOX-OFFICE) ───
  useEffect(() => {
    const key = (
      localStorage.getItem('elicine_tmdb_key') ||
      localStorage.getItem('cinora_tmdb_key') ||
      localStorage.getItem('cinéia_tmdb_key') || 
      localStorage.getItem('cineia_tmdb_key') || 
      localStorage.getItem('tmdb_api_key') ||
      apiSettings?.tmdbApiKey || 
      ''
    ).trim();

    const tmdbUrl = `/api/tmdb?endpoint=${encodeURIComponent('trending/movie/week')}&language=${encodeURIComponent(t.tmdbLang)}${key ? `&api_key=${encodeURIComponent(key)}` : ''}`;

    fetch(tmdbUrl)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.results && Array.isArray(data.results) && data.results.length > 0) {
          const liveTop5: Movie[] = data.results.slice(0, 5).map((m: any) => ({
            id: m.id,
            title: m.title || m.name || 'Titre inconnu',
            original_title: m.original_title || m.original_name || '',
            overview: m.overview || 'Synopsis officiel à découvrir sur Éliciné.',
            poster_path: m.poster_path ? `https://image.tmdb.org/t/p/original${m.poster_path}` : null,
            backdrop_path: m.backdrop_path ? `https://image.tmdb.org/t/p/original${m.backdrop_path}` : (m.poster_path ? `https://image.tmdb.org/t/p/original${m.poster_path}` : null),
            release_date: m.release_date || m.first_air_date || '2024',
            vote_average: Number(m.vote_average?.toFixed(1)) || 7.5,
            vote_count: m.vote_count || 100,
            runtime: 120,
            media_type: 'FILM',
            primary_platform: 'Cinéma / VOD',
            genres: (m.genre_ids || [18]).map((gid: number) => ({ id: gid, name: 'Tendance' }))
          }));
          setTrendingHeroMovies(liveTop5);
        }
      })
      .catch(err => {
        console.warn('[HeroSection] Erreur chargement tendances TMDB live :', err);
      });
  }, [apiSettings?.tmdbApiKey, t.tmdbLang]);

  // Auto rotate carousel every 8.5 seconds
  useEffect(() => {
    if (!trendingHeroMovies || trendingHeroMovies.length === 0) return;
    const timer = setInterval(() => {
      setFeaturedIndex((prev) => (prev + 1) % trendingHeroMovies.length);
    }, 8500);
    return () => clearInterval(timer);
  }, [trendingHeroMovies?.length]);

  const currentMovie: Movie | null = (trendingHeroMovies && trendingHeroMovies.length > 0)
    ? (trendingHeroMovies[featuredIndex] || trendingHeroMovies[0] || null)
    : null;

  const inWatchlist = currentMovie?.id ? isInWatchlist(currentMovie.id) : false;
  const alertActive = currentMovie?.id ? isMovieAlertActive(currentMovie.id) : false;

  const handleSearch = async (queryText?: string) => {
    const q = (queryText !== undefined ? queryText : searchPrompt).trim();
    setErrorMessage(null);

    if (!q) {
      showToast('Veuillez décrire le type de film ou l\'ambiance souhaitée.');
      return;
    }


    const permitted = useAiQuota();
    if (!permitted) return;

    setIsAiLoading(true);
    if (onAiSearchStart) {
      onAiSearchStart();
    }

    try {
      console.log(`[Éliciné AI] Exécution requête IA réelle pour : "${q}" (${t.aiPromptLang})`);
      const res: AIRecommendationResult = await executeCinoraSearch(q, apiSettings, t.tmdbLang, t.aiPromptLang);
      
      addHistoryItem(q, res.recommendedMovies.length, res.moodDetected);
      
      if (onAiResultsFound) {
        onAiResultsFound({
          movies: res.recommendedMovies,
          thought: res.thought,
          mood: res.moodDetected,
          suggestedPrompts: res.suggestedPrompts
        });
      }

      showToast(`✨ ${res.recommendedMovies.length} films trouvés par l'algorithme !`);
      
      const resultsEl = document.getElementById('results-section');
      if (resultsEl) {
        resultsEl.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (e: any) {
      console.error('[Éliciné AI Search Error]', e?.message || e);
      const msg = e?.message || 'Erreur lors de la recherche IA.';
      setErrorMessage(msg);
      showToast(`❌ Erreur : ${msg}`);
      if (onAiResultsFound) {
        onAiResultsFound({
          movies: [],
          thought: `⚠️ ${msg}`,
          mood: q,
          suggestedPrompts: [
            'Un film de braquage drôle et haletant',
            'Un thriller psychologique sombre et mystérieux',
            'Une fresque spatiale émouvante'
          ]
        });
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-slate-800/80 shadow-[0_0_60px_-15px_rgba(14,165,233,0.2)] bg-slate-950 min-h-[580px] md:min-h-[640px] flex flex-col justify-between p-6 sm:p-10 md:p-12 transition-all duration-700">
      
      {/* ─── 1. ARRIÈRE-PLAN CINÉMATOGRAPHIQUE IMMERSIF (Backdrop) ─── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
        {currentMovie && (
          <img
            key={currentMovie.id}
            src={currentMovie.backdrop_path || currentMovie.poster_path || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&q=80'}
            alt={currentMovie.title}
            className="w-full h-full object-cover object-center opacity-70 md:opacity-80 filter brightness-105 contrast-105 saturate-110 scale-105 transition-opacity duration-700"
            loading="eager"
          />
        )}

        {/* ─── 2. DÉGRADÉ VIGNETTE MULTI-COUCHES (Pour protéger les textes) ─── */}
        {/* Couche 1 : Fondu vertical doux du bas vers le haut transparent */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07090e] via-[#07090e]/50 to-transparent" />
        {/* Couche 2 : Contraste radial subtil */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-[#07090e]/25 to-[#07090e]/60" />
      </div>

      {/* ─── 3. CONTENU ENTIÈREMENT CENTRALISÉ (Text-Center & Z-Index) ─── */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center max-w-3xl mx-auto my-auto w-full">
        
        {/* a) Badge Supérieur */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950/80 border border-sky-500/40 backdrop-blur-md shadow-lg shadow-black/50 mb-4 animate-fade-in">
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-200">{t.aiAnalysisBadge}</span>
        </div>

        {/* b) Marque & Accroche */}
        <div className="flex flex-col items-center justify-center mb-3 animate-fade-in">
          <ElicineLogo size="lg" className="mb-2" />
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            {t.tagline}
          </h1>
        </div>
        <p className="text-sm md:text-base text-slate-100 max-w-xl mx-auto font-normal leading-relaxed mb-6 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
          {t.searchPlaceholder}
        </p>

        {/* c) Barre de Recherche "Floating Glass" */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(searchPrompt);
          }}
          className="max-w-2xl w-full rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/90 shadow-2xl shadow-black/60 p-2 flex items-center gap-3 focus-within:border-sky-500/80 focus-within:ring-2 focus-within:ring-sky-500/20 transition-all"
        >
          <Search className="w-4 h-4 text-slate-400 ml-3 flex-shrink-0" />
          <input
            id="main-ai-search"
            type="text"
            value={searchPrompt}
            onChange={(e) => {
              setSearchPrompt(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder={t.searchPlaceholder}
            className="flex-1 bg-transparent text-white placeholder-slate-400 text-sm outline-none px-2 py-1 font-normal"
          />

          {/* Bouton d'action à droite */}
          <button
            type="submit"
            disabled={isAiLoading}
            className="bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-medium text-xs md:text-sm px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-sky-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {isAiLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>{t.aiAnalysisBadge}...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>{t.exploreBtn}</span>
              </>
            )}
          </button>
        </form>

        {/* Banner de chargement IA */}
        {isAiLoading && (
          <div className="mt-3 p-3 rounded-xl bg-sky-950/80 backdrop-blur-md border border-sky-500/30 text-sky-300 text-xs font-semibold flex items-center justify-center gap-2.5 animate-pulse max-w-xl w-full">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400 flex-shrink-0" />
            <span>✨ {t.aiAnalysisBadge} (Routage Hybride TMDB / IA)...</span>
          </div>
        )}

        {/* Message d'erreur explicatif */}
        {errorMessage && (
          <div className="mt-3 p-3 rounded-xl bg-red-950/80 backdrop-blur-md border border-red-500/40 text-red-200 text-xs font-semibold flex items-center justify-between gap-3 animate-slide-up max-w-xl w-full text-left">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="line-clamp-1">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="px-2.5 py-1 rounded-lg bg-red-900/60 hover:bg-red-800 text-white text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer"
            >
              Fermer
            </button>
          </div>
        )}

        {/* d) Filtres Rapides (Pills) */}
        <div className="flex items-center justify-center gap-2 mt-3.5 mb-6">
          {[
            { type: 'Tous' as const, label: t.filterAll },
            { type: 'Films' as const, label: t.filterMovies },
            { type: 'Séries TV' as const, label: t.filterSeries }
          ].map(({ type, label }) => {
            const isSelected = selectedTypeFilter === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedTypeFilter(type)}
                className={`px-3.5 py-1 rounded-full text-xs font-semibold backdrop-blur-md transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-sky-500 text-white shadow-[0_0_15px_rgba(14,165,233,0.5)] border border-sky-400'
                    : 'bg-slate-900/85 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* e) Encart "À l'Affiche" & Actions du Film */}
        {currentMovie && (
          <div className="pt-2 pb-1 space-y-3">
            <p className="text-xs uppercase tracking-widest text-sky-300 font-extrabold drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
              {t.featuredBadge} : {currentMovie.title}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              
              {/* [▶ Bande-annonce] */}
              <button
                onClick={() => setSelectedMovie(currentMovie)}
                className="bg-sky-500 hover:bg-sky-400 text-white font-semibold text-xs px-4 py-2 rounded-full flex items-center gap-2 shadow-md shadow-sky-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t.trailerBtn}</span>
              </button>

              {/* [+ Ma Liste] */}
              <button
                onClick={() => toggleWatchlist(currentMovie)}
                className={`backdrop-blur-md bg-slate-900/85 border border-slate-700/80 hover:bg-slate-800/90 text-white text-xs px-4 py-2 rounded-full flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-black/50 ${
                  inWatchlist ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/20' : ''
                }`}
              >
                {inWatchlist ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{inWatchlist ? `${t.myListBtn} ✓` : t.myListBtn}</span>
              </button>

              {/* [🔔 Alerte] */}
              <button
                onClick={() => addAlert(currentMovie)}
                className={`backdrop-blur-md bg-slate-900/85 border border-slate-700/80 hover:bg-slate-800/90 text-white text-xs px-4 py-2 rounded-full flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-black/50 ${
                  alertActive ? 'border-amber-500/50 text-amber-300 bg-amber-500/20' : ''
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>{alertActive ? `${t.alertBtn} ✓` : t.alertBtn}</span>
              </button>

            </div>
          </div>
        )}

      </div>

      {/* ─── f) Indicateurs du Carrousel (Dots) ─── */}
      {trendingHeroMovies && trendingHeroMovies.length > 0 && (
        <div className="relative z-10 flex items-center justify-center gap-2 pt-4">
          {trendingHeroMovies.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setFeaturedIndex(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                idx === featuredIndex 
                  ? 'w-6 bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.7)]' 
                  : 'w-2 bg-slate-600 hover:bg-slate-400'
              }`}
              title={`Tendance ${idx + 1}`}
            />
          ))}
        </div>
      )}

    </div>
  );
};
