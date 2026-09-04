import React, { useState, useCallback } from 'react';
import { MovieGrid } from '../movies/MovieGrid';
import { useApp } from '../../context/AppContext';
import { fetchDiscoverPage, fetchSearchPage, fetchTopRatedPage, FALLBACK_MOVIES } from '../../services/tmdb';
import { useInfiniteCatalog } from '../../hooks/useInfiniteCatalog';
import { Movie } from '../../types';
import { Film, Search, Star, Sparkles, Flame, Tv } from 'lucide-react';

type CatalogTab = 'popular' | 'top_rated' | 'series' | 'search';

const TABS: { id: CatalogTab; label: string; icon: any }[] = [
  { id: 'popular',   label: '🔥 Populaires',   icon: Flame },
  { id: 'top_rated', label: '⭐ Mieux Notés',   icon: Star  },
  { id: 'series',    label: '📺 Séries',        icon: Tv    },
  { id: 'search',    label: '🔍 Recherche',     icon: Search }
];

export const CatalogView: React.FC = () => {
  const { apiSettings } = useApp();
  const key = apiSettings.tmdbApiKey;

  const [activeTab, setActiveTab] = useState<CatalogTab>('popular');
  const [searchInput, setSearchInput] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [minRating, setMinRating] = useState(0);

  // ─── Fetch function changes with tab + key ──────────────────────────────
  const fetchFn = useCallback(
    (page: number) => {
      if (activeTab === 'popular') {
        return fetchDiscoverPage(page, { mediaType: 'movie', sortBy: 'popularity.desc', apiKey: key });
      }
      if (activeTab === 'top_rated') {
        return fetchTopRatedPage(page, 'movie', key);
      }
      if (activeTab === 'series') {
        return fetchDiscoverPage(page, { mediaType: 'tv', sortBy: 'popularity.desc', apiKey: key });
      }
      if (activeTab === 'search' && committedQuery) {
        return fetchSearchPage(committedQuery, page, key);
      }
      // Search tab without query — return empty immediately
      return Promise.resolve({ results: [] as Movie[], total_pages: 0 });
    },
    [activeTab, committedQuery, key]
  );

  const { items, loading, hasMore, sentinelRef } = useInfiniteCatalog<Movie>(
    fetchFn,
    [activeTab, committedQuery, key] as const
  );

  // Client-side rating filter (applied on top of server results)
  const filtered = minRating > 0
    ? items.filter(m => m.vote_average >= minRating)
    : items;

  const handleSearch = () => {
    setActiveTab('search');
    setCommittedQuery(searchInput.trim());
  };

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header + Controls */}
      <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-5">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <Film className="w-8 h-8 text-blue-400" />
            <span>Catalogue Complet CinéIA</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Défilement infini — Films, Séries &amp; Recherche en temps réel via TMDB.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap gap-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 border-blue-500 text-white shadow-neon-blue'
                  : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search bar (always visible but active on search tab) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Rechercher par titre, genre, mot-clé..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" /> Chercher
            </button>
          </div>

          {/* Rating filter */}
          <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-700">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0" />
            <span className="text-xs text-slate-300 font-semibold whitespace-nowrap">
              Note min : {minRating > 0 ? `${minRating}/10` : 'Toutes'}
            </span>
            <input
              type="range"
              min="0" max="9" step="0.5"
              value={minRating}
              onChange={e => setMinRating(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {activeTab === 'search' && !committedQuery ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-2">
          <Search className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium">Tapez votre recherche et appuyez sur Entrée ou cliquez Chercher.</p>
        </div>
      ) : (
        <MovieGrid
          title={
            activeTab === 'popular'   ? '🔥 Films Populaires' :
            activeTab === 'top_rated' ? '⭐ Films les Mieux Notés' :
            activeTab === 'series'    ? '📺 Séries Populaires' :
            `🔍 Résultats pour "${committedQuery}"`
          }
          subtitle={`${filtered.length} titres chargés${hasMore ? ' — défilez pour en voir plus' : ' — fin du catalogue'}`}
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
