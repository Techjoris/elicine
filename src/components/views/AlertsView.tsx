import React from 'react';
import { useApp } from '../../context/AppContext';
import { Bell, Trash2, Calendar, Mail, CheckCircle2, Crown, Sparkles, AlertCircle } from 'lucide-react';

export const AlertsView: React.FC = () => {
  const { alerts, removeAlert, setActiveView, user, setIsProModalOpen } = useApp();

  const isPro = Boolean(
    user && (
      user.isPro || 
      user.is_pro || 
      user.pass_status === 'pro' || 
      (user.email && ['ivanjoris959@gmail.com', 'techjoris@gmail.com', 'admin@elicine.app', 'joris@elicine.app'].includes(user.email.toLowerCase()))
    )
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-gradient-to-r dark:from-amber-950/40 dark:via-zinc-900 dark:to-zinc-900 border border-slate-200 dark:border-amber-500/20 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[11px] font-black uppercase tracking-wider flex items-center gap-1">
                <Crown className="w-3 h-3" />
                Exclusivité Pass Pro
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <Bell className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500 dark:text-amber-400" />
              <span>Suivi & Alertes de Sortie ({alerts.length})</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Notifications automatiques par e-mail à <strong>J-2</strong> (rappel anticipé) et le <strong>Jour J</strong> (disponibilité immédiate).
            </p>
          </div>

          {!isPro && (
            <button
              type="button"
              onClick={() => setIsProModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-zinc-950 text-xs font-black uppercase tracking-wider shadow-neon-gold transition-all cursor-pointer flex items-center gap-2 flex-shrink-0"
            >
              <Crown className="w-4 h-4" />
              <span>Débloquer le Pass Pro</span>
            </button>
          )}
        </div>

        {/* Pro Status Banner */}
        {!isPro ? (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-3 text-xs text-amber-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <p>
              Vous êtes actuellement sur un <strong>Compte Gratuit</strong>. Passez au Pass Pro pour recevoir vos alertes e-mails personnalisées dès la sortie de vos œuvres favorites.
            </p>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-3 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            <p>
              Votre <strong>Pass Pro est actif</strong> : vos alertes e-mails sont programmées et seront envoyées automatiquement sur <strong>{user?.email}</strong>.
            </p>
          </div>
        )}
      </div>

      {/* Content Grid or Empty State */}
      {alerts.length === 0 ? (
        <div className="text-center py-20 px-4 rounded-3xl bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-white/10 space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
            <Bell className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Aucune alerte de sortie active</h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            Activez la cloche sur n'importe quelle fiche de film ou série à venir pour programmer vos e-mails de rappel à J-2 et le jour J.
          </p>
          <button
            onClick={() => setActiveView('home')}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold uppercase shadow-sm dark:shadow-neon-gold cursor-pointer transition-all"
          >
            Explorer le catalogue
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {alerts.map((alert) => {
            const releaseDateObj = alert.releaseDate ? new Date(alert.releaseDate) : null;
            const isReleased = releaseDateObj ? releaseDateObj.getTime() <= Date.now() : false;
            const formattedDate = releaseDateObj && !isNaN(releaseDateObj.getTime())
              ? releaseDateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
              : alert.releaseDate || 'Prochainement';

            return (
              <div
                key={alert.id}
                className="p-4 rounded-2xl bg-white dark:bg-zinc-950/80 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3 hover:border-amber-500/40 transition-all shadow-sm group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {alert.posterPath ? (
                    <img
                      src={
                        alert.posterPath.startsWith('http')
                          ? alert.posterPath
                          : `https://image.tmdb.org/t/p/w200${alert.posterPath.startsWith('/') ? '' : '/'}${alert.posterPath}`
                      }
                      alt={alert.movieTitle}
                      className="w-13 h-18 object-cover rounded-xl flex-shrink-0 shadow-md ring-1 ring-white/10"
                    />
                  ) : (
                    <div className="w-13 h-18 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center flex-shrink-0 text-zinc-500">
                      <Sparkles className="w-5 h-5" />
                    </div>
                  )}

                  <div className="min-w-0 space-y-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {alert.movieTitle}
                    </h4>

                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      <span className="truncate">Sortie : {formattedDate}</span>
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      {isReleased ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
                          ● Sorti en salle / streaming
                        </span>
                      ) : alert.notified_j_minus_2 ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1">
                          ● Rappel J-2 envoyé
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-bold flex items-center gap-1">
                          ● Alerte J-2 & Jour J active
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeAlert(alert.id)}
                  className="p-2.5 rounded-xl bg-zinc-900 hover:bg-red-950/60 hover:text-red-400 text-zinc-400 border border-zinc-800 hover:border-red-500/30 transition-colors flex-shrink-0 cursor-pointer"
                  title="Désactiver cette alerte de sortie"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
