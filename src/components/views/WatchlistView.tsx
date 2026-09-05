import React from 'react';
import { MovieGrid } from '../movies/MovieGrid';
import { useApp } from '../../context/AppContext';
import { Bookmark, Sparkles, Film } from 'lucide-react';

export const WatchlistView: React.FC = () => {
  const { watchlist, setActiveView } = useApp();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="p-6 rounded-3xl bg-white dark:bg-gradient-to-r dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 border border-slate-200 dark:border-emerald-500/20 shadow-sm">
        <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <Bookmark className="w-8 h-8 text-emerald-500 dark:text-emerald-400" />
          <span>Ma Liste Personnelle ({watchlist.length})</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
          Vos films enregistrés pour plus tard. Synchronisés automatiquement dans votre espace de stockage.
        </p>
      </div>

      {watchlist.length === 0 ? (
        <div className="text-center py-20 px-4 rounded-3xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
          <Film className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Votre liste est vide pour l'instant</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            Cliquez sur "+ Ma Liste" sur n'importe quel film ou utilisez notre IA pour trouver vos prochains coups de cœur.
          </p>
          <button
            onClick={() => setActiveView('home')}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-neon-blue uppercase"
          >
            Découvrir des films avec l'IA
          </button>
        </div>
      ) : (
        <MovieGrid
          title="Mes Films Sauvegardés"
          movies={watchlist}
          showAiMatch={false}
        />
      )}
    </div>
  );
};
