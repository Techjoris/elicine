import React from 'react';
import { MovieGrid } from '../movies/MovieGrid';
import { useApp } from '../../context/AppContext';
import { Bookmark, Sparkles, Film } from 'lucide-react';

export const WatchlistView: React.FC = () => {
  const { watchlist, setActiveView } = useApp();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 shadow-sm transition-colors">
        <div className="flex items-center gap-2 text-[#e50914] text-[11px] font-bold uppercase tracking-widest mb-2">
          <Bookmark className="w-3.5 h-3.5 text-[#e50914]" />
          <span>Espace Personnel</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
          Ma Liste Personnelle ({watchlist.length})
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 mt-1.5">
          Vos films et séries enregistrés pour plus tard. Synchronisation automatique multi-appareils.
        </p>
      </div>

      {watchlist.length === 0 ? (
        <div className="text-center py-20 px-4 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 space-y-4 shadow-sm transition-colors">
          <Film className="w-12 h-12 text-slate-400 dark:text-zinc-600 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white uppercase tracking-tight">Votre liste est vide pour l'instant</h3>
          <p className="text-xs text-slate-600 dark:text-zinc-400 max-w-sm mx-auto">
            Ajoutez des œuvres depuis n'importe quelle fiche ou demandez une sélection sur-mesure à l'IA.
          </p>
          <button
            onClick={() => setActiveView('home')}
            className="px-6 py-3 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-md inline-block"
          >
            Découvrir des films
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
