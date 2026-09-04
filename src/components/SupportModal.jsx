import React, { useEffect, useState, useRef } from 'react';
import { ElicineLogo } from './ElicineLogo';

export function SupportModal({ isOpen, onClose, onOpenNotchPay }) {
  const [activeTab, setActiveTab] = useState('paypal');
  const [cfaZone, setCfaZone] = useState('XAF');
  const [freeAmount, setFreeAmount] = useState('500');

  // 1. Gestion de la fermeture par touche Échap (Escape) et verrouillage du défilement
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
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

  const handlePayPalCheckout = () => {
    window.open('https://www.paypal.com/ncp/payment/F5HDRFLUH7YJN', '_blank', 'noopener,noreferrer');
  };

  const handleMobileMoneySubmit = (e) => {
    e.preventDefault();
    const amount = Math.max(1, Math.round(Number(freeAmount)));

    if (!amount || amount < 1) {
      alert("Veuillez entrer un montant valide.");
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
        className="relative w-full max-w-md min-w-[320px] max-h-[90vh] overflow-y-auto mx-4 bg-slate-900 text-white rounded-2xl p-6 shadow-2xl border border-white/10 z-50 my-auto flex flex-col gap-5"
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

        {/* ONGLET 1 : PAYPAL & CARTE (Page officielle hébergée) */}
        {activeTab === 'paypal' && (
          <div className="w-full flex flex-col items-center text-center animate-in fade-in duration-150 py-1">
            {/* Badges des moyens de paiement acceptés */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
              <span className="px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                <span>💳</span>
                <span>Carte bancaire (Visa, Mastercard, etc.)</span>
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-[#ffc439]/10 border border-[#ffc439]/30 text-[#ffc439] text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                <span className="italic font-black">P</span>
                <span>PayPal</span>
              </span>
            </div>

            {/* Explication claire pour le donateur */}
            <div className="w-full bg-slate-800/60 border border-white/10 rounded-2xl p-4 sm:p-5 mb-4 text-center">
              <p className="text-sm sm:text-base font-semibold text-white mb-2 leading-snug">
                Paiement direct et sécurisé sur la page officielle PayPal d'Éliciné
              </p>
              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                Sur la page suivante, vous pourrez <strong>choisir librement votre montant</strong> de soutien et régler au choix par <strong>Carte bancaire</strong> (sans obligation de créer un compte) ou via <strong>PayPal</strong>.
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Votre contribution permet de financer directement les coûts des serveurs et les requêtes des modèles d'intelligence artificielle.
              </p>
            </div>

            {/* Bouton d'action principal */}
            <div className="w-full flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handlePayPalCheckout}
                className="w-full max-w-md py-3.5 px-4 bg-[#ffc439] hover:bg-[#f2ba32] active:scale-[0.99] text-[#003087] font-black text-sm sm:text-base rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/15 transition-all cursor-pointer select-none"
              >
                <span>Continuer vers le paiement sécurisé (PayPal ou Carte) →</span>
              </button>

              <p className="w-full text-center text-[10px] text-slate-400 flex items-center justify-center gap-1.5">
                <span>🔒</span>
                <span>Paiement sécurisé et crypté SSL via les serveurs officiels certifiés PayPal.</span>
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
                <span className="text-[10px] text-amber-400">Montant libre dès 1 FCFA</span>
              </div>
              <div className="relative flex items-center w-full">
                <input
                  type="number"
                  min="1"
                  step="1"
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
              {[100, 250, 500, 1000].map((preset) => (
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
}

export default SupportModal;
