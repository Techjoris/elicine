import React, { useEffect, useState, useRef } from 'react';
import { ElicineLogo } from './ElicineLogo';

export interface NotchPayTipPayload {
  amount: number;
  currency: string;
  description: string;
}

export interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNotchPay?: (payload: NotchPayTipPayload) => void;
}

declare global {
  interface Window {
    paypal?: any;
  }
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose, onOpenNotchPay }) => {
  const [activeTab, setActiveTab] = useState<'paypal' | 'momo'>('paypal');
  const [cfaZone, setCfaZone] = useState<'XAF' | 'XOF'>('XAF');
  const [freeAmount, setFreeAmount] = useState('500');
  const [loadingPayPal, setLoadingPayPal] = useState(false);
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [paypalError, setPaypalError] = useState(false);
  const hasRenderedPayPal = useRef(false);

  // 1. Gestion de la fermeture par touche Échap (Escape) et verrouillage du défilement
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  // 2. Cycle de vie et initialisation du SDK PayPal Hosted Buttons
  useEffect(() => {
    if (!isOpen || activeTab !== 'paypal') {
      hasRenderedPayPal.current = false;
      return;
    }

    setLoadingPayPal(true);
    setPaypalLoaded(false);
    setPaypalError(false);

    const tryRenderPayPal = () => {
      const container = document.getElementById("paypal-container-F5HDRFLUH7YJN");
      if (!container) return false;

      if (window.paypal && window.paypal.HostedButtons) {
        try {
          container.innerHTML = "";
          window.paypal.HostedButtons({
            hostedButtonId: "F5HDRFLUH7YJN",
          }).render("#paypal-container-F5HDRFLUH7YJN");
          hasRenderedPayPal.current = true;
          setPaypalLoaded(true);
          setLoadingPayPal(false);
          return true;
        } catch (e) {
          console.error("Erreur d'initialisation PayPal :", e);
          setPaypalError(true);
          setLoadingPayPal(false);
          return true;
        }
      }
      return false;
    };

    if (tryRenderPayPal()) return;

    const interval = setInterval(() => {
      if (tryRenderPayPal()) {
        clearInterval(interval);
      }
    }, 250);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!hasRenderedPayPal.current) {
        setLoadingPayPal(false);
        setPaypalError(true);
      }
    }, 4000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isOpen, activeTab]);

  const handleMobileMoneySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(freeAmount);

    if (!amount || amount < 200) {
      alert("Le montant minimum pour le Mobile Money est de 200 FCFA.");
      return;
    }

    if (onOpenNotchPay) {
      onOpenNotchPay({
        amount,
        currency: cfaZone,
        description: `Soutien Éliciné (${amount} FCFA)`,
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="relative w-full max-w-md min-w-[320px] mx-4 bg-slate-900 text-white rounded-2xl p-6 shadow-2xl border border-white/10 z-50 my-auto flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-modal-title"
      >
        {/* Bouton de fermeture ✕ accessible et visible */}
        <button 
          type="button"
          onClick={onClose}
          aria-label="Fermer la boîte de dialogue"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/10 hover:border-white/25 flex items-center justify-center transition-all cursor-pointer z-10 shadow-sm"
        >
          <span className="text-base font-bold leading-none select-none">✕</span>
        </button>

        {/* En-tête : Titre et Description avec largeur protégée */}
        <div className="flex flex-col items-center text-center gap-2 pt-1 w-full">
          <ElicineLogo variant="icon" size="lg" />
          <h3 id="support-modal-title" className="text-lg sm:text-xl font-black text-white tracking-wide">
            Soutenez le projet Éliciné
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed max-w-sm w-full mx-auto break-words text-center">
            Soutenez le développement indépendant et les serveurs IA d'Éliciné. Votre don libre finance les requêtes d'intelligence artificielle et l'hébergement du moteur indépendant.
          </p>
        </div>

        {/* Sélecteur de méthode (PayPal vs Mobile Money) */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-950/80 border border-slate-800 w-full">
          <button
            type="button"
            onClick={() => setActiveTab('paypal')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'paypal'
                ? 'bg-[#0079C1] text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>💳</span>
            <span>PayPal & Carte</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('momo')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'momo'
                ? 'bg-sky-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📱</span>
            <span>Mobile Money</span>
          </button>
        </div>

        {/* ONGLET 1 : PAYPAL (Bouton SDK & Fallback Direct) */}
        {activeTab === 'paypal' && (
          <div className="flex flex-col items-center justify-center min-h-[160px] w-full gap-3 animate-in fade-in duration-150">
            {loadingPayPal && (
              <div className="flex flex-col items-center gap-2 text-slate-400 text-xs py-4">
                <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <span>Connexion sécurisée à PayPal...</span>
              </div>
            )}

            {/* Conteneur hébergé PayPal officiel */}
            <div 
              id="paypal-container-F5HDRFLUH7YJN" 
              className={`w-full flex justify-center items-center min-h-[48px] ${loadingPayPal ? 'hidden' : 'block'}`}
            />

            {/* Bouton d'action directe PayPal (toujours opérationnel en cas de blocage de script) */}
            <div className="w-full flex flex-col gap-2 pt-1">
              <a
                href="https://www.paypal.com/ncp/payment/F5HDRFLUH7YJN"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-[#ffc439] hover:bg-[#f2ba32] text-[#003087] font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <span>Faire un don avec</span>
                <span className="italic font-black text-base">PayPal</span>
                <span className="text-xs font-normal text-slate-700">(ou Carte) →</span>
              </a>
              <p className="text-[10px] text-slate-400 text-center">
                Paiement sécurisé crypté SSL via les serveurs certifiés PayPal.
              </p>
            </div>
          </div>
        )}

        {/* ONGLET 2 : MOBILE MONEY (NotchPay) */}
        {activeTab === 'momo' && (
          <form onSubmit={handleMobileMoneySubmit} className="flex flex-col gap-4 animate-in fade-in duration-150 w-full">
            {/* Choix de la région FCFA */}
            <div className="flex flex-col gap-1.5 w-full">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Votre région (Zone Franc CFA)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCfaZone('XAF')}
                  className={`py-2 px-2.5 rounded-xl text-[11px] font-semibold border transition-all text-left flex flex-col cursor-pointer ${
                    cfaZone === 'XAF'
                      ? 'bg-sky-500/15 border-sky-500 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold">🇨🇲 Centrale (XAF)</span>
                  <span className="text-[9px] text-slate-400">Cameroun, Gabon, Congo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCfaZone('XOF')}
                  className={`py-2 px-2.5 rounded-xl text-[11px] font-semibold border transition-all text-left flex flex-col cursor-pointer ${
                    cfaZone === 'XOF'
                      ? 'bg-sky-500/15 border-sky-500 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold">🇨🇮 Ouest (XOF)</span>
                  <span className="text-[9px] text-slate-400">Côte d'Ivoire, Sénégal...</span>
                </button>
              </div>
            </div>

            {/* Champ Montant */}
            <div className="w-full">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Montant de votre don libre
                </label>
                <span className="text-[10px] text-amber-400">Min. 200 FCFA</span>
              </div>
              <div className="relative flex items-center w-full">
                <input
                  type="number"
                  min="200"
                  step="50"
                  required
                  value={freeAmount}
                  onChange={(e) => setFreeAmount(e.target.value)}
                  placeholder="Ex: 500"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-4 py-3 text-base sm:text-lg font-black text-white focus:outline-none pr-20 transition-all shadow-inner font-mono"
                />
                <span className="absolute right-4 text-xs font-extrabold text-amber-400 select-none">
                  {cfaZone}
                </span>
              </div>
            </div>

            {/* Suggestions rapides de montants */}
            <div className="flex items-center justify-between gap-1.5 w-full">
              {[500, 1000, 2500, 5000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFreeAmount(preset.toString())}
                  className="flex-1 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 font-medium transition-all cursor-pointer"
                >
                  {preset.toLocaleString()}
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              <span>Envoyer {Number(freeAmount || 0).toLocaleString()} {cfaZone} via Mobile Money →</span>
            </button>
            <p className="text-[10px] text-slate-400 text-center">
              Orange Money, MTN MoMo, Wave • Sécurisé par NotchPay
            </p>
          </form>
        )}

        {/* Pied de boîte de dialogue */}
        <div className="pt-2 border-t border-slate-800/80 text-center w-full">
          <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1.5">
            <span>🔒</span> Transaction chiffrée SSL • Éliciné 100% Indépendant
          </p>
        </div>
      </div>
    </div>
  );
};

export default SupportModal;
