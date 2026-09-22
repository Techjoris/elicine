import React, { useEffect, useState } from 'react';
import { Bell, BellRing, CalendarDays, Clapperboard, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { fetchUpcoming, releaseCountdown, UpcomingMovie } from '../../services/upcomingService';

export const UpcomingView: React.FC = () => {
  const { apiSettings, setSelectedMovie, toggleAlert, isMovieAlertActive, setActiveView } = useApp();
  const [filter, setFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [items, setItems] = useState<UpcomingMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    fetchUpcoming(apiSettings.tmdbApiKey).then(data => { if (!cancelled) setItems(data); })
      .catch(() => { if (!cancelled) setError('Impossible de charger les prochaines sorties. Réessayez dans un instant.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiSettings.tmdbApiKey, attempt]);
  const visible = items.filter(item => filter === 'all' || item.media_type === filter);
  return <div className="space-y-6 animate-fade-in">
    <header className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 space-y-3">
      <div className="flex items-center gap-2 text-[#e50914] text-xs font-bold uppercase tracking-widest"><Clapperboard className="w-4 h-4" /> À l’affiche demain</div>
      <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">Prochainement</h1>
      <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-2xl">Les films et nouvelles séries les plus attendus des six prochains mois. Les sorties les plus proches d’abord, puis les titres les plus populaires.</p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <span className="rounded-full px-3 py-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-semibold">Alertes J-2 et jour J · Eliciné Pro</span>
        <button onClick={() => setActiveView('alerts')} className="text-xs font-semibold text-slate-700 dark:text-zinc-300 underline underline-offset-4">Gérer mes alertes</button>
      </div>
    </header>
    <div role="tablist" aria-label="Type de sortie" className="inline-flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900">
      {([['all', 'Tous'], ['movie', 'Films'], ['tv', 'Séries']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} aria-controls="upcoming-results" onClick={() => setFilter(value)} className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${filter === value ? 'bg-[#e50914] text-white shadow-sm' : 'text-slate-600 dark:text-zinc-400 hover:bg-white/10'}`}>{label}</button>)}
    </div>
    <p className="text-xs text-slate-500 dark:text-zinc-400">Source : TMDB · Date de sortie initiale des films et première diffusion des séries. Les dates peuvent évoluer et varier selon le pays.</p>
    <div id="upcoming-results" role="tabpanel" aria-busy={loading}>
      {loading ? <div role="status" className="py-20 flex justify-center gap-3 text-slate-500"><Loader2 className="animate-spin w-5 h-5" /> Chargement des prochaines sorties…</div>
        : error ? <div role="alert" className="text-center py-14 space-y-4"><p>{error}</p><button onClick={() => setAttempt(v => v + 1)} className="rounded-xl px-5 py-3 bg-[#e50914] text-white">Réessayer</button></div>
        : !visible.length ? <p className="py-20 text-center text-slate-500">Aucune sortie annoncée pour cette sélection.</p>
        : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-5">
          {visible.map(movie => {
            const key = `${movie.media_type}:${movie.id}`;
            const active = isMovieAlertActive(movie.id, movie.media_type);
            const days = releaseCountdown(movie.release_date);
            return <article key={key} className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141414] flex flex-col">
              <button onClick={() => setSelectedMovie(movie)} aria-label={`Ouvrir la fiche de ${movie.title}`} className="relative aspect-[2/3] w-full overflow-hidden group">
                <img src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`} alt={movie.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <span className="absolute top-2 left-2 rounded-md bg-black/75 px-2 py-1 text-[10px] font-bold text-white">{movie.media_type === 'tv' ? 'SÉRIE' : 'FILM'}</span>
                {days > 0 && days <= 30 && <span className="absolute bottom-2 right-2 rounded-lg bg-[#e50914] px-2.5 py-1 text-xs font-bold text-white">{days === 1 ? 'Demain' : `Dans ${days} jours`}</span>}
              </button>
              <div className="p-3 flex flex-col gap-2 flex-1">
                <button onClick={() => setSelectedMovie(movie)} className="font-bold text-sm text-slate-900 dark:text-white text-left line-clamp-2">{movie.title}</button>
                <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-300"><CalendarDays className="w-3.5 h-3.5 shrink-0 text-[#e50914]" /><time dateTime={movie.release_date}>{new Date(movie.release_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</time></p>
                <button disabled={pending === key} aria-pressed={active} onClick={async () => { setPending(key); try { await toggleAlert(movie); } finally { setPending(null); } }} className={`mt-auto w-full min-h-10 rounded-xl px-2 py-2 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 ${active ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-zinc-700'}`}>
                  {pending === key ? <Loader2 className="w-4 h-4 animate-spin" /> : active ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}{active ? 'Annuler l’alerte' : 'M’alerter'}
                </button>
              </div>
            </article>;
          })}
        </div>}
    </div>
  </div>;
};
