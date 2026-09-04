import React from 'react';
import { useApp } from '../../context/AppContext';
import { Bell, Trash2, Calendar, Mail, CheckCircle2 } from 'lucide-react';

export const AlertsView: React.FC = () => {
  const { alerts, removeAlert, setActiveView } = useApp();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/20">
        <h1 className="text-3xl font-black text-white flex items-center gap-3">
          <Bell className="w-8 h-8 text-amber-400" />
          <span>Mes Alertes de Disponibilité ({alerts.length})</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Vous serez alerté dès que ces films seront ajoutés sur vos plateformes de streaming favorites.
        </p>
      </div>

      {alerts.length === 0 ? (
        <div className="text-center py-20 px-4 rounded-3xl bg-slate-900/40 border border-slate-800 space-y-3">
          <Bell className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-lg font-bold text-white">Aucune alerte active</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Activez la cloche sur une fiche film pour recevoir une alerte email dès sa sortie ou disponibilité en streaming.
          </p>
          <button
            onClick={() => setActiveView('home')}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold uppercase shadow-neon-gold"
          >
            Explorer les films
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 hover:border-amber-500/40 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                {alert.posterPath && (
                  <img
                    src={alert.posterPath}
                    alt={alert.movieTitle}
                    className="w-12 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white truncate">{alert.movieTitle}</h4>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3 text-amber-400" />
                    <span>Sortie : {alert.releaseDate}</span>
                  </p>
                  <p className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1 font-medium">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Notification : {alert.email}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => removeAlert(alert.id)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-red-950/60 hover:text-red-400 text-slate-400 border border-slate-700 transition-colors flex-shrink-0"
                title="Supprimer cette alerte"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
