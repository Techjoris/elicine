import React, { useEffect, useState, useRef } from 'react';
import { ElicineLogo } from './ElicineLogo';

export function SupportModal({ isOpen, onClose, onOpenNotchPay }) {
  const [activeTab, setActiveTab] = useState('momo'); // 'momo' | 'paypal'
  const [cfaZone, setCfaZone] = useState('XAF'); // 'XAF' (Centrale) ou 'XOF' (Ouest)
  const [freeAmount, setFreeAmount] = useState('500');
  const [loadingPayPal, setLoadingPayPal] = useState(false);
  const [paypalError, setPaypalError] = useState(false);
  const hasRenderedPayPal = useRef(false);

  useEffect(() => {
    if (!isOpen || activeTab !== 'paypal') {
      hasRenderedPayPal.current = false;
      return;
    }

    setLoadingPayPal(true);
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
          setTimeout(() => setLoadingPayPal(false), 400);
          return true;
        } catch (e) {
          console.error("Erreur PayPal :", e);
          setPaypalError(true);
          setLoadingPayPal(false);
          return true;
        }
      }
      return false;
    };

    if (tryRenderPayPal()) return;

    const interval = setInterval(() => {
      if (tryRenderPayPal()) clearInterval(interval);
    }, 200);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!hasRenderedPayPal.current) {
        setLoadingPayPal(false);
        setPaypalError(true);
      }
    }, 3500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isOpen, activeTab]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md rounded-3xl bg-slate-950 border border-slate-800 shadow-2xl p-6 sm:p-7 text-slate-200 flex flex-col gap-5 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          ✕
        </button>

        <div className="flex flex-col items-center text-center gap-2 pt-1">
          <ElicineLogo variant="icon" size="lg" />
          <h3 className="text-lg font-bold text-white tracking-wide">
            Soutenez le projet Éliciné
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
            Votre don libre finance les requêtes d'intelligence artificielle et l'hébergement du moteur indépendant.
          </p>
        </div>

        {/* Sélecteur de méthode */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-900/90 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('momo')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'momo'
                ? 'bg-sky-500 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📱</span>
            <span>Mobile Money</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('paypal')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'paypal'
                ? 'bg-[#0079C1] text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>💳</span>
            <span>PayPal & Carte</span>
          </button>
        </div>

        {/* ONGLET 1 : MOBILE MONEY */}
        {activeTab === 'momo' && (
          <form onSubmit={handleMobileMoneySubmit} className="flex flex-col gap-4 animate-in fade-in duration-150">
            {/* Choix de la région FCFA */}
            <div className="flex flex-col gap-1.5">
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
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
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
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold">🇨🇮 Ouest (XOF)</span>
                  <span className="text-[9px] text-slate-400">Côte d'Ivoire, Sénégal...</span>
                </button>
              </div>
            </div>

            {/* Champ Montant */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Montant de votre don libre
                </label>
                <span className="text-[10px] text-amber-400">Min. 200 FCFA</span>
              </div>
              <div className="relative flex items-center">
                <input
                  type="number"
                  min="200"
                  step="50"
                  required
                  value={freeAmount}
                  onChange={(e) => setFreeAmount(e.target.value)}
                  placeholder="Ex: 500"
                  className="w-full bg-slate-900 border border-slate-700/80 focus:border-amber-500 rounded-2xl px-4 py-3 text-base sm:text-lg font-black text-white focus:outline-none pr-20 transition-all shadow-inner font-mono"
                />
                <span className="absolute right-4 text-xs font-extrabold text-amber-400 select-none">
                  {cfaZone}
                </span>
              </div>
            </div>

            {/* Suggestions de montants */}
            <div className="flex items-center justify-between gap-1.5">
              {[500, 1000, 2500, 5000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFreeAmount(preset.toString())}
                  className="flex-1 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 font-medium transition-all cursor-pointer"
                >
                  {preset.toLocaleString()}
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              <span>Envoyer {Number(freeAmount || 0).toLocaleString()} {cfaZone} via Mobile Money →</span>
            </button>
            <p className="text-[10px] text-slate-400 text-center">
              Orange Money, MTN MoMo, Wave • Sécurisé par NotchPay
            </p>
          </form>
        )}

        {/* ONGLET 2 : PAYPAL */}
        {activeTab === 'paypal' && (
          <div className="flex flex-col items-center justify-center min-h-[160px] w-full px-2 animate-in fade-in duration-150">
            {loadingPayPal && (
              <div className="flex flex-col items-center gap-2 text-slate-400 text-xs py-4">
                <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                <span>Connexion sécurisée à PayPal...</span>
              </div>
            )}

            <div 
              id="paypal-container-F5HDRFLUH7YJN" 
              className={`w-full flex justify-center ${loadingPayPal ? 'hidden' : 'block'}`}
            />

            {paypalError && (
              <div className="flex flex-col items-center gap-2 w-full py-2">
                <p className="text-[11px] text-amber-400 text-center">
                  Affichage direct bloqué par votre navigateur.
                </p>
                <a
                  href="https://www.paypal.com/ncp/payment/F5HDRFLUH7YJN"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 bg-[#ffc439] hover:bg-[#f2ba32] text-[#003087] font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
                >
                  <span>Payer avec</span>
                  <span className="italic font-black text-sm">PayPal</span>
                </a>
              </div>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-slate-900 text-center">
          <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1.5">
            <span>🔒</span> Transaction chiffrée et sécurisée
          </p>
        </div>
      </div>
    </div>
  );
}

export default SupportModal;
