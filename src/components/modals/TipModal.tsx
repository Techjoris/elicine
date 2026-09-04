import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Coffee, 
  Heart, 
  CreditCard,
  Smartphone, 
  ShieldCheck, 
  Loader2,
  Info,
  MapPin,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CURRENCY_CONFIGS, processNotchPayCheckout, verifyNotchPayPayment, PAYMENT_METHODS, isAfricanCurrency, CARD_MIN_FCFA } from '../../services/payment';
import { getUserGeoData, isMobileMoneyAvailable, getSuggestedCurrencyForCountry } from '../../services/geoService';
import { Currency } from '../../types';

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

  const [selectedPresetFcfa, setSelectedPresetFcfa] = useState<number>(1000);
  const [customAmountFcfa, setCustomAmountFcfa] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<string>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isWaitingConfirmation, setIsWaitingConfirmation] = useState(false);
  const pollingIntervalRef = useRef<any>(null);
  const [geoCountry, setGeoCountry] = useState<string>('');
  const [geoLoading, setGeoLoading] = useState(true);
  const [mobileMoneyEnabled, setMobileMoneyEnabled] = useState(false);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Auto-detect user country on open
  useEffect(() => {
    if (!isTipModalOpen) return;
    setGeoLoading(true);
    getUserGeoData().then((geo) => {
      setGeoCountry(geo.countryCode);
      const canUseMobile = isMobileMoneyAvailable(geo.countryCode);
      setMobileMoneyEnabled(canUseMobile);
      if (!canUseMobile) {
        setSelectedMethod('card');
      }
      const suggested = getSuggestedCurrencyForCountry(geo.countryCode, geo.currency);
      if (suggested !== currency) {
        setCurrency(suggested as Currency);
      }
      setGeoLoading(false);
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTipModalOpen(false);
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

  if (!isTipModalOpen) return null;

  const currentConfig = CURRENCY_CONFIGS[currency] || CURRENCY_CONFIGS['XAF'];
  const activeAmountFcfa = customAmountFcfa ? (Number(customAmountFcfa) || 0) : selectedPresetFcfa;
  const convertedValue = Math.round(activeAmountFcfa * currentConfig.rateToFcfa * 100) / 100;
  const isAfrica = isAfricanCurrency(currency);

  const presetAmounts = [500, 1000, 2500, 5000, 10000];

  const isCardPayment = selectedMethod === 'card';
  const cardMin = CARD_MIN_FCFA.tip; // 1000 FCFA
  const isUnderCardThreshold = isCardPayment && isAfrica && activeAmountFcfa < cardMin;

  const handleSelectMethod = (methodId: string) => {
    setSelectedMethod(methodId);
    if (methodId === 'card' && isAfrica && activeAmountFcfa < cardMin) {
      setSelectedPresetFcfa(cardMin);
      setCustomAmountFcfa('');
    }
  };

  const availableMethods = PAYMENT_METHODS.filter(m => {
    if (m.category === 'mobile' && !mobileMoneyEnabled) return false;
    if (m.isAvailableForAfricaOnly && !isAfrica) return false;
    return true;
  });

  const handleSendTip = async () => {
    if (activeAmountFcfa <= 0) {
      showToast('Veuillez entrer un montant valide.');
      return;
    }

    if (isUnderCardThreshold) {
      showToast(`Le montant minimum par Carte Bancaire est de ${cardMin} FCFA.`);
      return;
    }

    setIsProcessing(true);
    try {
      const channelMode: 'card' | 'mobile' = selectedMethod === 'card' ? 'card' : 'mobile';
      const paymentCurrency: Currency = channelMode === 'mobile' ? (isAfrica ? currency : 'XAF') : currency;

      const res = await processNotchPayCheckout({
        amount: convertedValue,
        currency: paymentCurrency,
        paymentType: 'tip',
        paymentMethod: channelMode,
        email: user?.email || 'contact@elicine.com',
        name: user?.name || 'Cinéphile',
        description: `Pourboire Soutien Éliciné (${activeAmountFcfa} FCFA - ${channelMode === 'card' ? 'Carte Bancaire' : 'Mobile Money'})`,
        publicKey: apiSettings.notchPayPublicKey,
        hashKey: apiSettings.notchPayHashKey,
        isTestMode: false,
        openInNewTab: true
      });

      if (res.paymentUrl) {
        if (typeof window !== 'undefined') {
          window.open(res.paymentUrl, '_blank');
        }

        if (channelMode === 'mobile' && res.reference) {
          setIsWaitingConfirmation(true);
          const ref = res.reference;
          const startTime = Date.now();

          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

          pollingIntervalRef.current = setInterval(async () => {
            if (Date.now() - startTime > 90000) {
              if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
              setIsWaitingConfirmation(false);
              showToast("Délai d'attente dépassé. Si vous avez validé le code, il sera confirmé sous peu.");
              return;
            }

            const check = await verifyNotchPayPayment(ref);
            if (check.status === 'complete') {
              if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
              setIsWaitingConfirmation(false);
              setIsTipModalOpen(false);
              setIsThankYouModalOpen(true);
            } else if (check.status === 'failed') {
              if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
              setIsWaitingConfirmation(false);
              showToast("Le paiement n'a pas pu être validé ou a été annulé.");
            }
          }, 3000);
        } else {
          showToast('Redirection vers la page de soutien sécurisée Notch Pay...');
        }
      } else {
        showToast(res.message);
      }
    } catch (err) {
      console.error(err);
      showToast('Erreur lors du traitement.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          setIsWaitingConfirmation(false);
          setIsTipModalOpen(false);
        }
      }}
    >
      <div 
        className="relative w-full max-w-md min-w-[320px] mx-4 rounded-2xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden text-slate-100 p-6 sm:p-7 space-y-5 z-50 my-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          onClick={() => {
            if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
            setIsWaitingConfirmation(false);
            setIsTipModalOpen(false);
          }}
          aria-label="Fermer"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/10 hover:border-white/25 flex items-center justify-center transition-all cursor-pointer z-10 shadow-sm"
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
              <h3 className="text-lg font-bold text-white">
                Paiement en cours de validation
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-sm leading-relaxed">
                Veuillez confirmer la transaction sur votre téléphone (*126# ou validation Orange Money)...
              </p>
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Vérification automatique en cours...</span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
                setIsWaitingConfirmation(false);
              }}
              className="text-xs text-slate-400 hover:text-white underline transition-colors cursor-pointer pt-2"
            >
              Annuler ou modifier le don
            </button>
          </div>
        ) : (
          <>

        {/* Title */}
        <div className="text-center space-y-2 w-full">
          <div className="w-12 h-12 rounded-2xl bg-orange-600/20 text-orange-400 border border-orange-500/30 flex items-center justify-center mx-auto">
            <Coffee className="w-6 h-6" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">
            Soutenir <span className="bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">Éliciné</span>
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed max-w-sm w-full mx-auto break-words text-center">
            Offrez un café aux développeurs pour financer le développement indépendant et les serveurs IA d'Éliciné.
          </p>
          {/* Geo Badge */}
          {!geoLoading && geoCountry && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border ${
              mobileMoneyEnabled
                ? 'bg-emerald-900/30 border-emerald-500/40 text-emerald-300'
                : 'bg-blue-900/30 border-blue-500/40 text-blue-300'
            }`}>
              <MapPin className="w-3 h-3" />
              <span>
                {mobileMoneyEnabled 
                  ? `📱 Mobile Money + 💳 Carte (${geoCountry})`
                  : `🌍 Carte Bancaire internationale (${geoCountry})`
                }
              </span>
            </div>
          )}
        </div>

        {/* Currency Tabs */}
        <div className="flex items-center justify-center gap-1 p-1 rounded-full bg-slate-900 border border-slate-800">
          {(['XAF', 'XOF', 'EUR', 'USD', 'CAD'] as Currency[]).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`flex-1 py-1 rounded-full text-xs font-bold transition-all ${
                currency === c ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Preset Amounts */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Choisir un montant
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {presetAmounts.map((amt) => {
              const isSelected = !customAmountFcfa && selectedPresetFcfa === amt;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => { setSelectedPresetFcfa(amt); setCustomAmountFcfa(''); }}
                  className={`py-2 rounded-xl text-xs font-black border transition-all ${
                    isSelected
                      ? 'bg-orange-500 border-orange-400 text-white shadow-md scale-105'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                  }`}
                >
                  {amt}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <input
              type="number"
              placeholder="Montant libre (en FCFA)..."
              value={customAmountFcfa}
              onChange={(e) => setCustomAmountFcfa(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 outline-none focus:border-orange-500"
            />
            <span className="absolute right-3 top-2.5 text-[11px] font-bold text-slate-400">FCFA</span>
          </div>
        </div>

        {/* Payment Methods — geo-filtered */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5 text-orange-400" />
            Mode de Paiement
          </label>

          {geoLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
              <span>Détection de votre région...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {availableMethods.map((method) => {
                const isSelected = selectedMethod === method.id;
                return (
                  <div
                    key={method.id}
                    onClick={() => handleSelectMethod(method.id)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-orange-500/20 border-orange-500 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {method.category === 'mobile'
                        ? <Smartphone className="w-4 h-4 text-amber-400" />
                        : <CreditCard className="w-4 h-4 text-blue-400" />
                      }
                      <span className="text-xs font-bold">{method.name}</span>
                    </div>
                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-orange-400 bg-orange-500' : 'border-slate-600'
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Minimum card threshold warning */}
        {isUnderCardThreshold && (
          <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs flex items-start gap-2.5 animate-fade-in">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="leading-relaxed">
                Le paiement par Carte Bancaire nécessite un montant minimum de <strong>{cardMin} FCFA</strong> pour couvrir les frais de traitement bancaire international.
              </p>
              <button
                type="button"
                onClick={() => { setSelectedPresetFcfa(cardMin); setCustomAmountFcfa(''); }}
                className="text-[11px] font-bold text-amber-400 underline hover:text-amber-300"
              >
                Ajuster automatiquement à {cardMin} FCFA
              </button>
            </div>
          </div>
        )}

        {/* Converted Summary */}
        <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-center">
          <span className="text-[11px] text-slate-400 block">Total à débiter via Notch Pay :</span>
          <div className="text-lg font-black text-orange-400 font-mono mt-0.5">
            {convertedValue} {currentConfig.symbol}
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSendTip}
          disabled={isProcessing || isUnderCardThreshold || geoLoading}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs sm:text-sm tracking-wider shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 uppercase disabled:opacity-50 cursor-pointer"
        >
          {isProcessing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /><span>Traitement sécurisé...</span></>
          ) : (
            <><Heart className="w-4 h-4 fill-current" /><span>Envoyer mon pourboire ({convertedValue} {currentConfig.symbol})</span></>
          )}
        </button>

        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Paiement crypté SSL — certifié Notch Pay</span>
        </div>

          </>
        )}

      </div>

    </div>
  );
};
