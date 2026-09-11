import React, { useState } from 'react';
import { 
  X, 
  User, 
  Mail, 
  Lock, 
  Crown, 
  LogOut, 
  Share2, 
  Heart, 
  Eye, 
  EyeOff, 
  AlertCircle,
  Loader2,
  ArrowRight,
  Smartphone,
  History,
  Info,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { authService } from '../../services/authService';
import { handleMonerooPayment } from '../../services/payment';

export const AuthModal: React.FC = () => {
  const { 
    isAuthModalOpen, 
    setIsAuthModalOpen, 
    user, 
    loginWithGoogle,
    loginWithCredentials,
    registerWithCredentials,
    logout, 
    setIsProModalOpen, 
    setActiveView,
    watchlist,
    showToast 
  } = useApp();

  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotSuccessMessage, setForgotSuccessMessage] = useState<string | null>(null);
  const [showBenefitsPopover, setShowBenefitsPopover] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleSwitchMode = (signup: boolean) => {
    setIsSignUp(signup);
    setIsForgotPassword(false);
    setForgotSuccessMessage(null);
    setShowBenefitsPopover(false);
    setErrorMessage(null);
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : ''
        }
      });
      if (error) {
        console.error('[Google OAuth error]', error);
        setErrorMessage(error.message || 'Erreur lors de la connexion Google.');
      }
    } catch (err: any) {
      console.error('[Google OAuth exception]', err);
      setErrorMessage(err?.message || 'Une erreur est survenue lors de la connexion avec Google.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const isValidEmail = (val: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(val.trim());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage("Veuillez saisir votre adresse email.");
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      setErrorMessage("Format d'adresse email invalide (ex: utilisateur@domaine.com).");
      return;
    }

    // Règle de mot de passe sécurisé : au moins 6 caractères, 1 majuscule et 1 chiffre
    const pwdCheck = authService.validatePassword(password);
    if (!pwdCheck.valid) {
      setErrorMessage(pwdCheck.error || "Le mot de passe doit contenir au moins 6 caractères, une majuscule et un chiffre.");
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        // 1. Notification immédiate à l'utilisateur de l'envoi de l'e-mail de confirmation
        showToast(`✉️ Un e-mail de confirmation vous a été envoyé à ${cleanEmail}. Vérifiez votre boîte de réception !`, 7000);

        // 2. Déclenchement / simulation instantané de l'envoi de l'e-mail en arrière-plan
        void authService.sendVerificationEmail(cleanEmail, username.trim());

        // 3. Enregistrement sécurisé du compte
        const res = await registerWithCredentials(username.trim(), cleanEmail, password);
        if (!res.success) {
          setErrorMessage(res.error || "Erreur lors de la création du compte.");
          return;
        }

        setIsAuthModalOpen(false);
        setPassword('');
        setUsername('');
        setEmail('');
      } else {
        const res = await loginWithCredentials(cleanEmail, password);
        if (!res.success) {
          setErrorMessage(res.error || "Identifiants invalides. Veuillez vérifier votre adresse email et mot de passe.");
          return;
        }

        setIsAuthModalOpen(false);
        setPassword('');
        setEmail('');
      }
    } catch (err: any) {
      const msg = err?.message || "Une erreur inattendue est survenue lors de l'authentification.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setForgotSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage("Veuillez saisir votre adresse email.");
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      setErrorMessage("Format d'adresse email invalide (ex: utilisateur@domaine.com).");
      return;
    }

    setIsLoading(true);
    try {
      // Supabase gère l'envoi sécurisé sans révéler si l'email existe ou non (bonne pratique de sécurité)
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/update-password`,
      });

      if (error) {
        setErrorMessage(error.message);
      } else {
        setForgotSuccessMessage("Si un compte est associé à cet e-mail, un lien de réinitialisation vous a été envoyé.");
        showToast("Lien de réinitialisation envoyé.");
      }
    } catch (err: any) {
      const msg = err?.message || "Une erreur inattendue est survenue.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const copyReferral = () => {
    if (!user) return;
    const url = `${window.location.origin}?ref=${user.referralCode}`;
    navigator.clipboard.writeText(url);
    showToast('Lien de parrainage copié !');
  };

  const userInitials = user?.name
    ? user.name.slice(0, 2).toUpperCase()
    : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'ÉC');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/70 dark:bg-black/90 animate-fade-in overflow-y-auto">
      
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-[#121212] border border-slate-200 dark:border-zinc-800 overflow-hidden text-slate-800 dark:text-zinc-100 p-5 sm:p-7 space-y-4 my-auto shadow-2xl transition-colors">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setShowBenefitsPopover(false);
            setIsAuthModalOpen(false);
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer z-10"
          title="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* LOGGED IN VIEW */}
        {user ? (
          <div className="space-y-4 pt-1">
            <div className="text-center space-y-2">
              {user.avatar ? (
                <img 
                  src={user.avatar} 
                  alt={user.name} 
                  className="w-16 h-16 rounded-2xl object-cover mx-auto border border-slate-200 dark:border-zinc-700" 
                />
              ) : (
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black mx-auto ${
                  user.isPro
                    ? 'bg-amber-500/10 text-amber-600 dark:bg-[#1e1704] dark:text-amber-300 border border-amber-500/50'
                    : 'bg-slate-100 text-slate-900 dark:bg-[#1e1e1e] dark:text-white border border-slate-200 dark:border-zinc-700'
                }`}>
                  {userInitials}
                </div>
              )}

              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center justify-center gap-2">
                  <span>{user.name}</span>
                  {user.provider === 'google' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700" title="Connecté avec Google">
                      Google
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-300 font-medium">{user.email}</p>
              </div>

              <div className="pt-0.5 flex justify-center">
                {user.isPro ? (
                  <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                    Membre Pass Pro VIP
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#181818] text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 text-xs font-semibold">
                    Compte Gratuit (3 recherches IA / jour)
                  </span>
                )}
              </div>
            </div>

            {/* Quick Access to Ma Liste */}
            <button
              type="button"
              onClick={() => {
                setIsAuthModalOpen(false);
                setActiveView('watchlist');
              }}
              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-[#181818] hover:bg-slate-100 dark:hover:bg-[#202020] border border-slate-200 dark:border-zinc-800 flex items-center justify-between transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-[#e50914]">
                  <Heart className="w-4 h-4 fill-current" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-900 group-hover:text-slate-950 dark:text-white dark:group-hover:text-zinc-100 transition-colors">
                    Ma Liste Personnelle
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-300 font-medium">
                    {watchlist.length} film{watchlist.length > 1 ? 's' : ''} synchronisé{watchlist.length > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:text-zinc-400 dark:group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Referral Info */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-zinc-800 space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-300">
                Votre Code de Parrainage
              </span>
              <div className="flex items-center justify-between bg-slate-100 dark:bg-black/80 p-2.5 rounded-lg border border-slate-200 dark:border-zinc-800">
                <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">{user.referralCode}</span>
                <button
                  type="button"
                  onClick={copyReferral}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-900 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-white text-xs font-semibold rounded-lg flex items-center gap-1 border border-slate-300 dark:border-zinc-700 transition-colors cursor-pointer"
                >
                  <Share2 className="w-3 h-3" />
                  <span>Copier</span>
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              {!user.isPro && (
                <button
                  type="button"
                  onClick={() => {
                    setIsAuthModalOpen(false);
                    setIsProModalOpen(true);
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                >
                  <Crown className="w-4 h-4" />
                  <span>Passer au Pass Pro VIP</span>
                </button>
              )}

              {user.provider !== 'google' && (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-white dark:hover:bg-zinc-100 text-zinc-900 font-bold text-xs flex items-center justify-center gap-2.5 transition-colors cursor-pointer border border-slate-300 dark:border-zinc-300 select-none disabled:opacity-60"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Continuer avec Google</span>
                </button>
              )}

              <button
                type="button"
                onClick={logout}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 hover:text-slate-900 dark:text-zinc-200 dark:hover:text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-slate-500 dark:text-zinc-300" />
                <span>Se déconnecter</span>
              </button>
            </div>
          </div>
        ) : isForgotPassword ? (
          /* FORGOT PASSWORD VIEW */
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                Mot de passe oublié ?
              </h2>
              <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                Saisissez votre adresse email pour recevoir un lien de réinitialisation sécurisé via Supabase.
              </p>
            </div>

            {/* Success Banner */}
            {forgotSuccessMessage && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="font-medium leading-relaxed">{forgotSuccessMessage}</p>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-[#220a0d] border border-red-300 dark:border-red-700 text-red-700 dark:text-red-200 text-xs flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {!forgotSuccessMessage ? (
              <form onSubmit={handleForgotPassword} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200 mb-1.5">
                    Adresse Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 dark:text-zinc-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="vous@exemple.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-400 outline-none focus:border-slate-400 dark:focus:border-zinc-300 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Envoi en cours...</span>
                    </>
                  ) : (
                    <span>Envoyer l'e-mail de réinitialisation</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setErrorMessage(null);
                    setForgotSuccessMessage(null);
                  }}
                  className="w-full py-2 text-xs text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white font-medium transition-colors cursor-pointer text-center block"
                >
                  ← Retour à la connexion
                </button>
              </form>
            ) : (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setForgotSuccessMessage(null);
                    setErrorMessage(null);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-black font-bold text-xs uppercase tracking-wider hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer text-center block"
                >
                  Retour à la connexion
                </button>
              </div>
            )}
          </div>
        ) : (
          /* NOT LOGGED IN: STREAMLINED MINIMALIST AUTHENTICATION */
          <div className="space-y-4">

            {/* CONTEXTUAL BENEFITS MODAL/POPOVER */}
            {showBenefitsPopover && (
              <div className="absolute inset-0 z-30 bg-white dark:bg-[#121212] p-5 sm:p-7 rounded-2xl flex flex-col justify-between animate-fade-in border border-slate-200 dark:border-zinc-800">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs sm:text-sm uppercase tracking-wider">
                      <CheckCircle2 className="w-4 h-4 text-[#e50914]" />
                      <span>Pourquoi créer un compte gratuit ?</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBenefitsPopover(false)}
                      className="p-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white border border-slate-200 dark:border-zinc-700 transition-colors cursor-pointer"
                      title="Fermer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2.5 py-4 text-xs">
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-zinc-800">
                      <Smartphone className="w-4 h-4 text-[#e50914] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-xs">Synchronisation multi-écrans</p>
                        <p className="text-slate-600 dark:text-zinc-300 text-xs mt-0.5 leading-relaxed">
                          Retrouvez vos sélections instantanément sur smartphone, tablette et PC.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-zinc-800">
                      <Heart className="w-4 h-4 text-[#e50914] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-xs">Ma Liste permanente</p>
                        <p className="text-slate-600 dark:text-zinc-300 text-xs mt-0.5 leading-relaxed">
                          Sauvegardez vos films et séries favoris à regarder plus tard sans limite.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-zinc-800">
                      <History className="w-4 h-4 text-[#e50914] flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white text-xs">Historique &amp; Recommandations</p>
                        <p className="text-slate-600 dark:text-zinc-300 text-xs mt-0.5 leading-relaxed">
                          Conservez vos découvertes et vos requêtes cinématographiques personnalisées.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-300">
                      <Crown className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1 text-left">
                        <span className="font-bold text-slate-900 dark:text-white block">Avantages exclusifs Pass Pro :</span>
                        <ul className="space-y-1 text-[11px] text-slate-600 dark:text-zinc-300">
                          <li className="flex items-start gap-1.5">
                            <span className="text-amber-500 font-bold">•</span>
                            <span><strong>Quotas illimités</strong> de requêtes IA</span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <span className="text-sky-500 font-bold">•</span>
                            <span><strong>Filtres avancés</strong> (post-recherche par plateformes ou notes)</span>
                          </li>
                          <li className="flex items-start gap-1.5">
                            <span className="text-emerald-500 font-bold">•</span>
                            <span><strong>Activation des alertes personnalisées</strong> pour les films et séries</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowBenefitsPopover(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-black font-bold text-xs uppercase tracking-wider hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            )}

            {/* Header Title */}
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                {isSignUp ? 'Créer un Compte' : 'Connexion'}
              </h2>
              <p className="text-xs text-slate-600 dark:text-zinc-300 font-medium">
                {isSignUp 
                  ? 'Rejoignez Éliciné et synchronisez vos favoris.' 
                  : 'Accédez à votre espace cinéma personnalisé.'}
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => setShowBenefitsPopover(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer group pt-0.5"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-[#e50914] group-hover:scale-110 transition-transform" />
                  <span className="underline underline-offset-2">Pourquoi créer un compte ?</span>
                </button>
              </div>
            </div>

            {/* PRIMARY ACTION: Continuer avec Google */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isLoading}
                className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-50 text-zinc-900 font-bold text-xs flex items-center justify-center gap-3 transition-colors cursor-pointer border border-slate-300 dark:border-zinc-300 disabled:opacity-60 select-none shadow-sm"
              >
                {isGoogleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-700" />
                    <span>Connexion Google en cours...</span>
                  </>
                ) : (
                  <>
                    {/* Official Google 4-Color SVG Icon */}
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    <span>Continuer avec Google</span>
                  </>
                )}
              </button>

              {/* Mentions légales CGU sous le bouton Google */}
              <p className="text-xs text-slate-500 dark:text-zinc-300 text-center leading-normal">
                En continuant, vous confirmez votre accord avec nos{' '}
                <a 
                  href="/terms" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-slate-900 dark:text-white hover:underline underline-offset-2 font-medium"
                >
                  Conditions Générales d'Utilisation
                </a>
                .
              </p>
            </div>

            {/* Divider: "ou par identifiant" */}
            <div className="relative flex items-center justify-center py-1">
              <div className="border-t border-slate-200 dark:border-zinc-800 w-full" />
              <span className="bg-white dark:bg-[#121212] px-3 text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider whitespace-nowrap">
                ou par identifiant
              </span>
              <div className="border-t border-slate-200 dark:border-zinc-800 w-full" />
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-[#220a0d] border border-red-300 dark:border-red-700 text-red-700 dark:text-red-200 text-xs flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" />
                <span className="font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {isSignUp && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200 mb-1.5">
                    Nom d'utilisateur ou pseudo
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 dark:text-zinc-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      placeholder="Ex: SarahCine"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-400 outline-none focus:border-slate-400 dark:focus:border-zinc-300 transition-colors"
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200 mb-1.5">
                  Adresse Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 dark:text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="vous@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-400 outline-none focus:border-slate-400 dark:focus:border-zinc-300 transition-colors"
                  />
                </div>
              </div>

              {/* Mot de passe avec toggle de visibilité */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200">
                    Mot de passe
                  </label>
                  {isSignUp ? (
                    <span className="text-[11px] text-slate-500 dark:text-zinc-300 font-medium">
                      Min. 6 caractères, 1 majuscule, 1 chiffre
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setErrorMessage(null);
                      }}
                      className="text-xs text-slate-500 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white font-medium transition-colors cursor-pointer"
                      tabIndex={-1}
                    >
                      Mot de passe oublié ?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 dark:text-zinc-400 absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    maxLength={60}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-100 dark:bg-[#181818] border border-slate-200 dark:border-zinc-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-400 outline-none focus:border-slate-400 dark:focus:border-zinc-300 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Critères visuels interactifs de sécurité en mode inscription */}
                {isSignUp && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
                      password.length >= 6 
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold' 
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
                    }`}>
                      {password.length >= 6 ? '✓' : '•'} 6 car. min.
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
                      /[A-Z]/.test(password) 
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold' 
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
                    }`}>
                      {/[A-Z]/.test(password) ? '✓' : '•'} 1 majuscule
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
                      /[0-9]/.test(password) 
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold' 
                        : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
                    }`}>
                      {/[0-9]/.test(password) ? '✓' : '•'} 1 chiffre
                    </span>
                  </div>
                )}
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isLoading || isGoogleLoading}
                className="w-full py-3 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Chargement...</span>
                  </>
                ) : (
                  <span>{isSignUp ? 'Créer mon compte gratuitement' : 'Se connecter'}</span>
                )}
              </button>
            </form>

            {/* Bottom Quick Switch */}
            <div className="text-center pt-2 border-t border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => handleSwitchMode(!isSignUp)}
                className="text-xs text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                {isSignUp ? (
                  <span>Déjà inscrit ? <strong className="text-slate-900 dark:text-white underline underline-offset-2 ml-1">Se connecter</strong></span>
                ) : (
                  <span>Nouveau sur Éliciné ? <strong className="text-slate-900 dark:text-white underline underline-offset-2 ml-1">Créer un compte gratuit</strong></span>
                )}
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};

export default AuthModal;
