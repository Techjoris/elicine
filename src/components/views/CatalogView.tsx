import React, { useState, useCallback } from 'react';
import { MovieGrid } from '../movies/MovieGrid';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';
import { fetchDiscoverPage, fetchSearchPage, fetchTopRatedPage, FALLBACK_MOVIES } from '../../services/tmdb';
import { useInfiniteCatalog } from '../../hooks/useInfiniteCatalog';
import { Movie } from '../../types';
import { Film, Search, Star, Sparkles, Flame, Tv, Crown, X } from 'lucide-react';

type CatalogTab = 'popular' | 'top_rated' | 'series' | 'search';

const TABS: { id: CatalogTab; label: string; icon: any }[] = [
  { id: 'popular',   label: '🔥 Populaires',   icon: Flame },
  { id: 'top_rated', label: '⭐ Mieux Notés',   icon: Star  },
  { id: 'series',    label: '📺 Séries',        icon: Tv    },
  { id: 'search',    label: '🔍 Recherche',     icon: Search }
];

/**
 * Genres du catalogue. TMDB n'utilise pas les mêmes identifiants en film et en
 * série (et n'a pas d'équivalent télé pour l'horreur, le thriller, la romance,
 * l'histoire ou la musique) : `tv: null` marque un genre indisponible en série,
 * plutôt que de filtrer sur un identifiant qui ne renverrait rien.
 */
type GenreOption = { key: string; label: string; movie: number; tv: number | null };

const GENRES: GenreOption[] = [
  { key: 'action',      label: 'Action',          movie: 28,    tv: 10759 },
  { key: 'adventure',   label: 'Aventure',        movie: 12,    tv: 10759 },
  { key: 'animation',   label: 'Animation',       movie: 16,    tv: 16    },
  { key: 'comedy',      label: 'Comédie',         movie: 35,    tv: 35    },
  { key: 'crime',       label: 'Crime',           movie: 80,    tv: 80    },
  { key: 'documentary', label: 'Documentaire',    movie: 99,    tv: 99    },
  { key: 'drama',       label: 'Drame',           movie: 18,    tv: 18    },
  { key: 'family',      label: 'Famille',         movie: 10751, tv: 10751 },
  { key: 'fantasy',     label: 'Fantastique',     movie: 14,    tv: 10765 },
  { key: 'history',     label: 'Histoire',        movie: 36,    tv: null  },
  { key: 'horror',      label: 'Horreur',         movie: 27,    tv: null  },
  { key: 'music',       label: 'Musique',         movie: 10402, tv: null  },
  { key: 'mystery',     label: 'Mystère',         movie: 9648,  tv: 9648  },
  { key: 'romance',     label: 'Romance',         movie: 10749, tv: null  },
  { key: 'scifi',       label: 'Science-Fiction', movie: 878,   tv: 10765 },
  { key: 'thriller',    label: 'Thriller',        movie: 53,    tv: null  },
  { key: 'war',         label: 'Guerre',          movie: 10752, tv: 10768 },
  { key: 'western',     label: 'Western',         movie: 37,    tv: 37    }
];

const genreIdFor = (option: GenreOption, mediaType: 'movie' | 'tv') =>
  mediaType === 'tv' ? option.tv : option.movie;

export const CatalogView: React.FC = () => {
  const { apiSettings, user, setIsProModalOpen, showToast } = useApp();
  const { t } = useTranslation();
  const key = apiSettings.tmdbApiKey;

  const [activeTab, setActiveTab] = useState<CatalogTab>('popular');
  const [searchInput, setSearchInput] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  // Le filtre de note est réservé aux abonnés Pass Pro ; le filtre de genre est
  // libre, et les deux se combinent : genre + note s'appliquent ensemble.
  const isPro = Boolean(
    user && (
      user.isPro ||
      user.is_pro ||
      user.pass_status === 'pro' ||
      (user.email && ['ivanjoris959@gmail.com', 'techjoris@gmail.com', 'admin@elicine.app', 'joris@elicine.app']
        .includes(user.email.toLowerCase()))
    )
  );

  const mediaTypeForTab: 'movie' | 'tv' = activeTab === 'series' ? 'tv' : 'movie';
  const activeGenreIds = selectedGenres
    .map(genreKey => GENRES.find(genre => genre.key === genreKey))
    .filter((genre): genre is GenreOption => Boolean(genre))
    .map(genre => genreIdFor(genre, mediaTypeForTab))
    .filter((id): id is number => Number.isSafeInteger(id));

  const toggleGenre = (genre: GenreOption) => {
    setSelectedGenres(previous =>
      previous.includes(genre.key) ? previous.filter(key => key !== genre.key) : [...previous, genre.key]);
  };

  const handleRatingChange = (value: number) => {
    if (!isPro) {
      setIsProModalOpen(true);
      showToast('Le filtre de note est réservé aux abonnés Pass Pro.');
      return;
    }
    setMinRating(value);
  };

  // ─── Fetch function changes with tab + key + language ─────────────────────
  const fetchFn = useCallback(
    (page: number) => {
      const ratingFloor = isPro ? minRating : 0;
      if (activeTab === 'top_rated' && activeGenreIds.length === 0 && ratingFloor === 0) {
        return fetchTopRatedPage(page, 'movie', key, t.tmdbLang);
      }
      if (activeTab === 'search' && committedQuery) {
        return fetchSearchPage(committedQuery, page, key, t.tmdbLang);
      }
      if (activeTab === 'search') {
        // Onglet recherche sans requête — rien à charger.
        return Promise.resolve({ results: [] as Movie[], total_pages: 0 });
      }
      return fetchDiscoverPage(page, {
        mediaType: mediaTypeForTab,
        sortBy: activeTab === 'top_rated' ? 'vote_average.desc' : 'popularity.desc',
        genreIds: activeGenreIds,
        voteAverageGte: ratingFloor,
        // Un tri par note sans plancher de votes ramène des titres confidentiels :
        // le plancher garde la page « mieux notés » crédible.
        voteCountGte: activeTab === 'top_rated' ? 200 : undefined,
        apiKey: key,
        language: t.tmdbLang
      });
    },
    [activeTab, committedQuery, key, t.tmdbLang, mediaTypeForTab, activeGenreIds, isPro, minRating]
  );

  const { items, loading, hasMore, sentinelRef } = useInfiniteCatalog<Movie>(
    fetchFn,
    [activeTab, committedQuery, key, t.tmdbLang, selectedGenres.join(','), isPro ? minRating : 0] as const
  );

  // Filet de sécurité côté client : la note et le genre restent respectés même
  // quand la source ne sait pas les filtrer (recherche TMDB).
  const safeItems = Array.isArray(items) ? items : [];
  const ratingFloor = isPro ? minRating : 0;
  const filtered = safeItems.filter(movie => {
    if (!movie) return false;
    if (ratingFloor > 0 && (movie.vote_average || 0) < ratingFloor) return false;
    if (activeGenreIds.length) {
      const itemType: 'movie' | 'tv' = movie.media_type === 'SÉRIE' || movie.media_type === 'tv' ? 'tv' : 'movie';
      const itemGenres = (Array.isArray(movie.genres) ? movie.genres : [])
        .map(genre => Number(genre?.id))
        .filter(id => Number.isSafeInteger(id) && id > 0);
      const wanted = selectedGenres
        .map(genreKey => GENRES.find(genre => genre.key === genreKey))
        .filter((genre): genre is GenreOption => Boolean(genre))
        .map(genre => genreIdFor(genre, itemType))
        .filter((id): id is number => Number.isSafeInteger(id));
      if (wanted.length && !wanted.some(id => itemGenres.includes(id))) return false;
    }
    return true;
  });

  const handleSearch = () => {
    setActiveTab('search');
    setCommittedQuery(searchInput.trim());
  };

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header + Controls */}
      <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 space-y-6 shadow-sm transition-colors">
        <div>
          <div className="flex items-center gap-2 text-[#e50914] text-[11px] font-bold uppercase tracking-widest mb-2">
            <Film className="w-3.5 h-3.5 text-[#e50914]" />
            <span>Catalogue Éliciné</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
            Explorer les Œuvres
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 mt-1.5">
            Défilement infini — Films, Séries &amp; Recherche mondiale en temps réel.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap gap-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-black font-extrabold shadow-sm'
                  : 'bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:text-slate-950 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filtre genre — libre pour tous, combinable avec la note */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Genre
            </span>
            {selectedGenres.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedGenres([])}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-[#e50914] dark:hover:text-[#e50914] transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" /> Effacer ({selectedGenres.length})
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {GENRES.map(genre => {
              const available = mediaTypeForTab !== 'tv' || genre.tv != null;
              const selected = selectedGenres.includes(genre.key);
              return (
                <button
                  key={genre.key}
                  type="button"
                  disabled={!available}
                  aria-pressed={selected}
                  onClick={() => toggleGenre(genre)}
                  title={available ? `Filtrer : ${genre.label}` : 'Genre sans équivalent en série sur TMDB'}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                    selected
                      ? 'bg-[#e50914] border-[#e50914] text-white shadow-sm cursor-pointer'
                      : available
                        ? 'bg-slate-100 dark:bg-[#18181b] border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-white/20 cursor-pointer'
                        : 'bg-slate-50 dark:bg-[#141416] border-slate-200/60 dark:border-white/[0.06] text-slate-400 dark:text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  {genre.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search bar (always visible but active on search tab) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Rechercher par titre, genre, mot-clé..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 outline-none focus:border-slate-400 dark:focus:border-white focus:ring-1 focus:ring-slate-300 dark:focus:ring-white/20 transition-all"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-5 py-2 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" /> Chercher
            </button>
          </div>

          {/* Filtre de note — Pass Pro, se combine avec le genre choisi */}
          <div
            onClick={isPro ? undefined : () => handleRatingChange(0)}
            title={isPro ? 'Note minimale des œuvres affichées' : 'Filtre réservé aux abonnés Pass Pro'}
            className={`flex items-center gap-3 bg-slate-100 dark:bg-[#18181b] px-4 py-2 rounded-xl border transition-colors ${
              isPro
                ? 'border-slate-200 dark:border-white/10'
                : 'border-amber-500/30 dark:border-amber-500/25 cursor-pointer'
            }`}
          >
            <Star className="w-4 h-4 text-amber-500 dark:text-amber-400 fill-amber-500 dark:fill-amber-400 flex-shrink-0" />
            <span className="text-xs text-slate-700 dark:text-zinc-300 font-semibold whitespace-nowrap">
              Note : {ratingFloor > 0 ? `${ratingFloor}+ /10` : 'Toutes'}
            </span>
            {!isPro && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[9px] font-black uppercase flex-shrink-0">
                <Crown className="w-2.5 h-2.5" /> Pro
              </span>
            )}
            <input
              type="range"
              min="0" max="9" step="0.5"
              value={ratingFloor}
              disabled={!isPro}
              onChange={e => handleRatingChange(Number(e.target.value))}
              className={`w-full accent-[#e50914] ${isPro ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
            />
          </div>
        </div>

        {/* Rappel des filtres réellement combinés */}
        {(selectedGenres.length > 0 || ratingFloor > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-zinc-400">
            <span className="font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">Filtres actifs :</span>
            {selectedGenres.length > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-[#e50914]/10 border border-[#e50914]/25 text-[#e50914] font-semibold">
                {selectedGenres.map(key => GENRES.find(genre => genre.key === key)?.label).filter(Boolean).join(' ou ')}
              </span>
            )}
            {ratingFloor > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 font-semibold">
                Note {ratingFloor}+ /10 · Pro
              </span>
            )}
            <button
              type="button"
              onClick={() => { setSelectedGenres([]); if (isPro) setMinRating(0); }}
              className="underline underline-offset-2 hover:text-[#e50914] transition-colors cursor-pointer"
            >
              Tout réinitialiser
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {activeTab === 'search' && !committedQuery ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
          <Search className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium">Tapez votre recherche et appuyez sur Entrée ou cliquez Chercher.</p>
        </div>
      ) : (
        <MovieGrid
          title={[
            activeTab === 'popular'   ? '🔥 Films Populaires' :
            activeTab === 'top_rated' ? '⭐ Films les Mieux Notés' :
            activeTab === 'series'    ? '📺 Séries Populaires' :
            `🔍 Résultats pour "${committedQuery.trim().replace(/^["'«»]+|["'«»]+$/g, '')}"`,
            selectedGenres.length
              ? selectedGenres.map(key => GENRES.find(genre => genre.key === key)?.label).filter(Boolean).join(' ou ')
              : ''
          ].filter(Boolean).join(' · ')}
          subtitle={[
            `${filtered.length} titres chargés`,
            ratingFloor > 0 ? `note ${ratingFloor}+ /10 (Pro)` : '',
            hasMore ? 'défilez pour en voir plus' : 'fin du catalogue'
          ].filter(Boolean).join(' · ')}
          movies={filtered}
          showAiMatch={false}
          sentinelRef={sentinelRef}
          isLoadingMore={loading}
          hasMore={hasMore}
        />
      )}

    </div>
  );
};
