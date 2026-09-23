import React, { useState, useEffect, useRef } from 'react';
import { 
  Coffee, 
  Smartphone, 
  ShieldCheck, 
  Loader2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { 
  CURRENCY_CONFIGS, 
  processSaspayCheckout, 
  verifySaspayPayment, 
  extractSaspayRedirectUrl, 
  isAfricanCurrency,
  getSaspayDefaultCurrency,
  convertToSaspayCurrency,
  formatPaymentErrorMessage
} from '../../services/payment';
import { getUserGeoData, getSuggestedCurrencyForCountry } from '../../services/geoService';
import { Currency } from '../../types';

/** Montant libre : SasPay encaisse en FCFA, on indique simplement le seuil. */
const MIN_SASPAY_AMOUNT = 200;

/**
 * @param embedded  rendu à l'intérieur de la fenêtre « Soutenir » (onglet Mobile Money),
 *                  sans calque plein écran ni bouton de fermeture propre.
 * @param onClose   appelé quand l'onglet intégré demande la fermeture de la fenêtre parente.
 */
export const TipModal: React.FC<{ embedded?: boolean; onClose?: () => void }> = ({ embedded = false, onClose }) => {
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

  const defaultSaspayCurr = getSaspayDefaultCurrency();
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(() => (isAfricanCurrency(currency) ? currency : defaultSaspayCurr));
  // Montant laissé libre : le donateur saisit ce qu'il veut, sans palier imposé.
  const [amount, setAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWaitingConfirmation, setIsWaitingConfirmation] = useState(false);
  const pollingIntervalRef = useRef<any>(null);

  // Sync initial currency and amount based on user geolocation on open
  useEffect(() => {
    if (!embedded && !isTipModalOpen) return;
    setErrorMessage(null);

    getUserGeoData().then((geo) => {
      const suggested = (getSuggestedCurrencyForCountry(geo.countryCode, geo.currency) as Currency) || 'EUR';
      setSelectedCurrency(suggested);
      const isAfr = isAfricanCurrency(suggested);
      setAmount('');
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
    if (onClose) onClose();
    setIsTipModalOpen(false);
  };

  const handleCurrencyChange = (newCurr: Currency) => {
    setSelectedCurrency(newCurr);
    setCurrency(newCurr);
    setErrorMessage(null);
    setAmount('');
  };

  const handleMobileMoneySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawNum = Number(amount);

    if (!rawNum || rawNum <= 0) {
      showToast('Veuillez entrer un montant valide supérieur à 0.');
      return;
    }

    // Normalisation stricte de la devise et du montant pour SasPay
    const { amount: cleanAmount, currency: cleanCurrency } = convertToSaspayCurrency(
      rawNum,
      selectedCurrency,
      getSaspayDefaultCurrency(),
      false
    );

    if (Number(cleanAmount) < MIN_SASPAY_AMOUNT) {
      showToast(`Le montant minimum est de ${MIN_SASPAY_AMOUNT} FCFA.`);
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);
    try {
      console.log('[TipModal] Initialisation paiement SasPay :', {
        amount: cleanAmount,
        currency: cleanCurrency
      });

      const donorEmail = user?.email || 'support@elicine.app';
      const donorName = user?.name || (user as any)?.user_metadata?.full_name || 'Cinéphile';

      if (typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem('elicine_last_donation', JSON.stringify({
            email: donorEmail,
            name: donorName,
            amount: cleanAmount,
            currency: cleanCurrency
          }));
        } catch (_) {}
      }

      const returnUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/?payment=saspay_success&type=don&amount=${cleanAmount}&currency=${cleanCurrency}&email=${encodeURIComponent(donorEmail)}`
        : undefined;

      const data = await processSaspayCheckout({
        amount: cleanAmount,
        currency: cleanCurrency,
        paymentType: 'tip',
        paymentMethod: 'mobile',
        email: donorEmail,
        name: donorName,
        description: `Soutien Éliciné (${cleanAmount} ${cleanCurrency})`,
        returnUrl,
        skipRedirect: true
      });

      // 1. Structure exacte reçue dans la console du navigateur (F12)
      console.log("REPONSE SASPAY :", data);

      // Si la réponse n'est pas un succès
      if (!data || data.success === false) {
        const exactError = formatPaymentErrorMessage(data?.message || data?.error || data, "Échec de l'initialisation du paiement SasPay.");
        console.error('[TipModal] Échec SasPay :', exactError, data);
        setErrorMessage(exactError);
        showToast(exactError);
        setIsProcessing(false);
        return;
      }

      // 2. Extraction correcte de l'URL peu importe sa structure
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
        extractSaspayRedirectUrl(data);

      if (!urlTrouvee) {
        const receivedProps = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'aucune';
        const innerProps = data?.data && typeof data.data === 'object' ? Object.keys(data.data).join(', ') : '';
        const propsDetail = innerProps ? `Propriétés reçues: [${receivedProps}], sous-propriétés data: [${innerProps}]` : `Propriétés reçues: [${receivedProps}]`;
        const missingLinkError = `Lien de redirection SasPay introuvable (checkout_url manquant). ${propsDetail}. Réponse reçue : ${typeof data === 'object' ? JSON.stringify(data) : data}`;
        
        console.error('[TipModal]', missingLinkError);
        setErrorMessage(missingLinkError);
        showToast(`Lien manquant. Propriétés reçues : [${receivedProps}]`);
        setIsProcessing(false);
        return;
      }

      console.log("URL SASPAY TROUVEE :", urlTrouvee);
      showToast('Redirection immédiate vers le paiement sécurisé SasPay...');
      setIsProcessing(false);
      if (typeof window !== 'undefined') {
        window.location.href = urlTrouvee;
      }
    } catch (err: any) {
      console.error('[TipModal] Exception initialisation SasPay :', err);
      const exactError = formatPaymentErrorMessage(err, "Échec inconnu de l'initialisation du paiement SasPay.");
      setErrorMessage(exactError);
      showToast(`Erreur : ${exactError}`);
      setIsProcessing(false);
    }
  };

  if (!embedded && !isTipModalOpen) return null;

  const currentConfig = CURRENCY_CONFIGS[selectedCurrency] || CURRENCY_CONFIGS['XAF'];
  return (
    <div 
      className={embedded
        ? 'w-full'
        : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in'}
      onClick={(e) => {
        if (embedded) return;
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div 
        className={embedded
          ? 'relative w-full text-slate-800 dark:text-slate-100 space-y-4'
          : 'relative w-full max-w-md min-w-[320px] mx-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100 p-6 sm:p-7 space-y-5 z-50 my-auto'}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tip-modal-title"
      >
        {/* Bouton Fermer */}
        {!embedded && (
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fermer"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white border border-slate-200 dark:border-white/10 flex items-center justify-center transition-all cursor-pointer z-10 shadow-sm"
        >
          <span className="text-base font-bold leading-none select-none">✕</span>
        </button>
        )}

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
        {/* En-tête : masqué quand le formulaire est intégré à la fenêtre « Soutenir » */}
            {!embedded && (
              <div className="text-center space-y-2 w-full pt-1">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 flex items-center justify-center mx-auto shadow-inner">
                  <Coffee className="w-6 h-6" />
                </div>
                <h2 id="tip-modal-title" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  Soutenir le projet <span className="bg-gradient-to-r from-sky-500 to-cyan-500 bg-clip-text text-transparent">Éliciné</span>
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm w-full mx-auto">
                  Votre contribution libre finance directement l'infrastructure de recherche avancée et l'indépendance de la plateforme.
                </p>
              </div>
            )}

            {/* Formulaire de soutien SasPay */}
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
                        ? 'bg-sky-500 text-white font-extrabold shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  {!isAfricanCurrency(selectedCurrency) && (
                    <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-700 dark:text-sky-300 text-[10px] flex items-center gap-1.5 mt-1">
                      <span>💡</span>
                      <span>
                        Mobile Money traite les transactions en FCFA ({defaultSaspayCurr}) via SasPay. Équivalent : ~{convertToSaspayCurrency(Number(amount) || 1, selectedCurrency, defaultSaspayCurr).amount.toLocaleString()} FCFA.
                      </span>
                    </div>
                  )}
                </div>

                {/* Montant libre : aucune suggestion imposée, juste le seuil SasPay indiqué */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <span>Montant de votre soutien</span>
                    <span className="text-sky-600 dark:text-sky-400">Libre</span>
                  </div>

                  <div className="relative flex items-center w-full">
                    <input
                      type="number"
                      min={MIN_SASPAY_AMOUNT}
                      step="any"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder=""
                      className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 focus:border-sky-500 rounded-xl px-4 py-3 text-base font-black text-slate-900 dark:text-white focus:outline-none pr-16 transition-all shadow-inner font-mono"
                    />
                    <span className="absolute right-4 text-xs font-bold text-sky-600 dark:text-sky-400 select-none">
                      {currentConfig.symbol}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Indication : <strong className="text-sky-600 dark:text-sky-400">{MIN_SASPAY_AMOUNT} FCFA</strong> minimum.
                    Vous choisissez librement au-delà.
                  </p>
                </div>

                {/* Message d'erreur explicite dans l'interface */}
                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold leading-relaxed flex items-start gap-2 animate-fade-in break-words">
                    <span className="text-base flex-shrink-0">⚠️</span>
                    <div className="flex-1">
                      <p className="font-bold">Erreur de paiement SasPay :</p>
                      <p className="text-[11px] mt-0.5 opacity-90 break-all">{errorMessage}</p>
                    </div>
                  </div>
                )}

                {/* Bouton d'action Mobile Money */}
                <button
                  type="submit"
                  disabled={isProcessing || !amount || Number(amount) < 1}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-500 via-sky-500 to-cyan-400 hover:from-sky-400 hover:to-cyan-300 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-lg shadow-sky-500/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Initialisation du paiement...</span>
                    </>
                  ) : Number(amount) > 0 ? (
                    <span>
                      Soutenir avec {convertToSaspayCurrency(Number(amount), selectedCurrency, defaultSaspayCurr).amount.toLocaleString()} FCFA ({convertToSaspayCurrency(Number(amount), selectedCurrency, defaultSaspayCurr).currency}) via SasPay →
                    </span>
                  ) : (
                    <span>Soutenir via SasPay →</span>
                  )}
                </button>

                <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
                  Orange Money, MTN MoMo, Wave, Moov • Certifié SasPay
                </p>
              </form>

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
