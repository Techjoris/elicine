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

    // Check & decrement quota (bypassed)
    useAiQuota();

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
        
        <div className="relative flex items-center bg-white dark:bg-[#0d1322] border border-slate-200 dark:border-white/15 rounded-2xl p-1.5 sm:p-2 shadow-md dark:shadow-2xl backdrop-blur-xl">
          
          {/* AI Icon with Sparkles */}
          <div className="flex items-center justify-center pl-3 pr-2 text-blue-500 dark:text-blue-400 flex-shrink-0">
            <Sparkles className="w-5 h-5 text-amber-500 dark:text-amber-400" />
          </div>

          {/* Input text */}
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez une émotion, une ambiance, un décor..."
            className="flex-1 bg-transparent text-slate-900 dark:text-white placeholder-slate-400 text-sm sm:text-base outline-none px-1 py-2 min-w-0 font-normal"
            disabled={isLoading}
          />

          {/* Integrated Quota Badge + Explorer Button inside the pill */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Quota Badge */}
            <button
              type="button"
              onClick={() => setIsProModalOpen(true)}
              title="Exploration IA illimitée"
              className="text-[11px] font-semibold px-2 py-1 sm:py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20"
            >
              <span>⚡</span>
              <span className="font-bold">Illimité</span>
            </button>

            {/* Explorer Button */}
            <button
              type="button"
              onClick={() => handleSearch()}
              disabled={isLoading}
              className="px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white font-medium text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-blue-500/25 hover:opacity-95 active:scale-95 transition-transform disabled:opacity-50 cursor-pointer flex-shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <span>✨</span>
              )}
              <span className="hidden xs:inline sm:inline">
                {isLoading ? 'Recherche...' : 'Explorer'}
              </span>
            </button>
          </div>
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
