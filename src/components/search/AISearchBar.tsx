import React, { useState } from 'react';
import { 
  Sparkles, 
  Search, 
  Zap, 
  ArrowRight, 
  Loader2, 
  Crown, 
  SlidersHorizontal 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { askCineIA, AIRecommendationResult } from '../../services/aiEngine';
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
    useAiQuota,
    apiSettings,
    user,
    addHistoryItem,
    showToast,
    setIsProModalOpen
  } = useApp();

  const [prompt, setPrompt] = useState('');

  const samplePrompts = [
    '🌧️ Thriller sombre sous la pluie avec un twist final',
    '🚀 Odyssée spatiale contemplative et grandiose',
    '🍿 Comédie feel-good réconfortante et pleine d\'esprit',
    '🌃 Polar cyberpunk néon avec bande-son envoûtante'
  ];

  const handleSearch = async (textToSearch?: string) => {
    const query = (textToSearch || prompt).trim();
    if (!query) {
      showToast('Veuillez décrire le film ou l\'ambiance souhaitée.');
      return;
    }

    // Check & decrement quota
    const permitted = useAiQuota();
    if (!permitted) {
      // Pass Pro modal opened automatically in useAiQuota
      return;
    }

    setIsLoading(true);
    try {
      const result: AIRecommendationResult = await askCineIA(query, apiSettings);
      addHistoryItem(query, result.recommendedMovies.length, result.moodDetected);
      onResultsFound({
        movies: result.recommendedMovies,
        thought: result.thought,
        mood: result.moodDetected,
        suggestedPrompts: result.suggestedPrompts
      });
      showToast(`✨ CinéIA a trouvé ${result.recommendedMovies.length} correspondances parfaites !`);
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
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-amber-500 rounded-2xl blur-md opacity-40 group-hover:opacity-75 transition duration-500 group-focus-within:opacity-100" />
        
        <div className="relative flex items-center bg-white dark:bg-[#0d1322] border border-slate-200 dark:border-white/15 rounded-2xl p-2 sm:p-2.5 shadow-md dark:shadow-2xl backdrop-blur-xl">
          
          {/* AI Icon with Sparkles */}
          <div className="flex items-center justify-center pl-3 pr-2 text-blue-500 dark:text-blue-400">
            <Sparkles className="w-6 h-6 animate-pulse text-amber-500 dark:text-amber-400" />
          </div>

          {/* Input text */}
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez une émotion, une ambiance, un décor (ex: un thriller psychologique sous la pluie)..."
            className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 text-sm sm:text-base outline-none px-2 py-1 font-normal"
            disabled={isLoading}
          />

          {/* Quota Indicator */}
          <div className="hidden sm:flex items-center mr-2">
            {user?.isPro ? (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-bold flex items-center gap-1">
                <Crown className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                Illimité
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setIsProModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-xs font-bold flex items-center gap-1 transition-colors"
                title="Vos crédits IA gratuits du jour"
              >
                <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                <span>⚡ {quota.remaining}/3 IA</span>
              </button>
            )}
          </div>

          {/* Submit Search Button */}
          <button
            onClick={() => handleSearch()}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-sm shadow-md dark:shadow-neon-blue flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Recherche IA...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Découvrir</span>
              </>
            )}
          </button>
        </div>
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
