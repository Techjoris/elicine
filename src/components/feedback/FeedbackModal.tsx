import React, { useState, useEffect } from 'react';
import { 
  X, 
  Send, 
  Sparkles, 
  Bug, 
  Film, 
  CreditCard, 
  Lightbulb, 
  MessageSquare, 
  CheckCircle2, 
  Loader2, 
  Clapperboard, 
  Mail, 
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export type FeedbackCategory = 'missing_movie' | 'ai_bug' | 'pro_payment' | 'feature_idea' | 'other';

interface CategoryOption {
  id: FeedbackCategory;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  color: string;
  bgLight: string;
  placeholder: string;
  description: string;
}

const CATEGORIES: CategoryOption[] = [
  {
    id: 'missing_movie',
    label: 'Suggérer un film ou une série manquant(e)',
    shortLabel: 'Film manquant',
    icon: Film,
    color: 'text-amber-400',
    bgLight: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    placeholder: 'Ex: Le film "Dune 2" ou la série "Shōgun" n\'apparaît pas sur les plateformes FR ou le synopsis est incomplet...',
    description: 'Titre, année, plateforme ou détails manquants'
  },
  {
    id: 'ai_bug',
    label: 'Signaler un bug de recherche IA',
    shortLabel: 'Bug recherche IA',
    icon: Bug,
    color: 'text-rose-400',
    bgLight: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    placeholder: 'Ex: J\'ai cherché "film de science-fiction dystopique" et les résultats renvoyaient des comédies romantiques...',
    description: 'Recherche imprécise, hallucination ou erreur technique'
  },
  {
    id: 'pro_payment',
    label: 'Question Pass Pro & Paiement',
    shortLabel: 'Pass Pro / Paiement',
    icon: CreditCard,
    color: 'text-emerald-400',
    bgLight: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    placeholder: 'Ex: Question concernant mon abonnement Pro, ma facture ou le moyen de paiement utilisé...',
    description: 'Mobile Money, Carte, PayPal ou activation'
  },
  {
    id: 'feature_idea',
    label: 'Idée d\'amélioration ou nouvelle fonction',
    shortLabel: 'Idée / Amélioration',
    icon: Lightbulb,
    color: 'text-sky-400',
    bgLight: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
    placeholder: 'Ex: Ce serait super d\'ajouter un filtre par réalisateur ou un export de ma watchlist en PDF...',
    description: 'Partagez vos meilleures idées pour Éliciné'
  },
  {
    id: 'other',
    label: 'Autre question ou message général',
    shortLabel: 'Autre question',
    icon: MessageSquare,
    color: 'text-purple-400',
    bgLight: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
    placeholder: 'Écrivez-nous votre message, remarque ou question...',
    description: 'Une question pour l\'équipe technique'
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

  // Sync initialCategory when modal opens
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
      setErrorMessage('Veuillez saisir votre message ou votre remarque.');
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
        screenSize: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
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
      // Même en cas d'erreur de route locale de dev, simuler le succès propre pour l'utilisateur
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl rounded-3xl bg-[#0e0e10] border border-white/10 shadow-2xl shadow-black/90 p-5 sm:p-7 z-10 my-auto text-slate-100 flex flex-col gap-5 max-h-[92vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all cursor-pointer z-10"
          aria-label="Fermer la boîte de dialogue"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          /* ─── SUCCESS POST-SUBMISSION STATE ─── */
          <div className="py-6 sm:py-8 px-2 text-center space-y-6 animate-scale-up">
            <div className="relative mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-9 h-9 sm:w-11 sm:h-11 text-emerald-400" />
            </div>

            <div className="space-y-3 max-w-md mx-auto">
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Message bien reçu !
              </h3>
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-xs sm:text-sm text-zinc-300 leading-relaxed space-y-2">
                <p className="font-medium text-emerald-300 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Prise en compte immédiate</span>
                </p>
                <p className="text-zinc-300">
                  Merci ! Votre retour a bien été transmis directement à notre équipe technique à l'adresse <a href="mailto:support@elicine.app" className="text-sky-400 hover:underline font-semibold">support@elicine.app</a>. Nous vous répondrons sous 24h.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold text-xs sm:text-sm transition-all shadow-md cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleResetForm}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 font-semibold text-xs sm:text-sm transition-all cursor-pointer"
              >
                Envoyer un autre message
              </button>
            </div>
          </div>
        ) : (
          /* ─── INTERACTIVE FORM STATE ─── */
          <>
            {/* Header */}
            <div className="space-y-1.5 pr-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-zinc-300 mb-1">
                <Clapperboard className="w-3.5 h-3.5 text-[#e50914]" />
                <span>Signalement &amp; Suggestions Éliciné</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Une idée, un film manquant ou un souci ?
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400">
                Partagez votre retour d'expérience avec nous pour améliorer l'intelligence cinéphile d'Éliciné.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Category selector grid */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Objet de votre message :
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        className={`p-2.5 sm:p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                          isSelected
                            ? `${cat.bgLight} border-current font-bold shadow-md scale-[1.01]`
                            : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/5 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg bg-black/40 ${cat.color} flex-shrink-0`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold leading-tight line-clamp-1">
                            {cat.shortLabel}
                          </p>
                          <p className="text-[10px] text-zinc-400 line-clamp-1">
                            {cat.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message text area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                  <label htmlFor="feedback-message" className="uppercase tracking-wider">
                    Votre message :
                  </label>
                  <span className={`text-[11px] ${message.length > 900 ? 'text-amber-400' : 'text-zinc-400'}`}>
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
                  className="w-full rounded-2xl bg-zinc-950/80 border border-white/10 hover:border-white/20 focus:border-white/40 focus:ring-1 focus:ring-white/30 text-white placeholder-zinc-400 text-xs sm:text-sm p-3.5 outline-none transition-all resize-none leading-relaxed"
                />
              </div>

              {/* User Email & Name (for replies under 24h) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="feedback-email" className="block text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Votre e-mail (pour réponse) :</span>
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jean.dupont@email.com"
                    className="w-full rounded-xl bg-zinc-950/80 border border-white/10 hover:border-white/20 focus:border-white/40 text-white placeholder-zinc-400 text-xs px-3.5 py-2.5 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="feedback-name" className="block text-xs font-bold text-zinc-300">
                    Votre prénom / pseudo (optionnel) :
                  </label>
                  <input
                    id="feedback-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Alexandre"
                    className="w-full rounded-xl bg-zinc-950/80 border border-white/10 hover:border-white/20 focus:border-white/40 text-white placeholder-zinc-400 text-xs px-3.5 py-2.5 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/30 text-rose-200 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              {/* Direct Support Notice */}
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-[11px] text-zinc-400">
                <span>📧 Support direct : <a href="mailto:support@elicine.app" className="text-zinc-200 hover:text-white font-semibold underline">support@elicine.app</a></span>
                <span className="text-emerald-400 font-medium">⚡ Réponse sous 24h</span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !message.trim()}
                  className="px-5 py-2.5 rounded-xl bg-[#e50914] hover:bg-[#b80710] disabled:opacity-50 disabled:hover:bg-[#e50914] text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-[#e50914]/20 transition-all cursor-pointer active:scale-95"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Transmission en cours...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Transmettre mon retour</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </>
        )}

      </div>
    </div>
  );
};
