import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

export interface ForgotPasswordProps {
  onBackToLogin?: () => void;
  onSuccess?: () => void;
  className?: string;
}

export const ForgotPassword: React.FC<ForgotPasswordProps> = ({
  onBackToLogin,
  onSuccess,
  className = ''
}) => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Veuillez renseigner votre adresse e-mail.');
      setLoading(false);
      return;
    }

    try {
      // Supabase gère l'envoi sécurisé sans révéler si l'email existe ou non (bonne pratique de sécurité)
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/update-password`, // Page où l'utilisateur va définir son nouveau mot de passe
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setMessage('Si un compte est associé à cet e-mail, un lien de réinitialisation vous a été envoyé.');
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`max-w-md w-full mx-auto p-6 md:p-8 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-xl text-left animate-in fade-in zoom-in-95 ${className}`}>
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 dark:bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto mb-3">
          <Mail className="w-6 h-6 text-[#e50914]" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
          Mot de passe oublié
        </h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
          Saisissez votre e-mail pour recevoir un lien de réinitialisation sécurisé.
        </p>
      </div>

      {/* Success Notification */}
      {message && (
        <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 flex items-start gap-3 text-emerald-700 dark:text-emerald-300 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <p className="font-medium leading-relaxed">{message}</p>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="mb-5 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 flex items-start gap-3 text-red-700 dark:text-red-300 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="font-medium leading-relaxed">{error}</p>
        </div>
      )}

      {/* Formulaire */}
      {!message ? (
        <form onSubmit={handlePasswordReset} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-2">
              Adresse e-mail
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:border-[#e50914] focus:ring-1 focus:ring-[#e50914]/50 outline-none transition-all"
                placeholder="votre@email.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Envoi en cours...</span>
              </>
            ) : (
              <span>Envoyer le lien de réinitialisation</span>
            )}
          </button>
        </form>
      ) : (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => {
              setMessage('');
              setEmail('');
            }}
            className="text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
          >
            Renvoyer avec une autre adresse email
          </button>
        </div>
      )}

      {/* Back to Login link */}
      {onBackToLogin && (
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-zinc-800 text-center">
          <button
            type="button"
            onClick={onBackToLogin}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour à la connexion</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ForgotPassword;
