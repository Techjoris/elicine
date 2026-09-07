import { TermsTranslations, ConsentModalTranslations } from './termsTypes';
import { termsFr, consentModalFr } from './locales/fr';
import { termsEn, consentModalEn } from './locales/en';
import { termsEs, consentModalEs } from './locales/es';
import { termsDe, consentModalDe } from './locales/de';
import { termsIt, consentModalIt } from './locales/it';

export * from './termsTypes';

export type Language = 'fr' | 'en' | 'es' | 'de' | 'it';

export interface TranslationSchema {
  tagline: string;
  searchPlaceholder: string;
  exploreBtn: string;
  featuredBadge: string;
  trailerBtn: string;
  myListBtn: string;
  alertBtn: string;
  filterAll: string;
  filterMovies: string;
  filterSeries: string;
  aiAnalysisBadge: string;
  resultsTitle: string;
  resultsSubtitle: string;
  badgeFilm: string;
  badgeSerie: string;
  streamingSection: string;
  availableOn: string;
  vpnNeededTitle: string;
  vpnNeededDesc: string;
  vpnButton: string;
  vodSection: string;
  vodOnlyMessage: string;
  synopsisTitle: string;
  critiqueTitle: string;
  resetHome: string;
  tmdbLang: string;
  aiPromptLang: string;
  // Sections légales i18n
  terms: TermsTranslations;
  consentModal: ConsentModalTranslations;
}

const baseTranslations: Record<Language, TranslationSchema> = {
  fr: {
    tagline: "Le cinéma d'exception, élu pour vous.",
    searchPlaceholder: "Décrivez une ambiance, une émotion...",
    exploreBtn: "Explorer",
    featuredBadge: "À L'AFFICHE",
    trailerBtn: "Bande-annonce",
    myListBtn: "Ma Liste",
    alertBtn: "Alerte",
    filterAll: "Tous",
    filterMovies: "Films",
    filterSeries: "Séries TV",
    aiAnalysisBadge: "Analyse Éliciné AI en direct",
    resultsTitle: "Résultats & Recommandations IA",
    resultsSubtitle: "Sélection intelligente personnalisée selon vos critères",
    badgeFilm: "FILM",
    badgeSerie: "SÉRIE",
    streamingSection: "Où regarder en streaming",
    availableOn: "Disponible sur",
    vpnNeededTitle: "Exclusivité étrangère",
    vpnNeededDesc: "Non disponible dans votre pays. Accessible via VPN sur le catalogue",
    vpnButton: "Accéder via VPN",
    vodSection: "Disponible à la location ou à l'achat (VOD)",
    vodOnlyMessage: "Non inclus dans les abonnements de streaming actuels.",
    synopsisTitle: "SYNOPSIS",
    critiqueTitle: "VISION CRITIQUE ÉLICINÉ",
    resetHome: "Accueil",
    tmdbLang: "fr-FR",
    aiPromptLang: "Réponds STRICTEMENT en français pour les descriptions et raisons.",
    terms: termsFr,
    consentModal: consentModalFr
  },
  en: {
    tagline: "Exceptional cinema, handpicked for you.",
    searchPlaceholder: "Describe a mood, an emotion...",
    exploreBtn: "Explore",
    featuredBadge: "FEATURED",
    trailerBtn: "Trailer",
    myListBtn: "My List",
    alertBtn: "Alert",
    filterAll: "All",
    filterMovies: "Movies",
    filterSeries: "TV Shows",
    aiAnalysisBadge: "Live Éliciné AI Analysis",
    resultsTitle: "AI Recommendations & Matches",
    resultsSubtitle: "Intelligent selection tailored to your taste",
    badgeFilm: "MOVIE",
    badgeSerie: "TV SHOW",
    streamingSection: "Where to Stream",
    availableOn: "Available on",
    vpnNeededTitle: "Regional Exclusive",
    vpnNeededDesc: "Not available in your local catalog. Accessible via VPN on",
    vpnButton: "Access via VPN",
    vodSection: "Available to Rent or Buy (VOD)",
    vodOnlyMessage: "Not currently included in subscription streaming catalogs.",
    synopsisTitle: "SYNOPSIS",
    critiqueTitle: "ÉLICINÉ CURATOR'S NOTE",
    resetHome: "Home",
    tmdbLang: "en-US",
    aiPromptLang: "Respond STRICTLY in English for movie summaries and reasons.",
    terms: termsEn,
    consentModal: consentModalEn
  },
  es: {
    tagline: "El cine de excepción, elegido para ti.",
    searchPlaceholder: "Describe un ambiente, una emoción...",
    exploreBtn: "Explorar",
    featuredBadge: "EN CARTELERA",
    trailerBtn: "Tráiler",
    myListBtn: "Mi Lista",
    alertBtn: "Alerta",
    filterAll: "Todos",
    filterMovies: "Películas",
    filterSeries: "Series TV",
    aiAnalysisBadge: "Análisis Éliciné AI en directo",
    resultsTitle: "Resultados y Recomendaciones IA",
    resultsSubtitle: "Selección inteligente personalizada según tus criterios",
    badgeFilm: "PELÍCULA",
    badgeSerie: "SERIE",
    streamingSection: "Dónde ver en streaming",
    availableOn: "Disponible en",
    vpnNeededTitle: "Exclusividad regional",
    vpnNeededDesc: "No disponible en tu país. Accesible mediante VPN en el catálogo de",
    vpnButton: "Desbloquear con VPN",
    vodSection: "Disponible para alquilar o comprar (VOD)",
    vodOnlyMessage: "No disponible actualmente en plataformas de streaming por suscripción.",
    synopsisTitle: "SINOPSIS",
    critiqueTitle: "VISIÓN CRÍTICA ÉLICINÉ",
    resetHome: "Inicio",
    tmdbLang: "es-ES",
    aiPromptLang: "Responde ESTRICTAMENTE en español para los resúmenes y motivos.",
    terms: termsEs,
    consentModal: consentModalEs
  },
  de: {
    tagline: "Außergewöhnliches Kino, handverlesen für Sie.",
    searchPlaceholder: "Beschreiben Sie eine Stimmung, ein Gefühl...",
    exploreBtn: "Entdecken",
    featuredBadge: "HIGHLIGHT",
    trailerBtn: "Trailer",
    myListBtn: "Meine Liste",
    alertBtn: "Benachrichtigung",
    filterAll: "Alle",
    filterMovies: "Filme",
    filterSeries: "Serien",
    aiAnalysisBadge: "Éliciné Live-KI-Analyse",
    resultsTitle: "KI-Empfehlungen & Treffer",
    resultsSubtitle: "Intelligente Auswahl nach Ihrem Geschmack",
    badgeFilm: "FILM",
    badgeSerie: "SERIE",
    streamingSection: "Streaming-Verfügbarkeit",
    availableOn: "Verfügbar auf",
    vpnNeededTitle: "Regionale Exklusivität",
    vpnNeededDesc: "In Ihrem Land nicht verfügbar. Über VPN abrufbar auf",
    vpnButton: "Mit VPN freischalten",
    vodSection: "Als Video-on-Demand (VoD) leihen oder kaufen",
    vodOnlyMessage: "Derzeit nicht in regulären Streaming-Abonnements enthalten.",
    synopsisTitle: "INHALTSANGABE",
    critiqueTitle: "ÉLICINÉ KRITIKER-NOTIZ",
    resetHome: "Startseite",
    tmdbLang: "de-DE",
    aiPromptLang: "Antworte STRIKT auf Deutsch für Filmbeschreibungen und Gründe.",
    terms: termsDe,
    consentModal: consentModalDe
  },
  it: {
    tagline: "Il cinema d'eccezione, selezionato per te.",
    searchPlaceholder: "Descrivi un'atmosfera, un'emozione...",
    exploreBtn: "Esplora",
    featuredBadge: "IN EVIDENZA",
    trailerBtn: "Trailer",
    myListBtn: "La mia lista",
    alertBtn: "Avviso",
    filterAll: "Tutti",
    filterMovies: "Film",
    filterSeries: "Serie TV",
    aiAnalysisBadge: "Analisi IA Éliciné in tempo reale",
    resultsTitle: "Raccomandazioni IA",
    resultsSubtitle: "Selezione personalizzata su misura per te",
    badgeFilm: "FILM",
    badgeSerie: "SERIE",
    streamingSection: "Dove guardare in streaming",
    availableOn: "Disponibile su",
    vpnNeededTitle: "Esclusiva regionale",
    vpnNeededDesc: "Non disponibile nel tuo paese. Accessibile via VPN su",
    vpnButton: "Accedi con VPN",
    vodSection: "Disponibile per il noleggio o l'acquisto (VOD)",
    vodOnlyMessage: "Attualmente non incluso nei cataloghi di streaming in abbonamento.",
    synopsisTitle: "TRAMA",
    critiqueTitle: "NOTA CRITICA ÉLICINÉ",
    resetHome: "Home",
    tmdbLang: "it-IT",
    aiPromptLang: "Rispondi RIGOROSAMENTE in italiano per le descrizioni e i motivi.",
    terms: termsIt,
    consentModal: consentModalIt
  }
};

/**
 * Fallback automatique :
 * Si une langue ou une clé est incomplète, applique une fusion avec l'anglais ou le français
 * pour garantir qu'aucun texte ne soit vide ou ne présente de clé brute.
 */
export function getTranslation(lang: Language): TranslationSchema {
  const fallback = baseTranslations.en || baseTranslations.fr;
  const target = baseTranslations[lang];

  if (!target) return fallback;

  return {
    ...fallback,
    ...target,
    terms: {
      ...fallback.terms,
      ...target.terms,
      intro: target.terms?.intro?.length ? target.terms.intro : fallback.terms.intro,
      articles: target.terms?.articles?.length ? target.terms.articles : fallback.terms.articles
    },
    consentModal: {
      ...fallback.consentModal,
      ...target.consentModal
    }
  };
}

export const translations: Record<Language, TranslationSchema> = {
  fr: getTranslation('fr'),
  en: getTranslation('en'),
  es: getTranslation('es'),
  de: getTranslation('de'),
  it: getTranslation('it')
};
