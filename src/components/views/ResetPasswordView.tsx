import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { Lock, Loader2 } from 'lucide-react';

export const ResetPasswordView: React.FC = () => {
  const { setActiveView, showToast } = useApp();
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 6) {
      setErrorMessage("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (error) {
      setErrorMessage(error.message);
    } else {
      showToast("Votre mot de passe a été mis à jour avec succès !");
      setActiveView('home');
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, document.title, '/');
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[50vh] p-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 md:p-8 shadow-xl text-center animate-in fade-in zoom-in-95">
        <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-cyan-400" />
        </div>
        <h2 className="text-2xl font-black mb-2 text-slate-900 dark:text-white">
          Nouveau mot de passe
        </h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">
          Veuillez saisir votre nouveau mot de passe pour sécuriser votre compte.
        </p>

        {errorMessage && (
          <div className="mb-6 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-500/40 text-red-600 dark:text-red-300 text-xs text-left font-medium">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-2">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-sm focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 outline-none transition-all dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-4"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Mise à jour...</span>
              </>
            ) : (
              <span>Enregistrer le mot de passe</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
