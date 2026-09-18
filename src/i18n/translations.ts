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
  searchPlaceholderShort: string;
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
  supportBtn: string;
  tmdbLang: string;
  aiPromptLang: string;

  // Hero & Search
  heroSubtitle: string;
  searching: string;
  proActiveBanner: string;
  quotaRemainingText: string;
  quotaExceeded: string;
  upgradeToPro: string;
  close: string;

  // Sidebar & Navigation
  navHome: string;
  navTrending: string;
  navCatalog: string;
  navStreaming: string;
  navMyList: string;
  newSearch: string;
  closeSidebar: string;
  historyTitle: string;
  historyClear: string;
  historyEmpty: string;
  historySearchToast: string;
  proActive: string;
  proUnlimited: string;
  proPass: string;
  daysRemainingSuffix: string;
  supportProject: string;
  tipBadge: string;
  installApp: string;
  settings: string;
  settingsOptions: string;
  appearance: string;
  themeDark: string;
  themeLight: string;
  languageLabel: string;
  manageProfile: string;
  defaultUserName: string;
  freeBadge: string;
  loginBtn: string;
  logoutBtn: string;
  devConsole: string;
  termsAndPrivacy: string;
  myProfile: string;
  adminConsole: string;
  getProPass: string;
  guestUser: string;
  activeAccount: string;

  // Sections & Grids
  trendingTitle: string;
  trendingSubtitle: string;
  suggestReport: string;
  suggestReportTooltip: string;
  titlesSingular: string;
  titlesPlural: string;
  noMatchTitle: string;
  noMatchDesc: string;
  inspirationsTitle: string;
  missingTitle: string;
  missingDesc: string;
  proposeMovieBtn: string;
  trendingBadge: string;
  trendingHeading: string;
  trendingDesc: string;
  topTrendingGlobal: string;

  // Platforms, Catalog & Views
  platformsBadge: string;
  platformsHeading: string;
  platformsDesc: string;
  sortBy: string;
  sortPopular: string;
  sortTopRated: string;
  sortNewest: string;
  catalogBadge: string;
  catalogHeading: string;
  catalogDesc: string;
  tabSearch: string;
  catalogSearchPlaceholder: string;
  searchBtn: string;
  allRatings: string;
  catalogEmptySearchPrompt: string;
  popularMoviesTitle: string;
  topRatedMoviesTitle: string;
  popularSeriesTitle: string;
  searchResultsFor: string;
  personalSpace: string;
  myPersonalList: string;
  watchlistDesc: string;
  watchlistEmptyTitle: string;
  watchlistEmptyDesc: string;
  discoverMoviesBtn: string;
  savedMoviesTitle: string;
  posterBack: string;
  noTrailerAvailable: string;
  searchOnYoutube: string;
  detailedSheet: string;
  originalTitleLabel: string;
  shareTitle: string;
  onboardingInstallTitle: string;
  onboardingInstallDesc: string;
  onboardingThemeTitle: string;
  onboardingThemeDesc: string;

  // Document metadata
  pageTitle: string;
  metaDescription: string;

  // Sections légales i18n
  terms: TermsTranslations;
  consentModal: ConsentModalTranslations;
}

export type TranslationFunction = {
  (key: string, params?: Record<string, string | number>): string;
} & TranslationSchema;

export const I18N_KEY_MAP: Record<string, keyof TranslationSchema> = {
  'nav.home': 'navHome',
  'nav.trending': 'navTrending',
  'nav.catalog': 'navCatalog',
  'nav.streaming': 'navStreaming',
  'nav.my_list': 'navMyList',
  'nav.new_search': 'newSearch',
  'history.title': 'historyTitle',
  'history.clear': 'historyClear',
  'history.empty': 'historyEmpty',
  'history.search_toast': 'historySearchToast',
  'nav.support': 'supportProject',
  'nav.settings': 'settings',
  'pro.active': 'proActive',
  'pro.unlimited': 'proUnlimited',
  'hero.subtitle': 'heroSubtitle',
  'hero.explore': 'exploreBtn',
  'sections.trending_title': 'trendingTitle',
  'sections.trending_subtitle': 'trendingSubtitle',
  'actions.suggest_report': 'suggestReport',
  'theme.appearance': 'appearance',
  'theme.dark': 'themeDark',
  'theme.light': 'themeLight',
  'meta.title': 'pageTitle',
  'meta.description': 'metaDescription'
};

const baseTranslations: Record<Language, TranslationSchema> = {
  fr: {
    tagline: "Le cinéma d'exception, élu pour vous.",
    searchPlaceholder: "Décrivez une ambiance, un thème ou un acteur...",
    searchPlaceholderShort: "Ambiance, thème, acteur...",
    exploreBtn: "Explorer",
    featuredBadge: "À L'AFFICHE",
    trailerBtn: "Bande-annonce",
    myListBtn: "Ma Liste",
    alertBtn: "Alerte",
    filterAll: "Tous",
    filterMovies: "Films",
    filterSeries: "Séries TV",
    aiAnalysisBadge: "Analyse Éliciné en cours",
    resultsTitle: "Sélection & Recommandations Éliciné",
    resultsSubtitle: "Sélection sur mesure selon vos critères",
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
    supportBtn: "Soutenir",
    tmdbLang: "fr-FR",
    aiPromptLang: "Réponds STRICTEMENT en français pour les descriptions et raisons.",

    heroSubtitle: "L'algorithme intelligent d'Éliciné trouve la perle rare selon vos envies.",
    searching: "Recherche...",
    proActiveBanner: "Pass Pro actif • Recherches illimitées",
    quotaRemainingText: "Il vous reste {n} recherche{s} gratuite{s} aujourd'hui",
    quotaExceeded: "Quota gratuit atteint (0 recherche restante) •",
    upgradeToPro: "Passer au compte Pro (1.99 $)",
    close: "Fermer",

    navHome: "Accueil",
    navTrending: "Tendances",
    navCatalog: "Catalogue & Genres",
    navStreaming: "Streaming",
    navMyList: "Ma Liste",
    newSearch: "+ Nouvelle Recherche",
    closeSidebar: "Masquer la barre latérale",
    historyTitle: "HISTORIQUE",
    historyClear: "Vider",
    historyEmpty: "Aucune recherche récente",
    historySearchToast: "Recherche",
    proActive: "Éliciné Pro Actif",
    proUnlimited: "ILLIMITÉ",
    proPass: "Pass Pro",
    daysRemainingSuffix: "j restants",
    supportProject: "Soutenir le projet",
    tipBadge: "Don",
    installApp: "Installer l'application",
    settings: "Paramètres",
    settingsOptions: "Options",
    appearance: "Apparence",
    themeDark: "Sombre",
    themeLight: "Clair",
    languageLabel: "Langue",
    manageProfile: "Gérer mon profil",
    defaultUserName: "Cinéphile",
    freeBadge: "Gratuit",
    loginBtn: "Se connecter",
    logoutBtn: "Se déconnecter",
    devConsole: "Console Développeur",
    termsAndPrivacy: "Conditions & Confidentialité",
    myProfile: "Mon Profil",
    adminConsole: "Console Admin",
    getProPass: "Obtenir un Pass Pro",
    guestUser: "Invité",
    activeAccount: "Compte actif",

    trendingTitle: "🔥 Tendances populaires",
    trendingSubtitle: "Films et séries les plus visionnés aujourd'hui sur vos plateformes",
    suggestReport: "Suggérer / Signaler",
    suggestReportTooltip: "Signaler un résultat imprécis ou suggérer un film",
    titlesSingular: "titre",
    titlesPlural: "titres",
    noMatchTitle: "Aucun film ne correspond précisément à votre recherche...",
    noMatchDesc: "Aucune œuvre de notre catalogue ne réunit l'ensemble des critères demandés sans compromis sur la pertinence. Essayez d'élargir votre formulation, de dissocier vos critères ou d'explorer nos inspirations cinéphiles ci-dessous.",
    inspirationsTitle: "Inspirations cinéphiles à explorer en 1 clic",
    missingTitle: "Votre film ou votre série manque à l'appel ?",
    missingDesc: "Notre catalogue s'enrichit chaque jour grâce à la communauté. Dites-nous quelle œuvre ajouter en priorité !",
    proposeMovieBtn: "Proposer ce film à l'équipe",
    trendingBadge: "Cinéma & Streaming en Direct",
    trendingHeading: "Films Tendances du Moment",
    trendingDesc: "Défilement infini automatique — synchronisé chaque semaine avec les dernières sorties mondiales Éliciné.",
    topTrendingGlobal: "Top Tendances Mondiales",

    platformsBadge: "Catalogue par Fournisseur",
    platformsHeading: "Classement par Plateforme",
    platformsDesc: "Explorez les sélections exclusives par service de streaming avec défilement continu.",
    sortBy: "Trier par :",
    sortPopular: "🔥 Populaires",
    sortTopRated: "⭐ Mieux notés",
    sortNewest: "✨ Nouveautés",
    catalogBadge: "Catalogue Éliciné",
    catalogHeading: "Explorer les Œuvres",
    catalogDesc: "Défilement infini — Films, Séries & Recherche mondiale en temps réel.",
    tabSearch: "🔍 Recherche",
    catalogSearchPlaceholder: "Rechercher par titre, genre, mot-clé...",
    searchBtn: "Chercher",
    allRatings: "Toutes",
    catalogEmptySearchPrompt: "Tapez votre recherche et appuyez sur Entrée ou cliquez Chercher.",
    popularMoviesTitle: "🔥 Films Populaires",
    topRatedMoviesTitle: "⭐ Films les Mieux Notés",
    popularSeriesTitle: "📺 Séries Populaires",
    searchResultsFor: "🔍 Résultats pour",
    personalSpace: "Espace Personnel",
    myPersonalList: "Ma Liste Personnelle",
    watchlistDesc: "Vos films et séries enregistrés pour plus tard. Synchronisation automatique multi-appareils.",
    watchlistEmptyTitle: "Votre liste est vide pour l'instant",
    watchlistEmptyDesc: "Ajoutez des œuvres depuis n'importe quelle fiche ou demandez une sélection sur-mesure à l'IA.",
    discoverMoviesBtn: "Découvrir des films",
    savedMoviesTitle: "Mes Films Sauvegardés",
    posterBack: "Affiche",
    noTrailerAvailable: "Aucune bande-annonce officielle intégrable disponible directement pour ce titre.",
    searchOnYoutube: "Rechercher sur YouTube",
    detailedSheet: "Fiche Détaillée",
    originalTitleLabel: "Titre original :",
    shareTitle: "Partager",
    onboardingInstallTitle: "Installer l'application",
    onboardingInstallDesc: "Cliquez ici et suivez les instructions pour installer Éliciné sur votre appareil.",
    onboardingThemeTitle: "Vous préférez le mode sombre ?",
    onboardingThemeDesc: "Cliquez ici pour changer",

    pageTitle: "Éliciné — Le cinéma d'exception, élu pour vous",
    metaDescription: "Éliciné : moteur de recommandation cinématographique intelligent. Trouvez instantanément les meilleurs films et séries selon votre humeur et vos catalogues de streaming.",

    terms: termsFr,
    consentModal: consentModalFr
  },
  en: {
    tagline: "Exceptional cinema, handpicked for you.",
    searchPlaceholder: "Describe a mood, theme or actor...",
    searchPlaceholderShort: "Mood, theme, actor...",
    exploreBtn: "Explore",
    featuredBadge: "FEATURED",
    trailerBtn: "Trailer",
    myListBtn: "My List",
    alertBtn: "Alert",
    filterAll: "All",
    filterMovies: "Movies",
    filterSeries: "TV Shows",
    aiAnalysisBadge: "Éliciné analysis in progress",
    resultsTitle: "Éliciné Recommendations & Matches",
    resultsSubtitle: "Selection tailored to your taste",
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
    supportBtn: "Support",
    tmdbLang: "en-US",
    aiPromptLang: "Respond STRICTLY in English for movie summaries and reasons.",

    heroSubtitle: "Éliciné's smart algorithm finds the rare gem tailored to your mood.",
    searching: "Searching...",
    proActiveBanner: "Pro Pass active • Unlimited searches",
    quotaRemainingText: "You have {n} free search{s} remaining today",
    quotaExceeded: "Free quota reached (0 searches remaining) •",
    upgradeToPro: "Upgrade to Pro ($1.99)",
    close: "Close",

    navHome: "Home",
    navTrending: "Trending",
    navCatalog: "Catalog & Genres",
    navStreaming: "Streaming",
    navMyList: "My List",
    newSearch: "+ New Search",
    closeSidebar: "Collapse sidebar",
    historyTitle: "HISTORY",
    historyClear: "Clear",
    historyEmpty: "No recent searches",
    historySearchToast: "Search",
    proActive: "Éliciné Pro Active",
    proUnlimited: "UNLIMITED",
    proPass: "Pro Pass",
    daysRemainingSuffix: "d left",
    supportProject: "Support project",
    tipBadge: "Tip",
    installApp: "Install App",
    settings: "Settings",
    settingsOptions: "Options",
    appearance: "Appearance",
    themeDark: "Dark",
    themeLight: "Light",
    languageLabel: "Language",
    manageProfile: "Manage Profile",
    defaultUserName: "Film Lover",
    freeBadge: "Free",
    loginBtn: "Sign In",
    logoutBtn: "Sign Out",
    devConsole: "Developer Console",
    termsAndPrivacy: "Terms & Privacy",
    myProfile: "My Profile",
    adminConsole: "Admin Console",
    getProPass: "Get Pro Pass",
    guestUser: "Guest",
    activeAccount: "Active account",

    trendingTitle: "🔥 Trending Now",
    trendingSubtitle: "Most viewed movies and series across your platforms today",
    suggestReport: "Suggest / Report",
    suggestReportTooltip: "Report an inaccurate result or suggest a title",
    titlesSingular: "title",
    titlesPlural: "titles",
    noMatchTitle: "No movie matches your search criteria precisely...",
    noMatchDesc: "No title in our catalog satisfies all your criteria without compromising relevance. Try broadening your query, separating criteria, or explore our cinephile inspirations below.",
    inspirationsTitle: "Cinephile inspirations to explore in 1 click",
    missingTitle: "Is your movie or series missing?",
    missingDesc: "Our catalog expands daily thanks to the community. Tell us what to add next!",
    proposeMovieBtn: "Suggest this title to the team",
    trendingBadge: "Live Cinema & Streaming",
    trendingHeading: "Trending Movies Right Now",
    trendingDesc: "Automatic infinite scroll — synchronized weekly with the latest global releases.",
    topTrendingGlobal: "Top Global Trends",

    platformsBadge: "Catalog by Provider",
    platformsHeading: "Rankings by Platform",
    platformsDesc: "Explore exclusive selections by streaming service with continuous scrolling.",
    sortBy: "Sort by:",
    sortPopular: "🔥 Popular",
    sortTopRated: "⭐ Top Rated",
    sortNewest: "✨ New Releases",
    catalogBadge: "Éliciné Catalog",
    catalogHeading: "Explore Titles",
    catalogDesc: "Infinite scroll — Movies, TV Shows & Real-time Global Search.",
    tabSearch: "🔍 Search",
    catalogSearchPlaceholder: "Search by title, genre, keyword...",
    searchBtn: "Search",
    allRatings: "All",
    catalogEmptySearchPrompt: "Type your search and press Enter or click Search.",
    popularMoviesTitle: "🔥 Popular Movies",
    topRatedMoviesTitle: "⭐ Top Rated Movies",
    popularSeriesTitle: "📺 Popular Series",
    searchResultsFor: "🔍 Results for",
    personalSpace: "Personal Space",
    myPersonalList: "My Personal Watchlist",
    watchlistDesc: "Your saved movies and series for later. Automatic multi-device synchronization.",
    watchlistEmptyTitle: "Your watchlist is currently empty",
    watchlistEmptyDesc: "Save titles from any card or ask AI for a custom curated recommendation.",
    discoverMoviesBtn: "Discover movies",
    savedMoviesTitle: "My Saved Titles",
    posterBack: "Poster",
    noTrailerAvailable: "No official embeddable trailer currently available for this title.",
    searchOnYoutube: "Search on YouTube",
    detailedSheet: "Detailed Sheet",
    originalTitleLabel: "Original title:",
    shareTitle: "Share",
    onboardingInstallTitle: "Install the app",
    onboardingInstallDesc: "Click here and follow instructions to install Éliciné on your device.",
    onboardingThemeTitle: "Prefer dark mode?",
    onboardingThemeDesc: "Click here to toggle",

    pageTitle: "Éliciné — Exceptional cinema, handpicked for you",
    metaDescription: "Éliciné: intelligent cinema recommendation engine. Instantly find the best movies and TV series tailored to your mood and streaming subscriptions.",

    terms: termsEn,
    consentModal: consentModalEn
  },
  es: {
    tagline: "El cine de excepción, elegido para ti.",
    searchPlaceholder: "Describe un ambiente, tema o actor...",
    searchPlaceholderShort: "Ambiente, tema, actor...",
    exploreBtn: "Explorar",
    featuredBadge: "EN CARTELERA",
    trailerBtn: "Tráiler",
    myListBtn: "Mi Lista",
    alertBtn: "Alerta",
    filterAll: "Todos",
    filterMovies: "Películas",
    filterSeries: "Series TV",
    aiAnalysisBadge: "Análisis Éliciné en curso",
    resultsTitle: "Selección & Recomendaciones Éliciné",
    resultsSubtitle: "Selección a medida según tus criterios",
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
    supportBtn: "Apoyar",
    tmdbLang: "es-ES",
    aiPromptLang: "Responde ESTRICTAMENTE en español para los resúmenes y motivos.",

    heroSubtitle: "El algoritmo inteligente de Éliciné encuentra la joya oculta según tus gustos.",
    searching: "Buscando...",
    proActiveBanner: "Pase Pro activo • Búsquedas ilimitadas",
    quotaRemainingText: "Te queda{n} {n} búsqueda{s} gratuita{s} hoy",
    quotaExceeded: "Cuota gratuita alcanzada (0 búsquedas restantes) •",
    upgradeToPro: "Pasar a cuenta Pro (1.99 $)",
    close: "Cerrar",

    navHome: "Inicio",
    navTrending: "Tendencias",
    navCatalog: "Catálogo y Géneros",
    navStreaming: "Streaming",
    navMyList: "Mi Lista",
    newSearch: "+ Nueva Búsqueda",
    closeSidebar: "Ocultar barra lateral",
    historyTitle: "HISTORIAL",
    historyClear: "Vaciar",
    historyEmpty: "Sin búsquedas recientes",
    historySearchToast: "Búsqueda",
    proActive: "Éliciné Pro Activo",
    proUnlimited: "ILIMITADO",
    proPass: "Pase Pro",
    daysRemainingSuffix: "d restantes",
    supportProject: "Apoyar el proyecto",
    tipBadge: "Donación",
    installApp: "Instalar aplicación",
    settings: "Ajustes",
    settingsOptions: "Opciones",
    appearance: "Apariencia",
    themeDark: "Oscuro",
    themeLight: "Claro",
    languageLabel: "Idioma",
    manageProfile: "Gestionar perfil",
    defaultUserName: "Cinéfilo",
    freeBadge: "Gratis",
    loginBtn: "Iniciar sesión",
    logoutBtn: "Cerrar sesión",
    devConsole: "Consola de Desarrollador",
    termsAndPrivacy: "Términos y Privacidad",
    myProfile: "Mi Perfil",
    adminConsole: "Consola Admin",
    getProPass: "Obtener Pase Pro",
    guestUser: "Invitado",
    activeAccount: "Cuenta activa",

    trendingTitle: "🔥 Tendencias populares",
    trendingSubtitle: "Películas y series más vistas hoy en tus plataformas",
    suggestReport: "Sugerir / Reportar",
    suggestReportTooltip: "Reportar un resultado inexacto o sugerir una película",
    titlesSingular: "título",
    titlesPlural: "títulos",
    noMatchTitle: "Ninguna película coincide exactamente con tu búsqueda...",
    noMatchDesc: "Ninguna obra de nuestro catálogo reúne todos los criterios solicitados sin perder relevancia. Intenta ampliar tu búsqueda o explora nuestras inspiraciones cinéfilas.",
    inspirationsTitle: "Inspiraciones cinéfilas para explorar en 1 clic",
    missingTitle: "¿Falta tu película o serie favorita?",
    missingDesc: "¡Nuestro catálogo crece cada día gracias a la comunidad. Dinos qué obra añadir con prioridad!",
    proposeMovieBtn: "Proponer esta película al equipo",
    trendingBadge: "Cine & Streaming en Directo",
    trendingHeading: "Películas en Tendencia",
    trendingDesc: "Desplazamiento infinito automático — sincronizado cada semana con los últimos estrenos globales de Éliciné.",
    topTrendingGlobal: "Top Tendencias Mundiales",

    platformsBadge: "Catálogo por Plataforma",
    platformsHeading: "Clasificación por Plataforma",
    platformsDesc: "Explora las selecciones exclusivas por servicio de streaming con desplazamiento continuo.",
    sortBy: "Ordenar por:",
    sortPopular: "🔥 Populares",
    sortTopRated: "⭐ Mejor valoradas",
    sortNewest: "✨ Novedades",
    catalogBadge: "Catálogo Éliciné",
    catalogHeading: "Explorar Títulos",
    catalogDesc: "Desplazamiento infinito — Películas, Series y Búsqueda global en tiempo real.",
    tabSearch: "🔍 Búsqueda",
    catalogSearchPlaceholder: "Buscar por título, género, palabra clave...",
    searchBtn: "Buscar",
    allRatings: "Todas",
    catalogEmptySearchPrompt: "Escribe tu búsqueda y pulsa Enter o Buscar.",
    popularMoviesTitle: "🔥 Películas Populares",
    topRatedMoviesTitle: "⭐ Películas Mejor Valoradas",
    popularSeriesTitle: "📺 Series Populares",
    searchResultsFor: "🔍 Resultados para",
    personalSpace: "Espacio Personal",
    myPersonalList: "Mi Lista Personal",
    watchlistDesc: "Tus películas y series guardadas para después. Sincronización automática entre dispositivos.",
    watchlistEmptyTitle: "Tu lista está vacía por ahora",
    watchlistEmptyDesc: "Guarda obras desde cualquier ficha o pide una recomendación a medida a la IA.",
    discoverMoviesBtn: "Descubrir películas",
    savedMoviesTitle: "Mis Títulos Guardados",
    posterBack: "Póster",
    noTrailerAvailable: "No hay tráiler oficial disponible para este título.",
    searchOnYoutube: "Buscar en YouTube",
    detailedSheet: "Ficha Detallada",
    originalTitleLabel: "Título original:",
    shareTitle: "Compartir",
    onboardingInstallTitle: "Instalar la aplicación",
    onboardingInstallDesc: "Haz clic aquí y sigue las instrucciones para instalar Éliciné en tu dispositivo.",
    onboardingThemeTitle: "¿Prefieres el modo oscuro?",
    onboardingThemeDesc: "Haz clic aquí para cambiar",

    pageTitle: "Éliciné — El cine de excepción, elegido para ti",
    metaDescription: "Éliciné: motor inteligente de recomendación cinematográfica. Encuentra al instante las mejores películas y series según tu estado de ánimo y catálogos de streaming.",

    terms: termsEs,
    consentModal: consentModalEs
  },
  de: {
    tagline: "Außergewöhnliches Kino, handverlesen für Sie.",
    searchPlaceholder: "Beschreiben Sie eine Stimmung, ein Thema oder einen Schauspieler...",
    searchPlaceholderShort: "Stimmung, Thema, Schauspieler...",
    exploreBtn: "Entdecken",
    featuredBadge: "HIGHLIGHT",
    trailerBtn: "Trailer",
    myListBtn: "Meine Liste",
    alertBtn: "Benachrichtigung",
    filterAll: "Alle",
    filterMovies: "Filme",
    filterSeries: "Serien",
    aiAnalysisBadge: "Éliciné-Analyse läuft",
    resultsTitle: "Éliciné-Empfehlungen & Treffer",
    resultsSubtitle: "Auswahl nach Ihrem Geschmack",
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
    supportBtn: "Unterstützen",
    tmdbLang: "de-DE",
    aiPromptLang: "Antworte STRIKT auf Deutsch für Filmbeschreibungen und Gründe.",

    heroSubtitle: "Der intelligente Algorithmus von Éliciné findet das passende Meisterwerk für Sie.",
    searching: "Suche...",
    proActiveBanner: "Pro Pass aktiv • Unbegrenzte Suchen",
    quotaRemainingText: "Sie haben heute noch {n} kostenlose Suche{n}",
    quotaExceeded: "Kostenloses Kontingent erreicht (0 verbleibende Suchen) •",
    upgradeToPro: "Auf Pro upgraden (1.99 $)",
    close: "Schließen",

    navHome: "Startseite",
    navTrending: "Trends",
    navCatalog: "Katalog & Genres",
    navStreaming: "Streaming",
    navMyList: "Meine Liste",
    newSearch: "+ Neue Suche",
    closeSidebar: "Seitenleiste einklappen",
    historyTitle: "VERLAUF",
    historyClear: "Leeren",
    historyEmpty: "Keine letzten Suchen",
    historySearchToast: "Suche",
    proActive: "Éliciné Pro Aktiv",
    proUnlimited: "UNBEGRENZT",
    proPass: "Pro Pass",
    daysRemainingSuffix: "T verbleibend",
    supportProject: "Projekt unterstützen",
    tipBadge: "Spende",
    installApp: "App installieren",
    settings: "Einstellungen",
    settingsOptions: "Optionen",
    appearance: "Erscheinungsbild",
    themeDark: "Dunkel",
    themeLight: "Hell",
    languageLabel: "Sprache",
    manageProfile: "Profil verwalten",
    defaultUserName: "Filmliebhaber",
    freeBadge: "Kostenlos",
    loginBtn: "Anmelden",
    logoutBtn: "Abmelden",
    devConsole: "Entwicklerkonsole",
    termsAndPrivacy: "AGB & Datenschutz",
    myProfile: "Mein Profil",
    adminConsole: "Admin-Konsole",
    getProPass: "Pro Pass holen",
    guestUser: "Gast",
    activeAccount: "Aktives Konto",

    trendingTitle: "🔥 Beliebte Trends",
    trendingSubtitle: "Die meistgesehenen Filme und Serien des Tages auf Ihren Streamingdiensten",
    suggestReport: "Vorschlagen / Melden",
    suggestReportTooltip: "Ungenaues Ergebnis melden oder Film vorschlagen",
    titlesSingular: "Titel",
    titlesPlural: "Titel",
    noMatchTitle: "Kein Film entspricht genau Ihrer Suche...",
    noMatchDesc: "Kein Werk unseres Katalogs erfüllt alle Kriterien ohne Kompromisse bei der Relevanz. Versuchen Sie Ihre Formulierung zu erweitern oder erkunden Sie unsere Inspirationen unten.",
    inspirationsTitle: "Film-Inspirationen mit 1 Klick entdecken",
    missingTitle: "Fehlt Ihr Lieblingsfilm oder Ihre Serie?",
    missingDesc: "Unser Katalog wächst täglich dank der Community. Sagen Sie uns, was wir hinzufügen sollen!",
    proposeMovieBtn: "Diesen Film dem Team vorschlagen",
    trendingBadge: "Kino & Streaming Live",
    trendingHeading: "Aktuelle Trend-Filme",
    trendingDesc: "Automatisches Endlos-Scrollen — wöchentlich synchronisiert mit weltweiten Neuerscheinungen.",
    topTrendingGlobal: "Top Weltweite Trends",

    platformsBadge: "Katalog nach Anbieter",
    platformsHeading: "Rangliste nach Plattform",
    platformsDesc: "Entdecken Sie exklusive Highlights nach Streaming-Dienst mit endlosem Scrollen.",
    sortBy: "Sortieren nach:",
    sortPopular: "🔥 Beliebt",
    sortTopRated: "⭐ Bestbewertet",
    sortNewest: "✨ Neuheiten",
    catalogBadge: "Éliciné Katalog",
    catalogHeading: "Titel erkunden",
    catalogDesc: "Endloses Scrollen — Filme, Serien & weltweite Echtzeit-Suche.",
    tabSearch: "🔍 Suche",
    catalogSearchPlaceholder: "Nach Titel, Genre, Stichwort suchen...",
    searchBtn: "Suchen",
    allRatings: "Alle",
    catalogEmptySearchPrompt: "Geben Sie Ihre Suche ein und drücken Sie Enter oder Suchen.",
    popularMoviesTitle: "🔥 Beliebte Filme",
    topRatedMoviesTitle: "⭐ Bestbewertete Filme",
    popularSeriesTitle: "📺 Beliebte Serien",
    searchResultsFor: "🔍 Ergebnisse für",
    personalSpace: "Persönlicher Bereich",
    myPersonalList: "Meine persönliche Liste",
    watchlistDesc: "Ihre gespeicherten Filme und Serien für später. Automatische geräteübergreifende Synchronisierung.",
    watchlistEmptyTitle: "Ihre Liste ist derzeit leer",
    watchlistEmptyDesc: "Speichern Sie Titel von einer beliebigen Karte oder fordern Sie eine maßgeschneiderte KI-Empfehlung an.",
    discoverMoviesBtn: "Filme entdecken",
    savedMoviesTitle: "Meine gespeicherten Titel",
    posterBack: "Plakat",
    noTrailerAvailable: "Derzeit kein offizieller Trailer direkt verfügbar.",
    searchOnYoutube: "Auf YouTube suchen",
    detailedSheet: "Detailansicht",
    originalTitleLabel: "Originaltitel:",
    shareTitle: "Teilen",
    onboardingInstallTitle: "App installieren",
    onboardingInstallDesc: "Klicken Sie hier und folgen Sie den Anweisungen zur Installation von Éliciné.",
    onboardingThemeTitle: "Dunkelmodus bevorzugt?",
    onboardingThemeDesc: "Hier klicken zum Wechseln",

    pageTitle: "Éliciné — Außergewöhnliches Kino, handverlesen für Sie",
    metaDescription: "Éliciné: Intelligente Filmempfehlungsmaschine. Finden Sie sofort die besten Filme und Serien passend zu Ihrer Stimmung und Ihren Streaming-Diensten.",

    terms: termsDe,
    consentModal: consentModalDe
  },
  it: {
    tagline: "Il cinema d'eccezione, selezionato per te.",
    searchPlaceholder: "Descrivi un'atmosfera, un tema o un attore...",
    searchPlaceholderShort: "Atmosfera, tema, attore...",
    exploreBtn: "Esplora",
    featuredBadge: "IN EVIDENZA",
    trailerBtn: "Trailer",
    myListBtn: "La mia lista",
    alertBtn: "Avviso",
    filterAll: "Tutti",
    filterMovies: "Film",
    filterSeries: "Serie TV",
    aiAnalysisBadge: "Analisi Éliciné in corso",
    resultsTitle: "Selezione & Raccomandazioni Éliciné",
    resultsSubtitle: "Selezione su misura per te",
    badgeFilm: "FILM",
    badgeSerie: "SERIE",
    streamingSection: "Dove guardare in streaming",
    availableOn: "Disponibile su",
    vpnNeededTitle: "Esclusiva regionale",
    vpnNeededDesc: "Non disponible nel tuo paese. Accessibile via VPN su",
    vpnButton: "Accedi con VPN",
    vodSection: "Disponibile per il noleggio o l'acquisto (VOD)",
    vodOnlyMessage: "Attualmente non incluso nei cataloghi di streaming in abbonamento.",
    synopsisTitle: "TRAMA",
    critiqueTitle: "NOTA CRITICA ÉLICINÉ",
    resetHome: "Home",
    supportBtn: "Sostieni",
    tmdbLang: "it-IT",
    aiPromptLang: "Rispondi RIGOROSAMENTE in italiano per le descrizioni e i motivi.",

    heroSubtitle: "L'algoritmo intelligente di Éliciné trova la perla rara su misura per te.",
    searching: "Ricerca...",
    proActiveBanner: "Pass Pro attivo • Ricerche illimitate",
    quotaRemainingText: "Ti rimangono {n} ricerch{e} gratuit{e} oggi",
    quotaExceeded: "Quota gratuita raggiunta (0 ricerche rimanenti) •",
    upgradeToPro: "Passa a Pro (1.99 $)",
    close: "Chiudi",

    navHome: "Home",
    navTrending: "Tendenze",
    navCatalog: "Catalogo & Generi",
    navStreaming: "Streaming",
    navMyList: "La mia lista",
    newSearch: "+ Nuova Ricerca",
    closeSidebar: "Comprimi barra laterale",
    historyTitle: "CRONOLOGIA",
    historyClear: "Cancella",
    historyEmpty: "Nessuna ricerca recente",
    historySearchToast: "Ricerca",
    proActive: "Éliciné Pro Attivo",
    proUnlimited: "ILLIMITATO",
    proPass: "Pass Pro",
    daysRemainingSuffix: "g rimasti",
    supportProject: "Sostieni il progetto",
    tipBadge: "Donazione",
    installApp: "Installa l'app",
    settings: "Impostazioni",
    settingsOptions: "Opzioni",
    appearance: "Aspetto",
    themeDark: "Scuro",
    themeLight: "Chiaro",
    languageLabel: "Lingua",
    manageProfile: "Gestisci profilo",
    defaultUserName: "Cinefilo",
    freeBadge: "Gratis",
    loginBtn: "Accedi",
    logoutBtn: "Esci",
    devConsole: "Console Sviluppatore",
    termsAndPrivacy: "Termini e Privacy",
    myProfile: "Il mio Profilo",
    adminConsole: "Console Admin",
    getProPass: "Ottieni Pass Pro",
    guestUser: "Ospite",
    activeAccount: "Account attivo",

    trendingTitle: "🔥 Tendenze popolari",
    trendingSubtitle: "Film e serie più visti oggi sulle tue piattaforme",
    suggestReport: "Suggerisci / Segnala",
    suggestReportTooltip: "Segnala un risultato impreciso o suggerisci un film",
    titlesSingular: "titolo",
    titlesPlural: "titoli",
    noMatchTitle: "Nessun film corrisponde esattamente alla tua ricerca...",
    noMatchDesc: "Nessuna opera nel nostro catalogo soddisfa tutti i criteri senza compromettere la pertinenza. Prova ad ampliare la richiesta o esplora le nostre ispirazioni di seguito.",
    inspirationsTitle: "Ispirazioni cinefile da esplorare in 1 clic",
    missingTitle: "Manca il tuo film o la tua serie?",
    missingDesc: "Il nostro catalogo cresce ogni giorno grazie alla community. Dicci quale titolo aggiungere per primo!",
    proposeMovieBtn: "Proponi questo film al team",
    trendingBadge: "Cinema & Streaming dal Vivo",
    trendingHeading: "Film di Tendenza del Momento",
    trendingDesc: "Scorrimento infinito automatico — sincronizzato settimanalmente con le ultime uscite mondiali.",
    topTrendingGlobal: "Top Tendenze Mondiali",

    platformsBadge: "Catalogo per Provider",
    platformsHeading: "Classifica per Piattaforma",
    platformsDesc: "Esplora le selezioni esclusive per servizio streaming con scorrimento continuo.",
    sortBy: "Ordina per:",
    sortPopular: "🔥 Popolari",
    sortTopRated: "⭐ Più votati",
    sortNewest: "✨ Novità",
    catalogBadge: "Catalogo Éliciné",
    catalogHeading: "Esplora i Titoli",
    catalogDesc: "Scorrimento continuo — Film, Serie e Ricerca globale in tempo reale.",
    tabSearch: "🔍 Ricerca",
    catalogSearchPlaceholder: "Cerca per titolo, genere, parola chiave...",
    searchBtn: "Cerca",
    allRatings: "Tutte",
    catalogEmptySearchPrompt: "Digita la ricerca e premi Invio o Cerca.",
    popularMoviesTitle: "🔥 Film Popolari",
    topRatedMoviesTitle: "⭐ Film Più Votati",
    popularSeriesTitle: "📺 Serie Popolari",
    searchResultsFor: "🔍 Risultati per",
    personalSpace: "Spazio Personale",
    myPersonalList: "La Mia Lista Personale",
    watchlistDesc: "I tuoi film e serie salvati per dopo. Sincronizzazione automatica tra dispositivi.",
    watchlistEmptyTitle: "La tua lista è attualmente vuota",
    watchlistEmptyDesc: "Salva titoli da qualsiasi scheda o richiedi un suggerimento su misura all'IA.",
    discoverMoviesBtn: "Scopri film",
    savedMoviesTitle: "I Miei Titoli Salvati",
    posterBack: "Locandina",
    noTrailerAvailable: "Nessun trailer ufficiale incorporabile al momento disponibile per questo titolo.",
    searchOnYoutube: "Cerca su YouTube",
    detailedSheet: "Scheda Dettagliata",
    originalTitleLabel: "Titolo originale:",
    shareTitle: "Condividi",
    onboardingInstallTitle: "Installa l'app",
    onboardingInstallDesc: "Fai clic qui e segui le istruzioni per installare Éliciné sul tuo dispositivo.",
    onboardingThemeTitle: "Preferisci la modalità scura?",
    onboardingThemeDesc: "Fai clic qui per cambiare",

    pageTitle: "Éliciné — Il cinema d'eccezione, selezionato per te",
    metaDescription: "Éliciné: motore di raccomandazione cinematografica intelligente. Trova istantaneamente i migliori film e serie in base al tuo umore e ai tuoi cataloghi streaming.",

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

/**
 * Crée un proxy de traduction fonctionnel permettant à la fois :
 * 1. L'accès direct typé par propriétés : t.navHome, t.heroSubtitle, etc.
 * 2. L'appel par chemin de clé : t('nav.home'), t('sections.trending_title'), etc.
 */
export function createTranslationProxy(schema: TranslationSchema): TranslationFunction {
  const translateFn = (key: string, params?: Record<string, string | number>): string => {
    if (!key) return '';

    // A. Clé mappée (e.g. 'nav.home' -> 'navHome')
    const mappedKey = I18N_KEY_MAP[key];
    let val: any = mappedKey ? (schema as any)[mappedKey] : (schema as any)[key];

    // B. Résolution arborescente (e.g. 'terms.title')
    if (val === undefined && key.includes('.')) {
      const parts = key.split('.');
      let curr: any = schema;
      for (const part of parts) {
        if (curr && typeof curr === 'object') {
          curr = curr[part];
        } else {
          curr = undefined;
          break;
        }
      }
      if (typeof curr === 'string') {
        val = curr;
      }
    }

    if (val === undefined || typeof val !== 'string') {
      val = key;
    }

    // Remplacement des paramètres dynamiques comme {n}
    if (params) {
      Object.entries(params).forEach(([paramKey, paramVal]) => {
        val = val.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramVal));
      });
    }

    return val;
  };

  return Object.assign(translateFn, schema);
}
