import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Loader2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';
import { askCineIA, executeCinoraSearch, AIRecommendationResult, parseFormatIntent } from '../../services/aiEngine';
import { AdvancedSearchFilters } from './AdvancedSearchFilters';
import { Movie } from '../../types';

interface AISearchBarProps {
  onResultsFound: (results: {
    movies: Movie[];
    thought: string;
    mood: string;
    suggestedPrompts: string[];
  }) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const AISearchBar: React.FC<AISearchBarProps> = ({
  onResultsFound,
  isLoading,
  setIsLoading
}) => {
  const {
    quota,
    canPerformSearch,
    recordSuccessfulSearch,
    apiSettings,
    user,
    addHistoryItem,
    showToast,
    setIsProModalOpen
  } = useApp();
  const { t } = useTranslation();

  const [prompt, setPrompt] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [selectedMinRating, setSelectedMinRating] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  const samplePrompts = [
    '🌧️ Thriller sombre sous la pluie avec un twist final',
    '🚀 Odyssée spatiale contemplative et grandiose',
    '🍿 Comédie feel-good réconfortante et pleine d\'esprit',
    '🌃 Polar cyberpunk néon avec bande-son envoûtante'
  ];

  const handleSearch = async (textToSearch?: string) => {
    const query = (textToSearch || prompt).trim().slice(0, 350);

    if (!query) {
      showToast('Veuillez décrire le film ou l\'ambiance souhaitée.');
      return;
    }

    // Vérification du quota avant lancement
    if (!canPerformSearch()) {
      return;
    }

    const formatIntent = parseFormatIntent(query);
    const mediaTypeToUse = formatIntent.mediaType === 'tv' 
      ? 'Séries TV' 
      : (formatIntent.mediaType === 'movie' ? 'Films' : 'Tous');

    setIsLoading(true);
    setHasSearched(true);
    try {
      const result: AIRecommendationResult = await executeCinoraSearch(
        query, 
        apiSettings,
        undefined,
        undefined,
        {
          platform: user?.isPro ? selectedPlatform : 'all',
          minRating: user?.isPro ? selectedMinRating : 0,
          mediaType: mediaTypeToUse
        }
      );
      
      // Enregistrement de la recherche réussie
      await recordSuccessfulSearch();

      addHistoryItem(query, result.recommendedMovies.length, result.moodDetected);
      onResultsFound({
        movies: result.recommendedMovies,
        thought: result.thought,
        mood: result.moodDetected,
        suggestedPrompts: result.suggestedPrompts
      });
      if (result.recommendedMovies.length === 0) {
        showToast(result.thought || "Aucun film ne correspond précisément à votre recherche.");
      } else if (result.isFallbackMode) {
        showToast(result.thought || `🔍 ${result.recommendedMovies.length} suggestions trouvées en recherche élargie !`);
      } else if (mediaTypeToUse === 'Séries TV') {
        showToast(`📺 ${result.recommendedMovies.length} série${result.recommendedMovies.length > 1 ? 's' : ''} trouvée${result.recommendedMovies.length > 1 ? 's' : ''} par l'algorithme !`);
      } else if (result.recommendedMovies.length <= 2) {
        showToast(`🎯 ${result.recommendedMovies.length} correspondance${result.recommendedMovies.length > 1 ? 's' : ''} exacte${result.recommendedMovies.length > 1 ? 's' : ''} identifiée${result.recommendedMovies.length > 1 ? 's' : ''} !`);
      } else if (result.recommendedMovies.length >= 10) {
        showToast(`🎬 Sélection élargie de ${result.recommendedMovies.length} œuvres trouvées !`);
      } else {
        showToast(`✨ Éliciné a trouvé ${result.recommendedMovies.length} correspondances parfaites !`);
      }
    } catch (err: any) {
      console.error(err);
      showToast('Une erreur est survenue lors de la recherche.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="w-full space-y-4">
      
      {/* Main AI Input Bar with glowing cinema effect */}
      <div className="flex flex-col gap-1.5">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-amber-500 rounded-2xl blur-md opacity-40 group-hover:opacity-75 transition duration-500 group-focus-within:opacity-100" />
          
          <div className="relative flex items-center bg-white dark:bg-[#0d1322] border border-slate-200 dark:border-white/15 rounded-2xl p-1.5 sm:p-2 shadow-md dark:shadow-2xl backdrop-blur-xl">
            
            {/* AI Icon with Sparkles */}
            <div className="flex items-center justify-center pl-3 pr-2 text-blue-500 dark:text-blue-400 flex-shrink-0">
              <Sparkles className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            </div>

            {/* Input text avec limite 350 caractères */}
            <input
              type="text"
              maxLength={350}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 350))}
              onPaste={(e) => {
                e.preventDefault();
                const text = e.clipboardData.getData('text') || '';
                const current = prompt;
                const target = e.currentTarget;
                const start = target.selectionStart ?? current.length;
                const end = target.selectionEnd ?? current.length;
                const next = (current.slice(0, start) + text + current.slice(end)).slice(0, 350);
                setPrompt(next);
                if (current.length + text.length > 350) {
                  showToast('Texte collé tronqué à la limite de 350 caractères.');
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={isMobile ? (t.searchPlaceholderShort || "Ambiance, thème, acteur...") : (t.searchPlaceholder || "Décrivez une ambiance, un thème ou un acteur...")}
              className="flex-1 w-full bg-transparent text-slate-900 dark:text-white placeholder-slate-400 text-sm sm:text-base outline-none px-1 py-1.5 sm:py-2 min-w-0 font-normal"
              disabled={isLoading}
            />

            {/* Explorer Action Button & Compteur de caractères intégré */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Compteur discret façon X/Twitter : masqué par défaut, apparaît à l'approche de la limite (>= 280) */}
              {prompt.length >= 280 && (
                <span
                  className={`text-[11px] tabular-nums font-mono px-1.5 py-0.5 rounded transition-all select-none ${
                    prompt.length >= 350
                      ? 'text-rose-500 bg-rose-500/15 border border-rose-500/30 font-bold'
                      : 'text-amber-500 bg-amber-500/15 border border-amber-500/30 font-medium'
                  }`}
                  title={`${350 - prompt.length} caractères restants (limite : 350)`}
                >
                  {350 - prompt.length}
                </span>
              )}

              <button
                type="button"
                onClick={() => handleSearch()}
                disabled={isLoading}
                className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white font-medium text-xs sm:text-sm flex items-center gap-1 sm:gap-1.5 shadow-md shadow-blue-500/25 hover:opacity-95 active:scale-95 transition-transform disabled:opacity-50 cursor-pointer flex-shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-white" />
                ) : (
                  <span>✨</span>
                )}
                <span className="hidden sm:inline">
                  {isLoading ? 'Recherche...' : (t.exploreBtn || 'Explorer')}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Ligne d'état discrète sous le champ de saisie : Quota journalier uniquement */}
        <div className="flex items-center px-2 text-[11px]">
          {/* Texte discret de quota journalier mis à jour en temps réel */}
          <div className="flex items-center gap-1.5 text-[11px] select-none text-left min-w-0">
            {(user?.isPro || (user as any)?.is_pro || (user as any)?.pass_status === 'pro' || (user?.email && user.email.toLowerCase() === 'ivanjoris959@gmail.com')) ? (
              <span className="text-amber-500 dark:text-amber-400 font-medium flex items-center gap-1 truncate">
                <span>👑</span>
                <span>Pass Pro actif • Recherches illimitées</span>
              </span>
            ) : quota.remaining > 0 ? (
              <span className="text-slate-500 dark:text-zinc-400 flex items-center gap-1 truncate">
                <span className="text-amber-500">⚡</span>
                <span>
                  Il vous reste <strong className="text-slate-800 dark:text-zinc-200 font-semibold">{quota.remaining}</strong> recherche{quota.remaining > 1 ? 's' : ''} gratuite{quota.remaining > 1 ? 's' : ''} aujourd'hui
                </span>
              </span>
            ) : (
              <span className="text-rose-500 dark:text-rose-400 font-medium flex items-center gap-1.5 flex-wrap">
                <span>🔒</span>
                <span>Quota gratuit atteint (0 recherche restante) •</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsProModalOpen(true);
                  }}
                  className="text-amber-600 dark:text-amber-400 hover:underline underline-offset-2 font-semibold cursor-pointer transition-colors"
                >
                  Passer au compte Pro (1.99 $)
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filtres Avancés Pro (Plateformes & Notes minimales) - Masqué par défaut, affiché uniquement après recherche */}
      <div 
        id="aisearch-advanced-filters"
        className={`w-full transition-all duration-300 ${
          (hasSearched || isLoading) ? 'block animate-fade-in' : 'hidden'
        }`}
        style={{ display: (hasSearched || isLoading) ? undefined : 'none' }}
      >
        {(hasSearched || isLoading) && (
          <AdvancedSearchFilters
            selectedPlatform={selectedPlatform}
            onSelectPlatform={(p) => setSelectedPlatform(p)}
            selectedMinRating={selectedMinRating}
            onSelectMinRating={(r) => setSelectedMinRating(r)}
            isPro={Boolean(user?.isPro || (user as any)?.is_pro || (user as any)?.pass_status === 'pro' || (user?.email && user.email.toLowerCase() === 'ivanjoris959@gmail.com'))}
            onTriggerProModal={() => {
              showToast("👑 Les filtres avancés (Plateformes & Notes) sont réservés aux abonnés Pro (1.99$).");
              setIsProModalOpen(true);
            }}
          />
        )}
      </div>

      {/* Suggested Quick Tags */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
        <span className="text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap pl-1">Exemples :</span>
        {samplePrompts.map((tag) => (
          <button
            key={tag}
            onClick={() => {
              setPrompt(tag);
              handleSearch(tag);
            }}
            className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white border border-slate-200 dark:border-slate-700/60 hover:border-blue-500/40 whitespace-nowrap transition-all text-xs font-medium cursor-pointer"
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
};

export default AISearchBar;
