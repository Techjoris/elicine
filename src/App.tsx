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
import { processMonerooCheckout, extractMonerooRedirectUrl } from './services/payment';

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
    isThankYouModalOpen,
    setIsThankYouModalOpen,
    isProSuccessModalOpen,
    setIsProSuccessModalOpen,
    isTipModalOpen,
    setIsTipModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen
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

  // Intercept payment return URL params and route to the correct modal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // --- PRO SUBSCRIPTION SUCCESS ---
    // Triggered by ?subscription=pro_success OR ?payment=pro_success OR ?payment_status=success&type=pro
    const isProSuccess =
      params.get('subscription') === 'pro_success' ||
      params.get('payment') === 'pro_success' ||
      (params.get('payment_status') === 'success' && params.get('type') === 'pro');

    // --- TIP / DONATION SUCCESS ---
    // Triggered by ?payment=success OR ?tip=success OR ?payment=moneroo_success OR ?payment_status=success&type=don
    const isTipSuccess =
      (params.get('payment') === 'success' && params.get('subscription') !== 'pro_success') ||
      params.get('payment') === 'moneroo_success' ||
      (params.get('payment_status') === 'success' && params.get('type') === 'don') ||
      params.get('tip') === 'success';

    if (isProSuccess) {
      // 1. Activate Pro immediately in state & localStorage
      upgradeToPro('yearly');
      // 2. Open the dedicated Pro welcome modal
      setIsProSuccessModalOpen(true);
      // 3. Clean URL so refresh doesn't re-trigger
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (isTipSuccess) {
      // Show the donation thank-you modal
      setShowThankYouModal(true);
      setSuccessModal({ isOpen: true, type: 'tip' });
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [upgradeToPro, setIsProSuccessModalOpen]);

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
    }
  }, [setActiveView]);

  // Synchronisation de l'URL avec activeView
  useEffect(() => {
    if (activeView === 'admin') {
      if (window.location.pathname !== '/admin') {
        window.history.pushState(null, '', '/admin');
      }
    } else if (window.location.pathname === '/admin') {
      window.history.pushState(null, '', '/');
    }
  }, [activeView]);

  const handleSupportMoneroo = async ({ amount, currency, description }: { amount: number; currency: string; description: string }) => {
    try {
      console.log('[App] Initialisation soutien Moneroo :', { amount, currency });
      const data = await processMonerooCheckout({
        amount,
        currency: (currency as any) || 'XAF',
        paymentType: 'tip',
        paymentMethod: 'mobile',
        email: user?.email || 'contact@elicine.com',
        name: user?.name || 'Cinéphile Bienfaiteur',
        description,
        returnUrl: typeof window !== 'undefined' ? `${window.location.origin}/?payment=moneroo_success&type=don` : undefined,
        onSuccessRedirect: () => {
          showToast('Merci infiniment pour votre soutien ! ☕');
        }
      });

      console.log("REPONSE MONEROO :", data);

      if (!data || data.success === false) {
        const receivedKeys = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'aucune';
        const exactError = data?.message || data?.error || `Échec de l'initialisation du paiement Moneroo (propriétés reçues : [${receivedKeys}]).`;
        console.error('[App] Échec Moneroo :', exactError, data);
        showToast(exactError);
        alert(`Erreur Moneroo : ${exactError}`);
        return;
      }

      const urlTrouvee = 
        data?.checkout_url ||
        data?.link ||
        data?.data?.checkout_url ||
        data?.data?.link ||
        data?.url ||
        data?.paymentUrl ||
        extractMonerooRedirectUrl(data);

      if (urlTrouvee) {
        showToast('Redirection immédiate vers Moneroo...');
        if (typeof window !== 'undefined') {
          window.location.href = urlTrouvee;
        }
      } else {
        const receivedProps = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'aucune';
        const innerProps = data?.data && typeof data.data === 'object' ? Object.keys(data.data).join(', ') : '';
        const propsDetail = innerProps ? `Propriétés reçues: [${receivedProps}], sous-propriétés data: [${innerProps}]` : `Propriétés reçues: [${receivedProps}]`;
        const missingLinkError = `Lien de redirection Moneroo introuvable (checkout_url ou link manquant). ${propsDetail}. Réponse reçue : ${JSON.stringify(data)}`;
        console.error('[App]', missingLinkError);
        showToast(`Lien manquant. Propriétés : [${receivedProps}]`);
        alert(`Erreur de redirection Moneroo :\n${missingLinkError}`);
      }
    } catch (e: any) {
      console.error('[App] Exception initialisation Moneroo :', e);
      const exactError = e?.message || String(e) || "Échec de l'initialisation du paiement Moneroo.";
      showToast(`Erreur : ${exactError}`);
      alert(`Erreur de paiement Moneroo :\n${exactError}`);
    }
  };

  // Route /terms detection & browser history synchronization
  useEffect(() => {
    const handleLocation = () => {
      const path = typeof window !== 'undefined' ? window.location.pathname : '';
      if (path === '/terms' || path === '/terms/') {
        setActiveView('terms');
      } else if (path === '/reset-password' || path === '/reset-password/') {
        setActiveView('reset-password');
      }
    };

    handleLocation();
    window.addEventListener('popstate', handleLocation);
    return () => window.removeEventListener('popstate', handleLocation);
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
              />

              {/* 2. AI Generated Results (if a search has been performed) */}
              {aiResults && (
                <MovieGrid
                  title={`✨ ${t.resultsTitle}`}
                  subtitle={t.resultsSubtitle}
                  movies={aiResults.movies}
                  aiThought={aiResults.thought}
                  aiMood={aiResults.mood}
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
          {activeView === 'reset-password' && <ResetPasswordView />}

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
        onOpenMoneroo={handleSupportMoneroo}
        onOpenNotchPay={handleSupportMoneroo}
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

    </div>
  );
};

export default function App() {
  return <AppContent />;
}
