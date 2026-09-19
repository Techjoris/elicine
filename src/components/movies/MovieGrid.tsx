import React from 'react';
import { MovieCard } from './MovieCard';
import { Movie } from '../../types';
import { Sparkles, Clapperboard, HelpCircle, Compass, ArrowRight, Film } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../context/LanguageContext';

interface MovieGridProps {
  title?: string;
  subtitle?: string;
  movies: Movie[];
  aiThought?: string;
  aiMood?: string;
  showAiMatch?: boolean;
  /** Optional sentinel ref for infinite scroll (pass from useInfiniteCatalog) */
  sentinelRef?: React.RefCallback<HTMLDivElement>;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  suggestedPrompts?: string[];
  onSelectPrompt?: (prompt: string) => void;
}

const DEFAULT_CURATED_PROMPTS = [
  "Un voyage dans l'espace avec des trous noirs",
  "Un film de braquage qui tourne mal",
  "Un thriller psychologique sombre sous la pluie",
  "Une comédie romantique feel-good à New York",
  "Une enquête policière pleine de faux-semblants",
  "Un film de science-fiction avec une IA consciente"
];

/** Discreet dark cinema animated skeleton card */
const MovieCardSkeleton: React.FC = () => (
  <div className="flex flex-col rounded-xl bg-slate-100 dark:bg-[#121212] border border-slate-200 dark:border-white/[0.06] overflow-hidden animate-pulse">
    <div className="aspect-[2/3] w-full bg-slate-200 dark:bg-zinc-900/60 relative">
      <div className="absolute inset-0 bg-gradient-to-t from-slate-100 dark:from-[#121212] via-transparent to-transparent" />
    </div>
    <div className="p-3.5 space-y-2.5">
      <div className="h-3.5 bg-slate-300 dark:bg-zinc-800/80 rounded w-3/4" />
      <div className="flex items-center justify-between pt-1">
        <div className="h-2.5 bg-slate-200 dark:bg-zinc-800/50 rounded w-1/3" />
        <div className="h-2.5 bg-slate-200 dark:bg-zinc-800/50 rounded w-1/4" />
      </div>
    </div>
  </div>
);

export const MovieGrid: React.FC<MovieGridProps> = ({
  title,
  subtitle,
  movies,
  aiThought,
  aiMood,
  showAiMatch = false,
  sentinelRef,
  isLoadingMore = false,
  hasMore = false,
  suggestedPrompts,
  onSelectPrompt
}) => {
  const { openFeedbackModal } = useApp();
  const { t } = useTranslation();
  const displayTitle = title || t('sections.trending_title') || t.trendingTitle;

  const promptsToDisplay = React.useMemo(() => {
    const list: string[] = [];
    if (suggestedPrompts && Array.isArray(suggestedPrompts)) {
      suggestedPrompts.forEach((p) => {
        const clean = typeof p === 'string' ? p.trim() : '';
        if (clean && !list.includes(clean)) {
          list.push(clean);
        }
      });
    }
    DEFAULT_CURATED_PROMPTS.forEach((p) => {
      if (!list.includes(p)) {
        list.push(p);
      }
    });
    return list.slice(0, 6);
  }, [suggestedPrompts]);

  const handleSelectPrompt = (promptText: string) => {
    if (onSelectPrompt) {
      onSelectPrompt(promptText);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('elicine-trigger-search', { detail: { prompt: promptText } })
      );
    }
  };

  const cleanThought = React.useMemo(() => {
    if (!aiThought) return '';
    return aiThought
      .trim()
      // Enlève les guillemets englobants superflus au début et à la fin
      .replace(/^["'«»]\s*|\s*["'«»]$/g, '')
      // Corrige tout guillemet doublé accidentel (ex: "" -> ")
      .replace(/""+/g, '"')
      .replace(/««+/g, '«')
      .replace(/»»+/g, '»')
      .replace(/Recherche Intelligente LLM/gi, 'Sélection Éliciné')
      .replace(/Recherche par contexte IA/gi, 'Sélection Éliciné')
      .replace(/Recherche sémantique vectorielle/gi, 'Algorithme Éliciné')
      .replace(/RECOMMANDATION IA \(TMDB\)/gi, 'RECOMMANDATION ÉLICINÉ')
      .replace(/RECOMMANDATION IA/gi, 'RECOMMANDATION ÉLICINÉ')
      .replace(/\bTMDB\b/gi, 'Éliciné')
      .replace(/\bLLM\b/gi, 'Éliciné')
      .replace(/\s*\(Niveau\s*\d+\)/gi, '')
      .replace(/^Vision\s*&\s*Recommandation\s*Éliciné\s*[—:-]?\s*/i, '')
      .replace(/^Atmosph[eè]re\s*:\s*/i, '')
      .trim();
  }, [aiThought]);

  const isTransparencyNotice = React.useMemo(() => {
    return cleanThought.toLowerCase().includes('aucun film') && (cleanThought.toLowerCase().includes('strict') || cleanThought.toLowerCase().includes('catalogue'));
  }, [cleanThought]);

  return (
    <section id="results-section" className="w-full space-y-6">

      {/* Thought Banner Épuré / Transparence IA */}
      {cleanThought && (
        <div className={`p-4 sm:p-6 rounded-2xl border space-y-2.5 shadow-sm dark:shadow-xl transition-all ${
          isTransparencyNotice
            ? 'bg-amber-500/[0.07] dark:bg-amber-500/[0.05] border-amber-500/30 dark:border-amber-500/20 text-amber-900 dark:text-amber-200'
            : 'bg-white dark:bg-[#121212] border-slate-200 dark:border-white/10'
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
              isTransparencyNotice ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'
            }`}>
              <Sparkles className={`w-3.5 h-3.5 ${isTransparencyNotice ? 'text-amber-500' : 'text-[#e50914]'}`} />
              {isTransparencyNotice ? 'Transparence IA Éliciné' : 'Vision & Recommandation Éliciné'}
            </span>
            {aiMood && !isTransparencyNotice && (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-white/10 font-medium">
                {aiMood.length > 25 || cleanThought.toLowerCase().includes(aiMood.toLowerCase()) || /^(drame|thriller|action|comédie|comedie|romance|horreur|science-fiction|aventure)/i.test(aiMood.trim())
                  ? 'Curation éditoriale'
                  : (aiMood.trim().toLowerCase().startsWith('atmosphère') ? aiMood : `Atmosphère : ${aiMood}`)}
              </span>
            )}
          </div>
          <p className={`text-xs sm:text-sm leading-relaxed ${
            isTransparencyNotice ? 'font-medium not-italic text-slate-800 dark:text-zinc-200' : 'text-slate-700 dark:text-zinc-300 italic'
          }`}>
            {cleanThought}
          </p>
        </div>
      )}

      {/* Section Header - Typographie asymétrique imposante */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 pt-2 border-b border-slate-200/80 dark:border-white/[0.06] pb-3">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
            {displayTitle}
          </h2>
          {subtitle && <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          {showAiMatch && (
            <button
              type="button"
              onClick={() => openFeedbackModal('ai_bug')}
              className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 font-medium transition-all flex items-center gap-1.5 cursor-pointer"
              title={t.suggestReportTooltip || "Signaler un résultat imprécis ou suggérer un film"}
            >
              <Clapperboard className="w-3 h-3 text-[#e50914]" />
              <span>{t('actions.suggest_report') || t.suggestReport}</span>
            </button>
          )}

          <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-400 font-medium">
            {movies.length} {movies.length !== 1 ? (t.titlesPlural || 'titres') : (t.titlesSingular || 'titre')}
          </span>
        </div>
      </div>

      {/* Grid — posters immersifs ou Zero State enrichi */}
      {movies.length === 0 && !isLoadingMore && !hasMore ? (
        <div className="rounded-2xl sm:rounded-3xl bg-gradient-to-b from-white to-slate-50 dark:from-[#131313] dark:to-[#0a0a0a] border border-slate-200 dark:border-white/[0.08] p-6 sm:p-10 shadow-lg dark:shadow-2xl relative overflow-hidden space-y-8 animate-fade-in text-center">
          {/* Subtle glowing halo accent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 sm:w-96 h-72 sm:h-96 bg-[#e50914]/10 rounded-full blur-3xl pointer-events-none" />

          {/* 1. Message engageant et narratif */}
          <div className="relative z-10 max-w-2xl mx-auto space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#e50914]/10 border border-[#e50914]/20 text-[#e50914] shadow-inner mb-1">
              <Sparkles className="w-7 h-7 animate-pulse" />
            </div>

            <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-snug">
              {t.noMatchTitle || "Aucun film ne correspond précisément à votre recherche..."}
            </h3>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed max-w-xl mx-auto">
              {t.noMatchDesc || "Aucune œuvre de notre catalogue ne réunit l'ensemble des critères demandés sans compromis sur la pertinence. Essayez d'élargir votre formulation, de dissocier vos critères ou d'explorer nos inspirations cinéphiles ci-dessous."}
            </p>
          </div>

          {/* 2. Suggestions dynamiques en un clic */}
          <div className="relative z-10 space-y-3.5 max-w-4xl mx-auto text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              <Compass className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span>{t.inspirationsTitle || "Inspirations cinéphiles à explorer en 1 clic"}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {promptsToDisplay.map((promptText, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectPrompt(promptText)}
                  className="group flex items-center justify-between gap-2.5 p-3.5 rounded-xl bg-white dark:bg-[#181818] border border-slate-200 dark:border-white/10 hover:border-[#e50914]/60 dark:hover:border-[#e50914]/60 hover:bg-slate-50 dark:hover:bg-[#202020] shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer hover:scale-[1.01] active:scale-[0.99] text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-zinc-400 group-hover:text-[#e50914] group-hover:bg-[#e50914]/10 flex items-center justify-center text-xs font-bold transition-colors">
                      {idx + 1}
                    </span>
                    <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-zinc-200 group-hover:text-slate-900 dark:group-hover:text-white line-clamp-2 transition-colors">
                      "{promptText}"
                    </span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 dark:text-zinc-500 group-hover:text-[#e50914] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Ligne de séparation épurée */}
          <div className="relative z-10 max-w-3xl mx-auto border-t border-slate-200 dark:border-white/10" />

          {/* 3. Mise en valeur élégante de la suggestion à l'équipe */}
          <div className="relative z-10 max-w-3xl mx-auto">
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-100/80 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Film className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t.missingTitle || "Votre film ou votre série manque à l'appel ?"}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-zinc-400">
                    {t.missingDesc || "Notre catalogue s'enrichit chaque jour grâce à la communauté. Dites-nous quelle œuvre ajouter en priorité !"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openFeedbackModal('missing_movie')}
                className="w-full sm:w-auto flex-shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#e50914] hover:bg-[#b80710] text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
              >
                <Clapperboard className="w-4 h-4" />
                <span>{t.proposeMovieBtn || "Proposer ce film à l'équipe"}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 sm:gap-6">
          {movies.map((movie) => (
            <MovieCard key={`${movie.media_type || 'item'}-${movie.id}`} movie={movie} showAiMatch={showAiMatch} />
          ))}

          {/* Seamless skeleton placeholders during background fetch */}
          {isLoadingMore && (
            <>
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              <MovieCardSkeleton />
              {movies.length === 0 && (
                <>
                  <MovieCardSkeleton />
                  <MovieCardSkeleton />
                  <MovieCardSkeleton />
                  <MovieCardSkeleton />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Invisible sentinel for aggressive prefetch */}
      {sentinelRef && (
        <div ref={sentinelRef} className="h-6 w-full -mt-2">
          {!hasMore && movies.length > 0 && !isLoadingMore && (
            <p className="text-xs text-slate-500 dark:text-zinc-600 font-medium text-center py-6">
              — Fin du catalogue —
            </p>
          )}
        </div>
      )}

    </section>
  );
};
