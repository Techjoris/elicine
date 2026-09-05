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

export const AuthModal: React.FC = () => {
  const { 
    isAuthModalOpen, 
    setIsAuthModalOpen, 
    user, 
    loginWithCredentials,
    registerWithCredentials,
    loginWithGoogle,
    logout, 
    setIsProModalOpen, 
    setActiveView,
    watchlist,
    showToast 
  } = useApp();

  const [isSignUp, setIsSignUp] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  const handleSwitchMode = (signup: boolean) => {
    setIsSignUp(signup);
    setErrorMessage(null);
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsGoogleLoading(true);
    try {
      const res = await loginWithGoogle();
      if (!res.success) {
        setErrorMessage(res.error || 'Erreur lors de la connexion Google.');
      }
    } catch {
      setErrorMessage('Une erreur est survenue lors de la connexion avec Google.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Password validation rule: min 4, max 60 chars
    if (!password || password.length < 4) {
      setErrorMessage('Le mot de passe doit contenir au moins 4 caractères.');
      return;
    }
    if (password.length > 60) {
      setErrorMessage('Le mot de passe ne doit pas dépasser 60 caractères.');
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!username.trim() && !email.trim()) {
          setErrorMessage("Veuillez renseigner un nom d'utilisateur ou un email.");
          setIsLoading(false);
          return;
        }
        const res = await registerWithCredentials(username.trim(), email.trim(), password);
        if (!res.success) {
          setErrorMessage(res.error || "Erreur lors de la création du compte.");
        } else {
          setPassword('');
          setUsername('');
          setEmail('');
        }
      } else {
        if (!identifier.trim()) {
          setErrorMessage("Veuillez saisir votre email ou nom d'utilisateur.");
          setIsLoading(false);
          return;
        }
        const res = await loginWithCredentials(identifier.trim(), password);
        if (!res.success) {
          setErrorMessage(res.error || "Identifiant ou mot de passe incorrect.");
        } else {
          setPassword('');
          setIdentifier('');
        }
      }
    } catch {
      setErrorMessage("Une erreur inattendue est survenue.");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-fade-in overflow-y-auto">
      
      <div className="relative w-full max-w-lg rounded-3xl bg-zinc-950/95 border border-white/10 shadow-2xl overflow-hidden text-zinc-100 p-5 sm:p-7 space-y-4 my-auto">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setIsAuthModalOpen(false);
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-all cursor-pointer z-10"
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
                  className="w-16 h-16 rounded-2xl object-cover mx-auto shadow-lg ring-2 ring-cyan-400/50" 
                />
              ) : (
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black mx-auto shadow-lg ${
                  user.isPro
                    ? 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-zinc-950 shadow-amber-500/20 ring-2 ring-amber-400/50'
                    : 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-cyan-500/20'
                }`}>
                  {userInitials}
                </div>
              )}

              <div>
                <h2 className="text-2xl font-black text-white flex items-center justify-center gap-2">
                  <span>{user.name}</span>
                  {user.provider === 'google' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-cyan-300 border border-cyan-500/30" title="Connecté avec Google">
                      Google
                    </span>
                  )}
                </h2>
                <p className="text-xs text-zinc-400">{user.email}</p>
              </div>

              <div className="pt-0.5 flex justify-center">
                {user.isPro ? (
                  <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 shadow-neon-gold">
                    <Crown className="w-3.5 h-3.5" />
                    Membre Pass Pro VIP
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 text-xs font-semibold">
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
              className="w-full p-3 rounded-2xl bg-zinc-900/90 hover:bg-zinc-850 border border-zinc-800 flex items-center justify-between transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                  <Heart className="w-4 h-4 fill-red-500/20" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
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
            <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Votre Code de Parrainage
              </span>
              <div className="flex items-center justify-between bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
                <span className="font-mono text-sm font-bold text-amber-400">{user.referralCode}</span>
                <button
                  type="button"
                  onClick={copyReferral}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
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
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:brightness-110 text-zinc-950 font-black text-xs uppercase tracking-wider shadow-neon-gold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Crown className="w-4 h-4" />
                  <span>Passer au Pass Pro VIP</span>
                </button>
              )}

              <button
                type="button"
                onClick={logout}
                className="w-full py-2.5 rounded-xl bg-red-950/30 hover:bg-red-950/60 border border-red-500/30 text-red-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Se déconnecter</span>
              </button>
            </div>
          </div>
        ) : (
          /* NOT LOGGED IN: VALUE PROPOSITION + GOOGLE AUTH + FLEXIBLE CREDENTIALS */
          <div className="space-y-4">
            
            {/* Header Title */}
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {isSignUp ? 'Créer votre Compte Gratuit' : 'Connexion à Éliciné'}
              </h2>
              <p className="text-xs text-zinc-400">
                Débloquez la synchronisation multi-appareils et conservez vos découvertes.
              </p>
            </div>

            {/* Benefit Showcase Card (Zero false promises) */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-b from-zinc-900/90 to-zinc-900/50 border border-white/10 space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Avantages exclusifs de votre compte gratuit :</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px] text-zinc-300">
                <div className="flex items-start gap-1.5 p-2 rounded-xl bg-zinc-950/60 border border-white/5">
                  <Smartphone className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug"><strong>Multi-écrans :</strong> Synchro smartphone, tablette et PC</span>
                </div>
                <div className="flex items-start gap-1.5 p-2 rounded-xl bg-zinc-950/60 border border-white/5">
                  <Heart className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug"><strong>Ma Liste :</strong> Sauvegarde permanente de vos favoris</span>
                </div>
                <div className="flex items-start gap-1.5 p-2 rounded-xl bg-zinc-950/60 border border-white/5">
                  <History className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span className="leading-snug"><strong>Historique :</strong> Vos découvertes et recherches IA</span>
                </div>
              </div>
              
              {/* Clear distinction regarding Premium AI credits */}
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 pt-1 border-t border-white/5">
                <Info className="w-3.5 h-3.5 text-amber-400/80 flex-shrink-0" />
                <span>Note : Les quotas de recherche IA étendus/illimités restent réservés aux membres <strong>Pass Pro</strong>.</span>
              </div>
            </div>

            {/* PRIMARY ACTION: Continuer avec Google */}
            <div>
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
            </div>

            {/* Divider: "ou par identifiant" */}
            <div className="relative flex items-center justify-center py-1">
              <div className="border-t border-zinc-800 w-full" />
              <span className="bg-zinc-950 px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">
                ou par identifiant
              </span>
              <div className="border-t border-zinc-800 w-full" />
            </div>

            {/* Netflix-Style Tab Switcher */}
            <div className="flex rounded-xl bg-zinc-900/90 p-1 border border-zinc-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleSwitchMode(false)}
                className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                  !isSignUp
                    ? 'bg-zinc-800 text-white shadow-sm'
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
                    ? 'bg-zinc-800 text-white shadow-sm'
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
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 transition-all"
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
                        placeholder="vous@exemple.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 transition-all"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* Identifier (Email ou Pseudo) */
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                    Email ou nom d'utilisateur
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="Email ou pseudo"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 transition-all"
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
                  <span className="text-[10px] text-zinc-400">
                    Min. 4 caractères (règle souple)
                  </span>
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
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700/80 text-xs text-white placeholder-zinc-500 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 transition-all"
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
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
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
            <div className="text-center pt-1 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => handleSwitchMode(!isSignUp)}
                className="text-xs text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
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
