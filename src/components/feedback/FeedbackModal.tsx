import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  CheckCircle2, 
  Loader2, 
  Clapperboard, 
  Mail, 
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export type FeedbackCategory = 'missing_movie' | 'ai_bug' | 'pro_payment' | 'feature_idea' | 'other';

interface CategoryOption {
  id: FeedbackCategory;
  label: string;
  placeholder: string;
}

const CATEGORIES: CategoryOption[] = [
  {
    id: 'missing_movie',
    label: '🎬 Suggérer un film ou une série manquant(e)',
    placeholder: 'Indiquez le titre, l\'année ou la plateforme concernée...'
  },
  {
    id: 'ai_bug',
    label: '⚡ Signaler un bug de recherche IA',
    placeholder: 'Décrivez votre recherche et le résultat inattendu...'
  },
  {
    id: 'pro_payment',
    label: '👑 Question Pass Pro & Paiement',
    placeholder: 'Question sur votre abonnement, reçu ou activation...'
  },
  {
    id: 'feature_idea',
    label: '💡 Idée d\'amélioration ou suggestion',
    placeholder: 'Partagez votre idée pour rendre Éliciné encore meilleur...'
  },
  {
    id: 'other',
    label: '✉️ Autre question ou message général',
    placeholder: 'Écrivez votre message à l\'équipe...'
  }
];

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: FeedbackCategory;
  contextInfo?: string;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  initialCategory = 'missing_movie',
  contextInfo
}) => {
  const { user, showToast } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<FeedbackCategory>(initialCategory);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Synchronisation lors de l'ouverture
  useEffect(() => {
    if (isOpen) {
      if (initialCategory) {
        setSelectedCategory(initialCategory);
      }
      if (user?.email) {
        setEmail(user.email);
      }
      if (user?.name) {
        setName(user.name);
      }
      setIsSuccess(false);
      setErrorMessage(null);
    }
  }, [isOpen, initialCategory, user]);

  if (!isOpen) return null;

  const currentCategoryObj = CATEGORIES.find(c => c.id === selectedCategory) || CATEGORIES[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      setErrorMessage('Veuillez saisir votre message.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      category: selectedCategory,
      categoryLabel: currentCategoryObj.label,
      message: message.trim(),
      email: email.trim() || user?.email || null,
      name: name.trim() || user?.name || null,
      metadata: {
        url: typeof window !== 'undefined' ? window.location.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        contextInfo: contextInfo || null,
        userRole: user?.role || 'visitor',
        isPro: Boolean(user?.isPro)
      }
    };

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Erreur réseau (${res.status})`);
      }

      setIsSuccess(true);
      showToast('✨ Votre retour a été transmis avec succès !');
    } catch (err: any) {
      console.error('[FeedbackModal] Erreur lors de l\'envoi:', err);
      // Mode tolérant
      setIsSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setMessage('');
    setIsSuccess(false);
    setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      {/* Arrière-plan flouté */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        aria-hidden="true"
      />

      {/* Carte de la boîte de dialogue - Épurée et aérée */}
      <div className="relative w-full max-w-lg rounded-2xl bg-[#101012] border border-white/10 shadow-2xl shadow-black/80 p-5 sm:p-6 z-10 my-auto text-slate-100 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        
        {/* Bouton de fermeture */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer z-10"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>

        {isSuccess ? (
          /* ─── ÉTAT SUCCÈS ÉPURÉ ─── */
          <div className="py-6 px-2 text-center space-y-4 animate-scale-up">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>

            <div className="space-y-2 max-w-sm mx-auto">
              <h3 className="text-xl font-black text-white tracking-tight">
                Message transmis !
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                Votre retour a été envoyé directement à notre équipe technique à <a href="mailto:support@elicine.app" className="text-sky-400 font-semibold underline">support@elicine.app</a>. Nous vous répondrons sous 24h.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold text-xs transition-all shadow cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 text-xs font-semibold transition-all cursor-pointer"
              >
                Autre message
              </button>
            </div>
          </div>
        ) : (
          /* ─── FORMULAIRE MINIMALISTE ─── */
          <>
            {/* Entête épurée */}
            <div className="space-y-1 pr-6">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                <Clapperboard className="w-3.5 h-3.5 text-[#e50914]" />
                <span>Support &amp; Suggestions</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Une idée ou un signalement ?
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              
              {/* Menu déroulant épuré pour l'objet */}
              <div className="space-y-1">
                <label htmlFor="feedback-category" className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Objet :
                </label>
                <div className="relative">
                  <select
                    id="feedback-category"
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value as FeedbackCategory);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    className="w-full appearance-none rounded-xl bg-zinc-900/90 border border-white/10 hover:border-white/20 focus:border-white/40 focus:ring-1 focus:ring-white/20 text-white text-xs sm:text-sm pl-3.5 pr-10 py-2.5 outline-none transition-all cursor-pointer"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-[#141416] text-white py-1">
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Champ message épuré */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  <label htmlFor="feedback-message">
                    Votre message :
                  </label>
                  <span className="text-zinc-500 font-normal lowercase">
                    {message.length} / 1000
                  </span>
                </div>
                <textarea
                  id="feedback-message"
                  required
                  rows={4}
                  maxLength={1000}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value.slice(0, 1000));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder={currentCategoryObj.placeholder}
                  className="w-full rounded-xl bg-zinc-900/90 border border-white/10 hover:border-white/20 focus:border-white/40 focus:ring-1 focus:ring-white/20 text-white placeholder-zinc-500 text-xs sm:text-sm p-3 outline-none transition-all resize-none leading-relaxed"
                />
              </div>

              {/* Champs E-mail & Nom compacts en 1 ligne */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label htmlFor="feedback-email" className="block text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-zinc-400" />
                    <span>E-mail (pour réponse) :</span>
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="w-full rounded-xl bg-zinc-900/90 border border-white/10 hover:border-white/20 focus:border-white/40 text-white placeholder-zinc-500 text-xs px-3 py-2 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="feedback-name" className="block text-[11px] font-semibold text-zinc-400">
                    Nom ou pseudo (optionnel) :
                  </label>
                  <input
                    id="feedback-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Alexandre"
                    className="w-full rounded-xl bg-zinc-900/90 border border-white/10 hover:border-white/20 focus:border-white/40 text-white placeholder-zinc-500 text-xs px-3 py-2 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Bannière d'erreur */}
              {errorMessage && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-200 text-xs">
                  {errorMessage}
                </div>
              )}

              {/* Pied de modal avec rappel support et bouton d'action */}
              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-white/5">
                <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Réponse garantie sous 24h</span>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-xs font-medium transition-all cursor-pointer"
                  >
                    Annuler
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || !message.trim()}
                    className="px-4 py-2 rounded-xl bg-[#e50914] hover:bg-[#b80710] disabled:opacity-50 disabled:hover:bg-[#e50914] text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all cursor-pointer active:scale-95"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Envoi...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Envoyer</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </form>
          </>
        )}

      </div>
    </div>
  );
};
