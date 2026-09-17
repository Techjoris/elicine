import React, { useState, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { HeroSection } from './components/hero/HeroSection';
import { MovieGrid } from './components/movies/MovieGrid';
import { TrendingView } from './components/views/TrendingView';
import { CatalogView } from './components/views/CatalogView';
import { PlatformsView } from './components/views/PlatformsView';
import { WatchlistView } from './components/views/WatchlistView';
import { AlertsView } from './components/views/AlertsView';
import { AdminView } from './components/views/AdminView';
import { TermsView } from './components/views/TermsView';
import { ResetPasswordView } from './components/views/ResetPasswordView';
import { PaymentCallbackView } from './components/views/PaymentCallbackView';
import { Footer } from './components/layout/Footer';

// Modals
import { MovieDetailModal } from './components/modals/MovieDetailModal';
import { ProModal } from './components/modals/ProModal';
import { TipModal } from './components/modals/TipModal';
import { AuthModal } from './components/modals/AuthModal';
import { SuccessModal } from './components/modals/SuccessModal';
import { ProSuccessModal } from './components/modals/ProSuccessModal';
import { ApkInstallModal } from './components/modals/ApkInstallModal';
import { TermsConsentModal } from './components/modals/TermsConsentModal';
import { DevModal } from './components/DevModal';
import { ApkDownloadBanner } from './components/ApkDownloadBanner';
import { SupportModal } from './components/SupportModal';
import { SettingsModal } from './components/SettingsModal';
import { FeedbackModal } from './components/feedback/FeedbackModal';
import { FeedbackFloatingWidget } from './components/feedback/FeedbackFloatingWidget';
import { supabase } from './lib/supabase';
import { subscriptionService } from './services/subscriptionService';
import { 
  processSaspayCheckout, 
  extractSaspayRedirectUrl, 
  getSaspayDefaultCurrency, 
  convertToSaspayCurrency,
  formatPaymentErrorMessage,
  triggerThankYouEmail
} from './services/payment';

import { useApp } from './context/AppContext';
import { useTranslation } from './context/LanguageContext';
import { FALLBACK_MOVIES, fetchTrendingPage } from './services/tmdb';
import { useInfiniteCatalog } from './hooks/useInfiniteCatalog';
import { Movie } from './types';
import { Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export const AppContent: React.FC = () => {
  const { 
    activeView, 
    setActiveView, 
    setSelectedMovie, 
    apiSettings, 
    toastMessage, 
    showToast,
    upgradeToPro,
    user,
    setIsProModalOpen,
    setIsAuthModalOpen,
    isThankYouModalOpen,
    setIsThankYouModalOpen,
    isProSuccessModalOpen,
    setIsProSuccessModalOpen,
    isTipModalOpen,
    setIsTipModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isFeedbackModalOpen,
    setIsFeedbackModalOpen,
    feedbackInitialCategory,
    openFeedbackModal
  } = useApp();

  const { t } = useTranslation();

  const [aiResults, setAiResults] = useState<{
    movies: Movie[];
    thought?: string;
    mood?: string;
    suggestedPrompts?: string[];
  } | null>(null);

  // Success Thank-you modal state
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [successModal, setSuccessModal] = useState<{
    isOpen: boolean;
    type: 'pro' | 'tip';
  }>({
    isOpen: false,
    type: 'pro'
  });

  const [isDevModalOpen, setIsDevModalOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  // Intercept payment return URL params and route to the correct modal or callback view
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname.toLowerCase();

    // --- PRO SUBSCRIPTION RETURN ---
    const isProReturn =
      path.startsWith('/payment-callback') ||
      path.startsWith('/payment/callback') ||
      path.startsWith('/success') ||
      params.get('subscription') === 'pro_success' ||
      params.get('payment') === 'pro_success' ||
      params.get('payment') === 'saspay_pro_success' ||
      (params.get('status') === 'success' && params.get('type') !== 'don' && params.get('type') !== 'donation') ||
      (params.get('payment_status') === 'success' && params.get('type') === 'pro') ||
      Boolean(params.get('gateway') && (params.get('status') === 'success' || params.get('subscription_id') || params.get('reference') || params.get('id'))) ||
      Boolean(params.get('subscription_id') && (params.get('type') === 'pro' || params.get('payment_status') === 'success' || params.get('status') === 'success'));

    // --- TIP / DONATION SUCCESS ---
    const isTipSuccess =
      (params.get('payment') === 'success' && params.get('subscription') !== 'pro_success') ||
      params.get('payment') === 'saspay_success' ||
      params.get('payment') === 'moneroo_success' ||
      (params.get('payment_status') === 'success' && params.get('type') === 'don') ||
      params.get('tip') === 'success';

    // --- CANCELLATION RETURN ---
    const isPaymentCancelled =
      params.get('payment') === 'cancelled' ||
      params.get('payment') === 'canceled' ||
      params.get('donation') === 'cancelled' ||
      params.get('donation') === 'canceled' ||
      params.get('status') === 'cancelled';

    if (isPaymentCancelled) {
      showToast('ℹ️ Paiement ou don annulé. Vous pouvez réessayer à tout moment.');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (isProReturn) {
      // 🔒 SÉCURITÉ : Aucun passage automatique en Pro côté client !
      // Redirection vers la vue de vérification cryptographique et interrogation de la base de données.
      setActiveView('payment-callback');
    } else if (isTipSuccess) {
      // 1. Récupération des données du donateur depuis l'URL ou la session
      let donorEmail = params.get('email') || params.get('customer_email') || user?.email || '';
      let donorName = params.get('name') || params.get('customer_name') || user?.name || '';
      let donorAmount = params.get('amount') || '200';
      let donorCurrency = params.get('currency') || 'FCFA';
      const donorRef = params.get('reference') || params.get('id') || `tip_${Date.now()}`;

      if (typeof sessionStorage !== 'undefined') {
        try {
          const raw = sessionStorage.getItem('elicine_last_donation');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.email && !donorEmail) donorEmail = parsed.email;
            if (parsed.name && !donorName) donorName = parsed.name;
            if (parsed.amount) donorAmount = String(parsed.amount);
            if (parsed.currency) donorCurrency = parsed.currency;
            sessionStorage.removeItem('elicine_last_donation');
          }
        } catch (_) {}
      }

      // 2. Déclenchement direct du mail de remerciement via l'API interne
      if (donorEmail) {
        console.log('[App] ✉️ Déclenchement direct du mail de remerciement don pour :', donorEmail);
        triggerThankYouEmail({
          email: donorEmail,
          customerName: donorName || 'Cinéphile',
          amount: donorAmount,
          currency: donorCurrency,
          reference: donorRef,
          isDonation: true
        }).then(res => {
          console.log('[App] Résultat envoi e-mail don direct :', res);
        }).catch(err => {
          console.warn('[App] Erreur envoi e-mail don direct :', err);
        });
      }

      // 3. Affichage de la modale de remerciement
      setShowThankYouModal(true);
      setSuccessModal({ isOpen: true, type: 'tip' });
      // Nettoyage de l'URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [setActiveView, user]);

  // 2 & 3. Restauration et réouverture automatique de la modale de paiement après authentification
  useEffect(() => {
    if (!user) return;

    try {
      if (typeof sessionStorage !== 'undefined') {
        const isPending = sessionStorage.getItem('pending_checkout') === 'true';
        if (isPending) {
          console.log('[Auto-Resume] pending_checkout détecté après connexion. Réouverture instantanée de la modale Pro...');
          sessionStorage.removeItem('pending_checkout');
          setIsAuthModalOpen(false);
          setIsProModalOpen(true);
          showToast("👑 Bon retour ! Finalisation de votre abonnement Pro...", 4000);
        }
      }
    } catch (e) {
      console.warn('[Auto-Resume] Erreur vérification sessionStorage:', e);
    }
  }, [user, setIsProModalOpen, setIsAuthModalOpen, showToast]);

  const key = apiSettings.tmdbApiKey;
  const fetchTrendingFn = React.useCallback(
    (page: number) => fetchTrendingPage(page, key, t.tmdbLang),
    [key, t.tmdbLang]
  );
  const {
    items: homeTrendingMovies,
    loading: homeTrendingLoading,
    hasMore: homeTrendingHasMore,
    sentinelRef: homeTrendingSentinelRef
  } = useInfiniteCatalog<Movie>(fetchTrendingFn, [key, t.tmdbLang] as const);

  // Surprise movie trigger
  useEffect(() => {
    if (activeView === 'surprise') {
      const randomIndex = Math.floor(Math.random() * FALLBACK_MOVIES.length);
      const chosen = FALLBACK_MOVIES[randomIndex];
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
      setSelectedMovie(chosen);
      showToast(`🎲 Film Surprise : "${chosen.title}" !`);
      setActiveView('home');
    }
  }, [activeView, setSelectedMovie, setActiveView, showToast]);

  // Interception de l'URL /admin, #admin ou ?view=admin
  useEffect(() => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();

    if (path === '/admin' || hash === '#admin' || search.includes('view=admin')) {
      setActiveView('admin');
    } else if (
      path.startsWith('/payment/callback') || 
      path.startsWith('/success') || 
      search.includes('subscription_id=') ||
      search.includes('payment_status=')
    ) {
      setActiveView('payment-callback');
    }
  }, [setActiveView]);

  // Synchronisation de l'URL avec activeView
  useEffect(() => {
    if (activeView === 'admin') {
      if (window.location.pathname !== '/admin') {
        window.history.pushState(null, '', '/admin');
      }
    } else if (activeView === 'payment-callback') {
      if (!window.location.pathname.startsWith('/payment/callback')) {
        window.history.pushState(null, '', '/payment/callback' + window.location.search);
      }
    } else if (window.location.pathname === '/admin' || window.location.pathname.startsWith('/payment/callback')) {
      window.history.pushState(null, '', '/');
    }
  }, [activeView]);

  const handleSupportSaspay = async ({ amount, currency, description }: { amount: number; currency: string; description: string }) => {
    try {
      const defaultSaspayCurr = getSaspayDefaultCurrency();
      const { amount: cleanAmount, currency: cleanCurrency } = convertToSaspayCurrency(
        amount,
        currency,
        defaultSaspayCurr,
        false
      );
      console.log('[App] Initialisation soutien SasPay :', { amount: cleanAmount, currency: cleanCurrency });
      const data = await processSaspayCheckout({
        amount: cleanAmount,
        currency: cleanCurrency,
        paymentType: 'tip',
        paymentMethod: 'mobile',
        email: user?.email || 'support@elicine.app',
        name: user?.name || 'Cinéphile Bienfaiteur',
        description,
        returnUrl: typeof window !== 'undefined' ? `${window.location.origin}/?payment=saspay_success&type=don` : undefined,
        onSuccessRedirect: () => {
          showToast('Merci infiniment pour votre soutien ! ☕');
        }
      });

      console.log("REPONSE SASPAY :", data);

      if (!data || data.success === false) {
        const exactError = formatPaymentErrorMessage(data?.message || data?.error || data, "Échec de l'initialisation du paiement SasaPay.");
        console.error('[App] Échec SasaPay :', exactError, data);
        showToast(exactError);
        return;
      }

      const urlTrouvee = 
        data?.checkout_url ||
        data?.link ||
        data?.paymentUrl ||
        data?.url ||
        data?.data?.checkout_url ||
        data?.data?.link ||
        data?.data?.paymentUrl ||
        extractSaspayRedirectUrl(data);

      if (urlTrouvee) {
        showToast('Redirection immédiate vers SasPay...');
        if (typeof window !== 'undefined') {
          window.location.href = urlTrouvee;
        }
      } else {
        const receivedProps = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'aucune';
        const innerProps = data?.data && typeof data.data === 'object' ? Object.keys(data.data).join(', ') : '';
        const propsDetail = innerProps ? `Propriétés reçues: [${receivedProps}], sous-propriétés data: [${innerProps}]` : `Propriétés reçues: [${receivedProps}]`;
        const missingLinkError = `Lien de redirection SasaPay introuvable (checkout_url ou link manquant). ${propsDetail}. Réponse reçue : ${typeof data === 'object' ? JSON.stringify(data) : data}`;
        console.error('[App]', missingLinkError);
        showToast(`Lien manquant. Propriétés : [${receivedProps}]`);
      }
    } catch (e: any) {
      console.error('[App] Exception initialisation SasaPay :', e);
      const exactError = formatPaymentErrorMessage(e, "Échec de l'initialisation du paiement SasaPay.");
      showToast(`Erreur : ${exactError}`);
    }
  };

  const handleSupportMoneroo = handleSupportSaspay;

  // Route /terms, /reset-password, /update-password detection & browser history synchronization
  useEffect(() => {
    const handleLocation = () => {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      const hash = typeof window !== 'undefined' ? window.location.hash : '';

      if (path === '/terms' || path === '/terms/') {
        setActiveView('terms');
      } else if (
        path === '/reset-password' || 
        path === '/reset-password/' ||
        path === '/update-password' ||
        path === '/update-password/' ||
        hash.includes('type=recovery')
      ) {
        setActiveView('reset-password');
      }
    };

    handleLocation();
    window.addEventListener('popstate', handleLocation);

    // Écoute automatique de l'événement de récupération Supabase Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setActiveView('reset-password');
      }
    });

    return () => {
      window.removeEventListener('popstate', handleLocation);
      subscription.unsubscribe();
    };
  }, [setActiveView]);

  const [heroResetKey, setHeroResetKey] = useState(0);

  // 1. NAVIGATION RETOUR ACCUEIL : Réinitialisation globale de l'application
  const handleResetHome = () => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/terms')) {
      window.history.pushState({}, '', '/');
    }
    setActiveView('home');
    setAiResults(null);
    setSelectedMovie(null);
    setHeroResetKey(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 2. NAVIGATION VERS /terms : Conditions & Confidentialité
  const handleNavigateTerms = (section?: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/terms${section ? `#${section}` : ''}`);
    }
    setActiveView('terms');
    if (section) {
      setTimeout(() => {
        const el = document.getElementById(section);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fc] dark:bg-[#0a0a0a] text-slate-900 dark:text-zinc-100 flex flex-col selection:bg-[#e50914] selection:text-white transition-colors duration-200">
      
      {/* Fixed Header */}
      <Header onGoHome={handleResetHome} onOpenTip={() => setIsTipModalOpen(true)} />

      {/* Main Body Layout (Sidebar + Content) */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        
        {/* Fixed Sidebar */}
        <Sidebar 
          onGoHome={handleResetHome} 
          onOpenDevModal={() => setIsDevModalOpen(true)} 
          onOpenSupport={() => setIsTipModalOpen(true)} 
          onOpenTip={() => setIsTipModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onNavigateTerms={handleNavigateTerms}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-10 overflow-y-auto">
          
          {/* Active View Switcher */}
          {activeView === 'home' && (
            <div className="space-y-10 animate-fade-in">
              
              {/* 1. Central Hero Section with Watermark Carousel & Integrated Search */}
              <HeroSection 
                key={heroResetKey}
                onAiResultsFound={(res) => setAiResults(res)} 
                hasSearched={Boolean(aiResults && aiResults.movies && aiResults.movies.length > 0)}
              />

              {/* 2. AI Generated Results (if a search has been performed) */}
              {aiResults && (
                <MovieGrid
                  title={`✨ ${t.resultsTitle}`}
                  subtitle={t.resultsSubtitle}
                  movies={aiResults.movies}
                  aiThought={aiResults.thought}
                  aiMood={aiResults.mood}
                  suggestedPrompts={aiResults.suggestedPrompts}
                  showAiMatch={true}
                />
              )}

              {/* 3. SECTION BASSE ("🔥 Tendances populaires") */}
              <MovieGrid
                title="🔥 Tendances populaires"
                subtitle="Films et séries les plus visionnés aujourd'hui sur vos plateformes"
                movies={homeTrendingMovies}
                showAiMatch={false}
                sentinelRef={homeTrendingSentinelRef}
                isLoadingMore={homeTrendingLoading}
                hasMore={homeTrendingHasMore}
              />

            </div>
          )}

          {activeView === 'trending' && <TrendingView />}
          {activeView === 'catalog' && <CatalogView />}
          {activeView === 'platforms' && <PlatformsView />}
          {activeView === 'watchlist' && <WatchlistView />}
          {activeView === 'alerts' && <AlertsView />}
          {activeView === 'admin' && <AdminView />}
          {activeView === 'terms' && <TermsView />}
          {(activeView === 'reset-password' || activeView === 'update-password') && <ResetPasswordView />}
          {activeView === 'payment-callback' && <PaymentCallbackView />}

        </main>
      </div>

      {/* Site Footer */}
      <Footer onNavigateTerms={handleNavigateTerms} />

      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-[#141414] border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white text-xs sm:text-sm font-semibold shadow-2xl backdrop-blur-xl">
            <Sparkles className="w-4 h-4 text-[#e50914] flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Modals */}
      <TermsConsentModal />
      <MovieDetailModal />
      <ProModal />
      <TipModal />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
      <AuthModal />
      <ApkInstallModal />
      <ApkDownloadBanner />
      <DevModal
        isOpen={isDevModalOpen}
        onClose={() => setIsDevModalOpen(false)}
      />
      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        onOpenSaspay={handleSupportSaspay}
        onOpenMoneroo={handleSupportSaspay}
        onOpenNotchPay={handleSupportSaspay}
      />
      <SuccessModal
        isOpen={showThankYouModal || successModal.isOpen}
        onClose={() => {
          setShowThankYouModal(false);
          setSuccessModal(prev => ({ ...prev, isOpen: false }));
        }}
        type="tip"
      />

      <ProSuccessModal
        isOpen={isProSuccessModalOpen}
        onClose={() => setIsProSuccessModalOpen(false)}
      />

      {/* Floating Feedback & Suggestions Widget */}
      <FeedbackFloatingWidget onOpenFeedback={openFeedbackModal} />

      {/* Interactive Feedback & Suggestions Popover / Modal */}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        initialCategory={feedbackInitialCategory}
      />

    </div>
  );
};

export default function App() {
  return <AppContent />;
}
