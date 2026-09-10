import React, { useState, useEffect, useRef } from 'react';
import { 
  Coffee, 
  CreditCard,
  Smartphone, 
  ShieldCheck, 
  Loader2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { 
  CURRENCY_CONFIGS, 
  processMonerooCheckout, 
  verifyMonerooPayment, 
  extractMonerooRedirectUrl, 
  isAfricanCurrency,
  getMonerooDefaultCurrency,
  convertToMonerooCurrency
} from '../../services/payment';
import { getUserGeoData, getSuggestedCurrencyForCountry } from '../../services/geoService';
import { Currency } from '../../types';

const presetsByCurrency: Record<Currency, { amounts: number[]; defaultAmount: number }> = {
  XAF: { amounts: [500, 1000, 2500, 5000], defaultAmount: 1000 },
  XOF: { amounts: [500, 1000, 2500, 5000], defaultAmount: 1000 },
  EUR: { amounts: [2, 5, 10, 20], defaultAmount: 5 },
  USD: { amounts: [2, 5, 10, 20], defaultAmount: 5 },
  CAD: { amounts: [2, 5, 10, 25], defaultAmount: 5 }
};

export const TipModal: React.FC = () => {
  const { 
    isTipModalOpen, 
    setIsTipModalOpen, 
    currency, 
    setCurrency, 
    apiSettings, 
    user, 
    showToast,
    setIsThankYouModalOpen
  } = useApp();

  const defaultMonerooCurr = getMonerooDefaultCurrency();
  const [activeTab, setActiveTab] = useState<'paypal' | 'mobile'>('paypal');
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(() => (isAfricanCurrency(currency) ? currency : defaultMonerooCurr));
  const [amount, setAmount] = useState<string>('1000');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWaitingConfirmation, setIsWaitingConfirmation] = useState(false);
  const pollingIntervalRef = useRef<any>(null);

  // Sync initial currency and amount based on user geolocation on open
  useEffect(() => {
    if (!isTipModalOpen) return;
    setErrorMessage(null);

    getUserGeoData().then((geo) => {
      const suggested = (getSuggestedCurrencyForCountry(geo.countryCode, geo.currency) as Currency) || 'EUR';
      setSelectedCurrency(suggested);
      const isAfr = isAfricanCurrency(suggested);
      setActiveTab(isAfr ? 'mobile' : 'paypal');
      const defAmt = presetsByCurrency[suggested]?.defaultAmount || (isAfr ? 1000 : 5);
      setAmount(defAmt.toString());
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isTipModalOpen]);

  // Clean polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setErrorMessage(null);
    setIsWaitingConfirmation(false);
    setIsTipModalOpen(false);
  };

  const handleCurrencyChange = (newCurr: Currency) => {
    setSelectedCurrency(newCurr);
    setCurrency(newCurr);
    setErrorMessage(null);
    const def = presetsByCurrency[newCurr]?.defaultAmount || (isAfricanCurrency(newCurr) ? 1000 : 5);
    setAmount(def.toString());
  };

  const handleTabChange = (tab: 'paypal' | 'mobile') => {
    setActiveTab(tab);
    setErrorMessage(null);
    if (tab === 'mobile' && !isAfricanCurrency(selectedCurrency)) {
      const defCurr = getMonerooDefaultCurrency();
      setSelectedCurrency(defCurr);
      setCurrency(defCurr);
      setAmount('1000');
    }
  };

  const handlePayPalCheckout = () => {
    window.open('https://www.paypal.com/ncp/payment/F5HDRFLUH7YJN', '_blank', 'noopener,noreferrer');
    showToast('Ouverture de la page sécurisée PayPal...');
    handleClose();
  };

  const handleMobileMoneySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawNum = Number(amount);

    if (!rawNum || rawNum <= 0) {
      showToast('Veuillez entrer un montant valide supérieur à 0.');
      return;
    }

    // Normalisation stricte de la devise et du montant pour Moneroo
    const { amount: cleanAmount, currency: cleanCurrency } = convertToMonerooCurrency(
      rawNum,
      selectedCurrency,
      getMonerooDefaultCurrency(),
      false
    );

    setErrorMessage(null);
    setIsProcessing(true);
    try {
      console.log('[TipModal] Initialisation paiement Moneroo :', {
        amount: cleanAmount,
        currency: cleanCurrency
      });

      const data = await processMonerooCheckout({
        amount: cleanAmount,
        currency: cleanCurrency,
        paymentType: 'tip',
        paymentMethod: 'mobile',
        email: user?.email || 'contact@elicine.com',
        name: user?.name || (user as any)?.user_metadata?.full_name || 'Cinéphile',
        description: `Soutien Éliciné (${cleanAmount} ${cleanCurrency})`,
        returnUrl: typeof window !== 'undefined' ? `${window.location.origin}/?payment=moneroo_success&type=don` : undefined,
        skipRedirect: true
      });

      // 1. Structure exacte reçue dans la console du navigateur (F12)
      console.log("REPONSE MONEROO :", data);

      // Si la réponse n'est pas un succès
      if (!data || data.success === false) {
        const receivedKeys = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'aucune';
        const exactError = data?.message || data?.error || `Échec de l'initialisation du paiement Moneroo (propriétés reçues : [${receivedKeys}]).`;
        console.error('[TipModal] Échec Moneroo :', exactError, data);
        setErrorMessage(exactError);
        showToast(exactError);
        alert(`Erreur Moneroo : ${exactError}`);
        setIsProcessing(false);
        return;
      }

      // 2. Extraction correcte de l'URL peu importe sa structure (data.checkout_url, data.link, ou data.data.checkout_url)
      const urlTrouvee = 
        data?.checkout_url ||
        data?.link ||
        data?.data?.checkout_url ||
        data?.data?.link ||
        data?.paymentUrl ||
        data?.url ||
        (data as any)?.rawResponse?.checkout_url ||
        (data as any)?.rawResponse?.link ||
        (data as any)?.rawResponse?.data?.checkout_url ||
        extractMonerooRedirectUrl(data);

      // S'assure que si checkout_url ou link est absent, l'application lève une erreur claire listant les propriétés reçues
      if (!urlTrouvee) {
        const receivedProps = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'aucune';
        const innerProps = data?.data && typeof data.data === 'object' ? Object.keys(data.data).join(', ') : '';
        const propsDetail = innerProps ? `Propriétés reçues: [${receivedProps}], sous-propriétés data: [${innerProps}]` : `Propriétés reçues: [${receivedProps}]`;
        const missingLinkError = `Lien de redirection Moneroo introuvable (checkout_url ou link manquant). ${propsDetail}. Réponse reçue : ${JSON.stringify(data)}`;
        
        console.error('[TipModal]', missingLinkError);
        setErrorMessage(missingLinkError);
        showToast(`Lien manquant. Propriétés reçues : [${receivedProps}]`);
        alert(`Erreur de redirection Moneroo :\n${missingLinkError}`);
        setIsProcessing(false);
        return;
      }

      // Force immédiatement le window.location.href = urlTrouvee
      console.log("URL MONEROO TROUVEE :", urlTrouvee);
      showToast('Redirection immédiate vers le paiement sécurisé Moneroo...');
      setIsProcessing(false);
      if (typeof window !== 'undefined') {
        window.location.href = urlTrouvee;
      }
    } catch (err: any) {
      console.error('[TipModal] Exception initialisation Moneroo :', err);
      const exactError = err?.message || String(err) || "Échec inconnu de l'initialisation du paiement Moneroo.";
      setErrorMessage(exactError);
      showToast(`Erreur : ${exactError}`);
      alert(`Erreur de paiement Moneroo :\n${exactError}`);
      setIsProcessing(false);
    }
  };

  if (!isTipModalOpen) return null;

  const currentConfig = CURRENCY_CONFIGS[selectedCurrency] || CURRENCY_CONFIGS['XAF'];
  const presets = presetsByCurrency[selectedCurrency] || presetsByCurrency.XAF;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div 
        className="relative w-full max-w-md min-w-[320px] mx-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100 p-6 sm:p-7 space-y-5 z-50 my-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tip-modal-title"
      >
        {/* Bouton Fermer */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-white/10 flex items-center justify-center transition-all cursor-pointer z-10 shadow-sm"
        >
          <span className="text-base font-bold leading-none select-none">✕</span>
        </button>

        {isWaitingConfirmation ? (
          <div className="flex flex-col items-center justify-center text-center py-6 px-2 space-y-6 animate-fade-in w-full">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">📱</span>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Paiement en cours de validation
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-sm leading-relaxed">
                Veuillez confirmer la transaction sur votre téléphone (*126# ou validation Orange Money / Wave)...
              </p>
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Vérification automatique en cours...</span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
                setIsWaitingConfirmation(false);
              }}
              className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white underline transition-colors cursor-pointer pt-2"
            >
              Annuler ou modifier le don
            </button>
          </div>
        ) : (
          <>
            {/* Header compact & chaleureux */}
            <div className="text-center space-y-2 w-full pt-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto shadow-inner">
                <Coffee className="w-6 h-6" />
              </div>
              <h2 id="tip-modal-title" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Soutenir le projet <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">Éliciné</span> ☕
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm w-full mx-auto">
                Votre contribution libre finance directement les serveurs d'intelligence artificielle et l'indépendance de la plateforme.
              </p>
            </div>

            {/* 2 Onglets Principaux Minimalistes */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-white/10 w-full">
              <button
                type="button"
                onClick={() => handleTabChange('paypal')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                  activeTab === 'paypal'
                    ? 'bg-[#0079C1] text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span className="truncate">PayPal &amp; Carte bancaire</span>
              </button>

              <button
                type="button"
                onClick={() => handleTabChange('mobile')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
                  activeTab === 'mobile'
                    ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="truncate">Paiement Mobile</span>
              </button>
            </div>

            {/* ONGLET 1 : PAYPAL & CARTE BANCAIRE */}
            {activeTab === 'paypal' && (
              <div className="w-full flex flex-col items-center text-center space-y-4 pt-1 animate-fade-in">
                {/* Badges de confiance */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-300 text-[11px] font-semibold flex items-center gap-1">
                    <span>💳</span>
                    <span>Carte Visa / Mastercard</span>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-semibold flex items-center gap-1">
                    <span className="font-black italic">P</span>
                    <span>PayPal</span>
                  </span>
                </div>

                {/* Explication épurée */}
                <div className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-center space-y-1.5">
                  <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-white">
                    Paiement direct sécurisé sur la page officielle PayPal
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Définissez librement votre montant et réglez par <strong>Carte bancaire</strong> (sans créer de compte) ou via <strong>PayPal</strong>.
                  </p>
                </div>

                {/* Bouton d'action direct */}
                <button
                  type="button"
                  onClick={handlePayPalCheckout}
                  className="w-full py-3.5 px-4 bg-[#ffc439] hover:bg-[#f2ba32] text-[#003087] font-black text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-[0.99] transition-all cursor-pointer select-none"
                >
                  <span>Continuer vers PayPal ou Carte bancaire →</span>
                </button>
              </div>
            )}

            {/* ONGLET 2 : PAIEMENT MOBILE */}
            {activeTab === 'mobile' && (
              <form onSubmit={handleMobileMoneySubmit} className="w-full space-y-4 pt-1 animate-fade-in">
                {/* Sélecteur de devises sobre */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <span>Devise</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">{currentConfig.name}</span>
                  </div>
                  <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 w-full gap-1">
                    {(['XOF', 'XAF', 'EUR', 'USD', 'CAD'] as Currency[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleCurrencyChange(c)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                          selectedCurrency === c
                            ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  {!isAfricanCurrency(selectedCurrency) && (
                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] flex items-center gap-1.5 mt-1">
                      <span>💡</span>
                      <span>
                        Mobile Money traite les transactions en FCFA ({defaultMonerooCurr}). Équivalent : ~{convertToMonerooCurrency(Number(amount) || 1, selectedCurrency, defaultMonerooCurr).amount.toLocaleString()} FCFA.
                      </span>
                    </div>
                  )}
                </div>

                {/* Champ Montant & Suggestions rapides */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <span>Montant du don</span>
                    <span>Libre</span>
                  </div>

                  <div className="relative flex items-center w-full">
                    <input
                      type="number"
                      min="1"
                      step="any"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Montant du don..."
                      className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 focus:border-amber-500 rounded-xl px-4 py-3 text-base font-black text-slate-900 dark:text-white focus:outline-none pr-16 transition-all shadow-inner font-mono"
                    />
                    <span className="absolute right-4 text-xs font-bold text-amber-600 dark:text-amber-400 select-none">
                      {currentConfig.symbol}
                    </span>
                  </div>

                  {/* Boutons de montants suggérés */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {presets.amounts.map((amt) => {
                      const isSelected = amount === amt.toString();
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAmount(amt.toString())}
                          className={`py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer text-center ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm font-extrabold'
                              : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {amt.toLocaleString()} {currentConfig.symbol}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Message d'erreur explicite dans l'interface */}
                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold leading-relaxed flex items-start gap-2 animate-fade-in break-words">
                    <span className="text-base flex-shrink-0">⚠️</span>
                    <div className="flex-1">
                      <p className="font-bold">Erreur de paiement Moneroo :</p>
                      <p className="text-[11px] mt-0.5 opacity-90 break-all">{errorMessage}</p>
                    </div>
                  </div>
                )}

                {/* Bouton d'action Mobile Money */}
                <button
                  type="submit"
                  disabled={isProcessing || !amount || Number(amount) < 1}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Initialisation du paiement...</span>
                    </>
                  ) : (
                    <span>
                      Payer {convertToMonerooCurrency(Number(amount) || 1000, selectedCurrency, defaultMonerooCurr).amount.toLocaleString()} FCFA ({convertToMonerooCurrency(Number(amount) || 1000, selectedCurrency, defaultMonerooCurr).currency}) via Mobile Money →
                    </span>
                  )}
                </button>

                <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
                  Orange Money, MTN MoMo, Wave, Moov • Certifié Moneroo
                </p>
              </form>
            )}

            {/* Pied de boîte : mention de sécurité */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-white/10 text-center w-full">
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Paiement crypté SSL • Éliciné 100% Indépendant</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TipModal;
