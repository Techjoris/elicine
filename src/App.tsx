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

// Modals
import { MovieDetailModal } from './components/modals/MovieDetailModal';
import { ProModal } from './components/modals/ProModal';
import { TipModal } from './components/modals/TipModal';
import { APIKeysModal } from './components/modals/APIKeysModal';
import { AuthModal } from './components/modals/AuthModal';
import { SuccessModal } from './components/modals/SuccessModal';
import { ApkInstallModal } from './components/modals/ApkInstallModal';
import { DevModal } from './components/DevModal';
import { SupportModal } from './components/SupportModal';
import { processNotchPayCheckout } from './services/payment';

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
    user 
  } = useApp();

  const { t } = useTranslation();

  const [aiResults, setAiResults] = useState<{
    movies: Movie[];
    thought?: string;
    mood?: string;
    suggestedPrompts?: string[];
  } | null>(null);

  // Success Thank-you modal state
  const [successModal, setSuccessModal] = useState<{
    isOpen: boolean;
    type: 'pro' | 'tip';
  }>({
    isOpen: false,
    type: 'pro'
  });

  const [isDevModalOpen, setIsDevModalOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  // Intercept ?payment=success callback from Notch Pay
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const paymentType = (urlParams.get('type') || 'pro') as 'pro' | 'tip';

    if (paymentStatus === 'success') {
      if (paymentType === 'pro') {
        upgradeToPro('yearly');
      }
      setSuccessModal({
        isOpen: true,
        type: paymentType
      });

      // Clean the URL without page reload
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

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

  const handleSupportNotchPay = async ({ amount, currency, description }: { amount: number; currency: string; description: string }) => {
    try {
      const result = await processNotchPayCheckout({
        amount,
        currency: (currency as any) || 'XAF',
        paymentType: 'tip',
        paymentMethod: 'mobile',
        email: user?.email || 'user@cineia.com',
        name: user?.name || 'Cinéphile Bienfaiteur',
        description,
        publicKey: apiSettings.notchPayPublicKey,
        hashKey: apiSettings.notchPayHashKey,
        isTestMode: apiSettings.apiMode === 'test',
        onSuccessRedirect: () => {
          showToast('Merci infiniment pour votre soutien ! ☕');
        }
      });

      if (result.paymentUrl) {
        showToast('Redirection vers Notch Pay...');
      } else {
        showToast(result.message);
      }
    } catch (e) {
      console.error(e);
      showToast('Erreur de connexion avec Notch Pay.');
    }
  };

  const [heroResetKey, setHeroResetKey] = useState(0);

  // 1. NAVIGATION RETOUR ACCUEIL : Réinitialisation globale de l'application
  const handleResetHome = () => {
    setActiveView('home');
    setAiResults(null);
    setSelectedMovie(null);
    setHeroResetKey(prev => prev + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      
      {/* Fixed Header */}
      <Header onGoHome={handleResetHome} />

      {/* Main Body Layout (Sidebar + Content) */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        
        {/* Fixed Sidebar */}
        <Sidebar 
          onGoHome={handleResetHome} 
          onOpenDevModal={() => setIsDevModalOpen(true)} 
          onOpenSupport={() => setIsSupportOpen(true)} 
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

        </main>
      </div>

      {/* Toast Notification Container */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#0f141f] border border-[#1e293b] text-white text-xs sm:text-sm font-semibold shadow-2xl backdrop-blur-xl">
            <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Modals */}
      <MovieDetailModal />
      <ProModal />
      <TipModal />
      <APIKeysModal />
      <AuthModal />
      <ApkInstallModal />
      <DevModal
        isOpen={isDevModalOpen}
        onClose={() => setIsDevModalOpen(false)}
      />
      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        onOpenNotchPay={handleSupportNotchPay}
      />
      <SuccessModal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal(prev => ({ ...prev, isOpen: false }))}
        type={successModal.type}
      />

    </div>
  );
};

export default function App() {
  return <AppContent />;
}
