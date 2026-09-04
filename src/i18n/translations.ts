export type Language = 'fr' | 'en' | 'es';

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
}

export const translations: Record<Language, TranslationSchema> = {
  fr: {
    tagline: "Le cinéma d'exception, élu pour vous.",
    searchPlaceholder: "Décrivez une émotion, une ambiance ou une intrigue — l'algorithme Éliciné trouve votre film...",
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
    aiPromptLang: "Réponds STRICTEMENT en français pour les descriptions et raisons."
  },
  en: {
    tagline: "Exceptional cinema, handpicked for you.",
    searchPlaceholder: "Describe an emotion, a mood or a plot — the Éliciné algorithm finds your movie...",
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
    aiPromptLang: "Respond STRICTLY in English for movie summaries and reasons."
  },
  es: {
    tagline: "El cine de excepción, elegido para ti.",
    searchPlaceholder: "Describe una emoción, una atmósfera o una trama — el algoritmo Éliciné encuentra tu película...",
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
    aiPromptLang: "Responde ESTRICTAMENTE en español para los resúmenes y motivos."
  }
};
