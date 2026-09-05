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
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AuthModal: React.FC = () => {
  const { 
    isAuthModalOpen, 
    setIsAuthModalOpen, 
    user, 
    loginWithCredentials,
    registerWithCredentials,
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  const handleSwitchMode = (signup: boolean) => {
    setIsSignUp(signup);
    setErrorMessage(null);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl animate-fade-in overflow-y-auto">
      
      <div className="relative w-full max-w-md rounded-3xl bg-zinc-950/95 border border-zinc-800/90 shadow-2xl overflow-hidden text-zinc-100 p-6 sm:p-8 space-y-5">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setIsAuthModalOpen(false);
          }}
          className="absolute top-4 right-4 p-2 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-all cursor-pointer"
          title="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* LOGGED IN VIEW */}
        {user ? (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black mx-auto shadow-lg ${
                user.isPro
                  ? 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-zinc-950 shadow-amber-500/20 ring-2 ring-amber-400/50'
                  : 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-cyan-500/20'
              }`}>
                {userInitials}
              </div>

              <h2 className="text-2xl font-black text-white">{user.name}</h2>
              <p className="text-xs text-zinc-400">{user.email}</p>

              <div className="pt-1 flex justify-center">
                {user.isPro ? (
                  <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 shadow-neon-gold">
                    <Crown className="w-3.5 h-3.5" />
                    Membre Pass Pro VIP
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 text-xs font-semibold">
                    Compte Gratuit (3 recherches / jour)
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
                    {watchlist.length} film{watchlist.length > 1 ? 's' : ''} sauvegardé{watchlist.length > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Referral Info */}
            <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
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
            <div className="space-y-2 pt-2">
              {!user.isPro && (
                <button
                  type="button"
                  onClick={() => {
                    setIsAuthModalOpen(false);
                    setIsProModalOpen(true);
                  }}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:brightness-110 text-zinc-950 font-black text-xs uppercase tracking-wider shadow-neon-gold flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Crown className="w-4 h-4" />
                  <span>Passer au Pass Pro VIP</span>
                </button>
              )}

              <button
                type="button"
                onClick={logout}
                className="w-full py-3 rounded-xl bg-red-950/30 hover:bg-red-950/60 border border-red-500/30 text-red-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Se déconnecter</span>
              </button>
            </div>
          </div>
        ) : (
          /* NOT LOGGED IN: NETFLIX-STYLE AUTH FORM */
          <div className="space-y-5">
            {/* Header Monogram & Title */}
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 flex items-center justify-center mx-auto shadow-neon-blue mb-2">
                <User className="w-6 h-6" />
              </div>

              <h2 className="text-2xl font-black text-white tracking-tight">
                {isSignUp ? 'Créer un Compte' : 'S’identifier'}
              </h2>

              <p className="text-xs text-zinc-400">
                {isSignUp
                  ? 'Rejoignez Éliciné pour sauvegarder votre liste et synchroniser vos favoris.'
                  : 'Retrouvez vos films favoris, votre historique IA et vos alertes de sorties.'}
              </p>
            </div>

            {/* Netflix-Style Tab Switcher */}
            <div className="flex rounded-xl bg-zinc-900 p-1 border border-zinc-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => handleSwitchMode(false)}
                className={`flex-1 py-2 rounded-lg transition-all cursor-pointer text-center ${
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
                className={`flex-1 py-2 rounded-lg transition-all cursor-pointer text-center ${
                  isSignUp
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                S'inscrire
              </button>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 animate-shake">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
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
                    Entre 4 et 60 caractères
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
                    className="absolute right-3.5 top-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400 mt-1 pl-1">
                  Règle souple : 4 caractères minimum, sans contrainte de majuscules ou symboles.
                </p>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Chargement...</span>
                  </>
                ) : (
                  <span>{isSignUp ? 'S\'inscrire à Éliciné' : 'Se connecter'}</span>
                )}
              </button>
            </form>

            {/* Bottom Quick Switch */}
            <div className="text-center pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => handleSwitchMode(!isSignUp)}
                className="text-xs text-zinc-400 hover:text-cyan-400 transition-colors cursor-pointer"
              >
                {isSignUp ? (
                  <span>Déjà membre ? <strong className="text-white underline">Se connecter</strong></span>
                ) : (
                  <span>Première visite sur Éliciné ? <strong className="text-white underline">Créer un compte</strong></span>
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
