import React, { useEffect, useState, useRef } from 'react';
import { ElicineLogo } from './ElicineLogo';

const DEFAULT_PAYPAL_BUSINESS = (import.meta && import.meta.env && import.meta.env.VITE_PAYPAL_BUSINESS_ID) || 'ivanjoris959@gmail.com';

export function SupportModal({ isOpen, onClose, onOpenNotchPay }) {
  const [activeTab, setActiveTab] = useState('paypal');
  const [cfaZone, setCfaZone] = useState('XAF');
  const [paypalAmount, setPaypalAmount] = useState('5');
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
    const amountValue = paypalAmount && Number(paypalAmount) > 0 ? Number(paypalAmount) : 5;
    const businessEmail = DEFAULT_PAYPAL_BUSINESS || 'ivanjoris959@gmail.com';
    const params = new URLSearchParams({
      cmd: '_xclick',
      business: businessEmail,
      item_name: 'Soutien au projet Elicine',
      amount: amountValue.toFixed(2),
      currency_code: 'USD',
      no_shipping: '1',
      no_note: '0',
    });
    window.open(`https://www.paypal.com/cgi-bin/webscr?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const handleMobileMoneySubmit = (e) => {
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

        {/* ONGLET 1 : PAYPAL (Bouton SDK & Fallback Direct) */}
        {activeTab === 'paypal' && (
          <div className="w-full flex flex-col items-center text-center animate-in fade-in duration-150">
            {/* Saisie du montant PayPal */}
            <div className="w-full flex flex-col items-center gap-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
                Montant de votre don
              </label>
              <div className="relative flex items-center justify-center max-w-[200px] w-full mx-auto bg-slate-800/80 rounded-xl border border-white/10 px-4 py-2.5 focus-within:border-sky-500 transition-colors">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={paypalAmount}
                  onChange={(e) => setPaypalAmount(e.target.value.replace(/\D/g, ''))}
                  onBlur={() => {
                    if (!paypalAmount || Number(paypalAmount) <= 0) {
                      setPaypalAmount('5');
                    }
                  }}
                  placeholder="5"
                  className="w-full bg-transparent text-center font-black text-2xl text-white outline-none pr-2"
                />
                <span className="text-gray-400 font-bold text-lg select-none flex-shrink-0">USD</span>
              </div>

              {/* Boutons de montants rapides (3$, 5$, 10$, 25$) */}
              <div className="flex items-center justify-center gap-1.5 w-full max-w-[200px]">
                {[3, 5, 10, 25].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setPaypalAmount(amt.toString())}
                    className={`flex-1 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      paypalAmount === amt.toString()
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Texte explicatif */}
            <p className="w-full text-center text-xs text-gray-400 my-4 px-2 leading-relaxed break-normal whitespace-normal">
              Votre contribution libre permet de financer les requêtes d'intelligence artificielle et l'hébergement.
            </p>

            {/* Section d'action PayPal */}
            <div className="w-full flex flex-col items-center gap-3 mt-4">
              {/* Bouton direct PayPal - Largeur complète, padding optimisé, action directe */}
              <button
                type="button"
                onClick={handlePayPalCheckout}
                className="w-full max-w-sm py-3.5 px-4 bg-[#ffc439] hover:bg-[#f2ba32] active:scale-[0.99] text-[#003087] font-black text-base rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 transition-all cursor-pointer select-none"
              >
                <span>Faire un don avec</span>
                <span className="italic font-black text-lg">PayPal</span>
                <span className="text-sm font-bold text-slate-900">({paypalAmount || '5'} USD) →</span>
              </button>

              <p className="w-full text-center text-[10px] text-slate-400">
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
}

export default SupportModal;
