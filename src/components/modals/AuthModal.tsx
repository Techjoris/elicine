import React, { useState } from 'react';
import { 
  X, 
  User, 
  Mail, 
  Lock, 
  Crown, 
  CheckCircle, 
  LogOut, 
  Share2, 
  Sparkles 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AuthModal: React.FC = () => {
  const { 
    isAuthModalOpen, 
    setIsAuthModalOpen, 
    user, 
    login, 
    logout, 
    setIsProModalOpen, 
    showToast 
  } = useApp();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  if (!isAuthModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || (!name && isSignUp)) {
      showToast('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    const finalName = name.trim() || email.split('@')[0];
    login(email.trim(), finalName);
  };

  const copyReferral = () => {
    if (!user) return;
    const url = `${window.location.origin}?ref=${user.referralCode}`;
    navigator.clipboard.writeText(url);
    showToast('Lien de parrainage copié !');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      
      <div className="relative w-full max-w-md rounded-3xl bg-[#0c111e] border border-slate-700 shadow-2xl overflow-hidden text-slate-100 p-6 sm:p-8 space-y-6">
        
        {/* Close Button */}
        <button
          onClick={() => setIsAuthModalOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* If user is already logged in */}
        {user ? (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-white text-2xl font-black mx-auto shadow-neon-blue">
                {user.name.charAt(0).toUpperCase()}
              </div>

              <h2 className="text-2xl font-black text-white">{user.name}</h2>
              <p className="text-xs text-slate-400">{user.email}</p>

              <div className="pt-2 flex justify-center">
                {user.isPro ? (
                  <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 shadow-neon-gold">
                    <Crown className="w-3.5 h-3.5" />
                    Membre Pass Pro VIP (À Vie)
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-xs font-semibold">
                    Compte Gratuit (3 recherches / jour)
                  </span>
                )}
              </div>
            </div>

            {/* Referral Info */}
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Votre Code & Lien de Parrainage
              </span>
              <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="font-mono text-sm font-bold text-amber-400">{user.referralCode}</span>
                <button
                  onClick={copyReferral}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
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
                  onClick={() => {
                    setIsAuthModalOpen(false);
                    setIsProModalOpen(true);
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-neon-gold flex items-center justify-center gap-2"
                >
                  <Crown className="w-4 h-4" />
                  <span>Passer au Pass Pro (1 900 FCFA)</span>
                </button>
              )}

              <button
                onClick={logout}
                className="w-full py-3 rounded-xl bg-red-950/40 hover:bg-red-950/60 border border-red-500/30 text-red-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Se déconnecter</span>
              </button>
            </div>
          </div>
        ) : (
          /* Login / Signup Form */
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center mx-auto shadow-neon-blue">
                <User className="w-6 h-6" />
              </div>

              <h2 className="text-2xl font-black text-white">
                {isSignUp ? 'Créer un Compte Gratuit' : 'Connexion à Éliciné'}
              </h2>

              <p className="text-xs text-slate-400">
                Sauvegardez vos films favoris, votre historique IA et vos alertes de sorties.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {isSignUp && (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Votre Nom ou Pseudo
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Sarah Cinéphile"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Adresse Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="vous@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Mot de Passe
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-xs uppercase tracking-wider shadow-neon-blue transition-all"
              >
                {isSignUp ? 'Créer mon compte gratuit' : 'Se connecter'}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-xs text-blue-400 hover:underline"
              >
                {isSignUp
                  ? 'Déjà un compte ? Connectez-vous'
                  : 'Pas encore de compte ? Inscrivez-vous gratuitement'}
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};
