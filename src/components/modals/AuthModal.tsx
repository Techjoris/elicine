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
  CheckCircle2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { handleMonerooPayment } from '../../services/payment';

export const AuthModal: React.FC = () => {
  const { 
    isAuthModalOpen, 
    setIsAuthModalOpen, 
    user, 
    loginWithGoogle,
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

  if (!isAuthModalOpen) return null;

  const handleSwitchMode = (signup: boolean) => {
    setIsSignUp(signup);
    setIsForgotPassword(false);
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

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      const msg = "Veuillez saisir votre adresse email.";
      alert(msg);
      setErrorMessage(msg);
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      const msg = "Format d'adresse email invalide (ex: utilisateur@domaine.com).";
      alert(msg);
      setErrorMessage(msg);
      return;
    }

    // Password validation rule: min 4, max 60 chars
    if (!password || password.length < 4) {
      const msg = 'Le mot de passe doit contenir au moins 4 caractères.';
      alert(msg);
      setErrorMessage(msg);
      return;
    }
    if (password.length > 60) {
      const msg = 'Le mot de passe ne doit pas dépasser 60 caractères.';
      alert(msg);
      setErrorMessage(msg);
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: {
              full_name: username.trim()
            }
          }
        });

        if (error) {
          alert("Erreur d'inscription : " + error.message);
          setErrorMessage(error.message);
          return;
        }

        if (data?.user) {
          if (data.user.identities && data.user.identities.length === 0) {
            alert("Cette adresse email est déjà utilisée.");
            setErrorMessage("Cette adresse email est déjà utilisée.");
            return;
          }
          setIsAuthModalOpen(false);
          showToast(`🎉 Bienvenue sur Éliciné, ${username.trim() || cleanEmail} !`);
          setPassword('');
          setUsername('');
          setEmail('');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: password,
        });

        if (error) {
          alert("Erreur de connexion : " + error.message);
          setErrorMessage("Erreur de connexion : " + error.message);
          return; // Bloque net l'accès en cas d'échec ou de mauvais mot de passe
        }

        if (!data?.user) {
          alert("Erreur de connexion : Session introuvable.");
          setErrorMessage("Erreur de connexion : Session introuvable.");
          return;
        }

        // Si pas d'erreur et utilisateur valide, la connexion est confirmée par le serveur Supabase
        setIsAuthModalOpen(false);
        showToast(`👋 Bon retour sur Éliciné, ${data.user.user_metadata?.full_name || data.user.email || 'Bienvenue'} !`);
        setPassword('');
        setEmail('');
      }
    } catch (err: any) {
      const msg = err?.message || "Une erreur inattendue est survenue.";
      alert("Erreur de connexion : " + msg);
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      const msg = "Veuillez saisir votre adresse email.";
      alert(msg);
      setErrorMessage(msg);
      return;
    }

    if (!isValidEmail(cleanEmail)) {
      const msg = "Format d'adresse email invalide (ex: utilisateur@domaine.com).";
      alert(msg);
      setErrorMessage(msg);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        alert("Erreur : " + error.message);
        setErrorMessage("Erreur : " + error.message);
      } else {
        alert("Un e-mail de réinitialisation sécurisé vous a été envoyé.");
        showToast("Un e-mail de réinitialisation sécurisé vous a été envoyé.");
        setIsForgotPassword(false);
      }
    } catch (err: any) {
      const msg = err?.message || "Une erreur inattendue est survenue.";
      alert("Erreur : " + msg);
      setErrorMessage("Erreur : " + msg);
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-fade-in overflow-y-auto">
      
      <div className="relative w-full max-w-lg rounded-2xl bg-[#0e0e0e] border border-white/10 shadow-2xl overflow-hidden text-zinc-100 p-5 sm:p-7 space-y-4 my-auto">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setIsAuthModalOpen(false);
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/10 transition-all cursor-pointer z-10"
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
                  className="w-16 h-16 rounded-2xl object-cover mx-auto shadow-lg ring-1 ring-white/20" 
                />
              ) : (
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black mx-auto shadow-lg ${
                  user.isPro
                    ? 'bg-[#1a1500] text-amber-300 border border-amber-500/40 shadow-amber-500/10'
                    : 'bg-[#18181b] text-white border border-white/10'
                }`}>
                  {userInitials}
                </div>
              )}

              <div>
                <h2 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2">
                  <span>{user.name}</span>
                  {user.provider === 'google' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/10" title="Connecté avec Google">
                      Google
                    </span>
                  )}
                </h2>
                <p className="text-xs text-zinc-400">{user.email}</p>
              </div>

              <div className="pt-0.5 flex justify-center">
                {user.isPro ? (
                  <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                    Membre Pass Pro VIP
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-[#161616] text-zinc-300 border border-white/10 text-xs font-semibold">
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
              className="w-full p-3 rounded-xl bg-[#141414] hover:bg-[#1c1c1c] border border-white/10 flex items-center justify-between transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#e50914]/10 border border-[#e50914]/20 flex items-center justify-center text-[#e50914]">
                  <Heart className="w-4 h-4 fill-[#e50914]/20" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-white group-hover:text-zinc-200 transition-colors">
                    Ma Liste Personnelle
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    {watchlist.length} film{watchlist.length > 1 ? 's' : ''} synchronisé{watchlist.length > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Referral Info */}
            <div className="p-3.5 rounded-xl bg-[#141414] border border-white/10 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Votre Code de Parrainage
              </span>
              <div className="flex items-center justify-between bg-black/60 p-2.5 rounded-lg border border-white/10">
                <span className="font-mono text-sm font-bold text-zinc-200">{user.referralCode}</span>
                <button
                  type="button"
                  onClick={copyReferral}
                  className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
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
                  onClick={async () => {
                    const name = user.name || (user as any).user_metadata?.full_name || 'Cinéphile';
                    await handleMonerooPayment(user.email, name);
                  }}
                  className="w-full py-3 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
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
                  className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-md select-none disabled:opacity-60"
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
                className="w-full py-2.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-zinc-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-zinc-400" />
                <span>Se déconnecter</span>
              </button>
            </div>
          </div>
        ) : isForgotPassword ? (
          /* FORGOT PASSWORD VIEW */
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
                Mot de passe oublié ?
              </h2>
              <p className="text-xs text-zinc-400">
                Saisissez votre adresse email pour recevoir un lien de réinitialisation sécurisé via Supabase.
              </p>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                  Adresse Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="vous@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-white focus:ring-1 focus:ring-white/20 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
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
                }}
                className="w-full py-2 text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer text-center block"
              >
                ← Retour à la connexion
              </button>
            </form>
          </div>
        ) : (
          /* NOT LOGGED IN: VALUE PROPOSITION + GOOGLE AUTH + FLEXIBLE CREDENTIALS */
          <div className="space-y-4">
            
            {/* Header Title */}
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
                {isSignUp ? 'Créer votre Compte Gratuit' : 'Connexion à Éliciné'}
              </h2>
              <p className="text-xs text-zinc-400">
                Débloquez la synchronisation multi-appareils et conservez vos découvertes.
              </p>
            </div>

            {/* Benefit Showcase Card (Zero false promises) */}
            <div className="p-3.5 rounded-xl bg-[#141414] border border-white/10 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#e50914]" />
                <span>Avantages exclusifs de votre compte gratuit :</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-zinc-300">
                <div className="flex items-start gap-1.5 p-2 rounded-lg bg-black/50 border border-white/5">
                  <Smartphone className="w-4 h-4 text-zinc-300 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug"><strong>Multi-écrans :</strong> Synchro tous appareils</span>
                </div>
                <div className="flex items-start gap-1.5 p-2 rounded-lg bg-black/50 border border-white/5">
                  <Heart className="w-4 h-4 text-[#e50914] flex-shrink-0 mt-0.5" />
                  <span className="leading-snug"><strong>Ma Liste :</strong> Sauvegarde de vos favoris</span>
                </div>
                <div className="flex items-start gap-1.5 p-2 rounded-lg bg-black/50 border border-white/5">
                  <History className="w-4 h-4 text-zinc-300 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug"><strong>Historique :</strong> Vos découvertes et IA</span>
                </div>
              </div>
              
              {/* Clear distinction regarding Premium AI credits */}
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 pt-1 border-t border-white/5">
                <Info className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <span>Note : Les quotas de recherche IA étendus restent réservés aux membres <strong>Pass Pro</strong>.</span>
              </div>
            </div>

            {/* PRIMARY ACTION: Continuer avec Google */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isLoading}
                className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-bold text-xs flex items-center justify-center gap-3 transition-all cursor-pointer shadow-md hover:shadow-lg disabled:opacity-60 select-none"
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
              <p className="text-[11px] text-zinc-400 text-center leading-tight">
                En continuant, vous confirmez votre accord avec nos{' '}
                <a 
                  href="/terms" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-zinc-300 hover:text-white underline underline-offset-2"
                >
                  Conditions Générales d'Utilisation
                </a>
                .
              </p>
            </div>

            {/* Divider: "ou par identifiant" */}
            <div className="relative flex items-center justify-center py-1">
              <div className="border-t border-white/10 w-full" />
              <span className="bg-[#0e0e0e] px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                ou par identifiant
              </span>
              <div className="border-t border-white/10 w-full" />
            </div>

            {/* Cinema-Style Tab Switcher */}
            <div className="flex rounded-xl bg-black/60 p-1 border border-white/10 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleSwitchMode(false)}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                  !isSignUp
                    ? 'bg-white text-black font-extrabold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Se connecter
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode(true)}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                  isSignUp
                    ? 'bg-white text-black font-extrabold shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Créer un compte
              </button>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="p-2.5 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {isSignUp ? (
                <>
                  {/* Pseudo / Nom */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                      Nom d'utilisateur ou pseudo
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        placeholder="Ex: SarahCine"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-white focus:ring-1 focus:ring-white/20 transition-all"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                      Adresse Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="vous@exemple.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-white focus:ring-1 focus:ring-white/20 transition-all"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* Identifier (Email) */
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Adresse Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="vous@exemple.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-white focus:ring-1 focus:ring-white/20 transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Mot de passe avec toggle de visibilité */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Mot de passe
                  </label>
                  {isSignUp ? (
                    <span className="text-[10px] text-zinc-400">
                      Min. 4 caractères
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setErrorMessage(null);
                      }}
                      className="text-[10px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      tabIndex={-1}
                    >
                      Mot de passe oublié ?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    maxLength={60}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#141414] border border-white/10 text-xs text-white placeholder-zinc-500 outline-none focus:border-white focus:ring-1 focus:ring-white/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-3 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isLoading || isGoogleLoading}
                className="w-full py-3 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
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
            <div className="text-center pt-1 border-t border-white/10">
              <button
                type="button"
                onClick={() => handleSwitchMode(!isSignUp)}
                className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer"
              >
                {isSignUp ? (
                  <span>Déjà inscrit ? <strong className="text-white underline">Se connecter</strong></span>
                ) : (
                  <span>Nouveau sur Éliciné ? <strong className="text-white underline">Créer un compte gratuit</strong></span>
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
