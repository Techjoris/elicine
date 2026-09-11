import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { authService } from '../../services/authService';
import { Lock, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Check, ArrowRight } from 'lucide-react';

export interface UpdatePasswordProps {
  onSuccess?: () => void;
  onGoHome?: () => void;
  className?: string;
}

export const UpdatePassword: React.FC<UpdatePasswordProps> = ({
  onSuccess,
  onGoHome,
  className = ''
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Supabase récupère automatiquement le token ou la session depuis l'URL au chargement de la page

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      setLoading(false);
      return;
    }

    const pwdCheck = authService.validatePassword(newPassword);
    if (!pwdCheck.valid) {
      setError(pwdCheck.error || 'Le mot de passe doit contenir au moins 6 caractères, une majuscule et un chiffre.');
      setLoading(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
      } else {
        setMessage('Votre mot de passe a été mis à jour avec succès ! Vous pouvez vous connecter.');
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, '/');
        }
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || 'Une erreur inattendue est survenue lors de la mise à jour.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`max-w-md w-full mx-auto p-6 md:p-8 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-xl text-left animate-in fade-in zoom-in-95 ${className}`}>
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 dark:bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mx-auto mb-3">
          <Lock className="w-6 h-6 text-cyan-500 dark:text-cyan-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
          Nouveau mot de passe
        </h2>
        <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
          Définissez un mot de passe sécurisé pour votre compte Éliciné.
        </p>
      </div>

      {/* Success Notification Card */}
      {message ? (
        <div className="space-y-5 text-center">
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <p className="font-semibold text-left leading-relaxed">{message}</p>
          </div>

          {onGoHome && (
            <button
              type="button"
              onClick={onGoHome}
              className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Accéder à l'accueil &amp; Se connecter</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={handleUpdate} className="space-y-4">
          {/* Error Notification */}
          {error && (
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-500/30 flex items-start gap-3 text-red-700 dark:text-red-300 text-xs animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{error}</p>
            </div>
          )}

          {/* New password input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-2">
              Entrez votre nouveau mot de passe
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 cursor-pointer transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm password input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-2">
              Confirmez votre mot de passe
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Password criteria pills */}
          <div className="flex flex-wrap gap-1.5 text-[10px] pt-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
              newPassword.length >= 6 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold' 
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
            }`}>
              {newPassword.length >= 6 ? <Check className="w-3 h-3" /> : '•'} 6 car. min.
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
              /[A-Z]/.test(newPassword) 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold' 
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
            }`}>
              {/[A-Z]/.test(newPassword) ? <Check className="w-3 h-3" /> : '•'} 1 majuscule
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
              /[0-9]/.test(newPassword) 
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold' 
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
            }`}>
              {/[0-9]/.test(newPassword) ? <Check className="w-3 h-3" /> : '•'} 1 chiffre
            </span>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Mise à jour...</span>
              </>
            ) : (
              <span>Mettre à jour le mot de passe</span>
            )}
          </button>
        </form>
      )}
    </div>
  );
};

export default UpdatePassword;
