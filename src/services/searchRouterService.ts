/**
 * Routeur d'Intention et de Spécificité Hybride pour Éliciné
 * Analyse sémantique de la requête utilisateur :
 * 1. Requête Large (ex: genre, acteur, décennie sans titre précis) -> Sélection élargie et riche (14 à 16 titres).
 * 2. Requête Ultra-Ciblée (cumul de détails précis : acteur + lieu + twist + intrigue) -> Restreinte strictement à l'œuvre exacte (1 à 2 titres max).
 * 3. Requête Thématique / Modérée -> Recommandation équilibrée (6 à 8 titres).
 * 4. Titre Direct -> Recherche TMDB immédiate.
 */

export type QuerySpecificity = 'broad' | 'moderate' | 'ultra_targeted';

export interface SpecificityAnalysis {
  level: QuerySpecificity;
  targetCount: number;         // broad: 14-16, moderate: 6-8, ultra_targeted: 1-2
  minResults: number;
  maxResults: number;
  strictFiltering: boolean;
  score: number;
  reason: string;
}

export interface SearchIntentResult {
  intent: 'direct_tmdb' | 'ai_search';
  query: string;
  reason: string;
  specificity: SpecificityAnalysis;
}

// Mots sémantiques généraux
const SEMANTIC_KEYWORDS = new Set([
  'film', 'films', 'serie', 'series', 'série', 'séries',
  'comme', 'ambiance', 'peur', 'histoire', 'avec', 'drole', 'drôle',
  'sombre', 'style', 'genre', 'recommande', 'cherche', 'idee', 'idée',
  'idees', 'idées', 'conseil', 'type', 'action', 'amour', 'triste',
  'angoisse', 'suspense', 'braquage', 'enquete', 'enquête', 'drame',
  'horreur', 'comedie', 'comédie', 'animation', 'sf', 'science-fiction',
  'thriller', 'twist', 'fin', 'meilleur', 'meilleurs', 'top',
  'similaire', 'similaires', 'proche', 'univers', 'vampire', 'zombie',
  'romantique', 'emouvant', 'émouvant', 'palpitant', 'cyberpunk',
  'noir', 'neon', 'néon', 'qui', 'pourquoi', 'dans', 'sur', 'pour',
  'voyage', 'espace', 'psychologique', 'intelligent', 'complexe',
  'flippant', 'marrant', 'familial', 'ados', 'ado'
]);

// Indicateurs de genres et catégories larges
const BROAD_GENRES = [
  'action', 'aventure', 'comedie', 'comédie', 'comédies', 'drame', 'drames',
  'horreur', 'thriller', 'thrillers', 'science-fiction', 'science fiction', 'sf',
  'fantastique', 'fantasy', 'animation', 'animé', 'anime', 'manga', 'romance',
  'romantique', 'romantiques', 'western', 'westerns', 'guerre', 'policier',
  'policiers', 'polar', 'polars', 'documentaire', 'documentaires', 'musical',
  'biopic', 'biopics', 'espionnage', 'catastrophe', 'famille', 'jeunesse',
  'arts martiaux', 'gangster', 'gangsters', 'super heros', 'super-héros',
  'super-heros', 'super héros', 'post-apocalyptique', 'dystopie', 'cyberpunk'
];

// Indicateurs d'époques et de décennies larges
const BROAD_ERAS = [
  'années 50', 'annees 50', 'années 60', 'annees 60', 'années 70', 'annees 70',
  'années 80', 'annees 80', 'années 90', 'annees 90', 'années 2000', 'annees 2000',
  'années 2010', 'annees 2010', 'années 2020', 'annees 2020', 'ans 80', 'ans 90',
  'vieux films', 'vieux film', 'films récents', 'films recents', 'cinéma classique',
  'cinema classique', 'films cultes', 'nouveautés', 'nouveautes', 'époque victorienne',
  'moyen age', 'moyen-âge'
];

// Indicateurs de nationalités / origines larges
const BROAD_ORIGINS = [
  'coréen', 'coréens', 'coreen', 'coreens', 'coréenne', 'coréennes',
  'asiatique', 'asiatiques', 'français', 'francais', 'française', 'françaises',
  'américain', 'américains', 'americain', 'americains', 'américaine',
  'japonais', 'japonaise', 'italien', 'italienne', 'espagnol', 'espagnole',
  'britannique', 'britanniques', 'anglais', 'anglaise', 'indien', 'bollywood',
  'scandinave', 'africain', 'africains', 'nollywood', 'hongkongais'
];

// Noms célèbres d'acteurs ou réalisateurs souvent recherchés seuls
const KNOWN_CREATORS = [
  'tom cruise', 'brad pitt', 'dicaprio', 'leonardo dicaprio', 'nolan',
  'christopher nolan', 'tarantino', 'quentin tarantino', 'spielberg',
  'steven spielberg', 'scorsese', 'martin scorsese', 'denis villeneuve',
  'fincher', 'david fincher', 'keanu reeves', 'christian bale',
  'hugh jackman', 'ryan reynolds', 'bruce willis', 'denzel washington',
  'al pacino', 'robert de niro', 'morgan freeman', 'johnny depp',
  'tom hanks', 'matt damon', 'joaquin phoenix', 'cillian murphy',
  'emma stone', 'meryl streep', 'scarlett johansson', 'natalie portman',
  'harrison ford', 'clint eastwood', 'stanley kubrick', 'hitchcock',
  'alfred hitchcock', 'james cameron', 'ridley scott', 'wes anderson',
  'hayao miyazaki', 'miyazaki', 'bong joon-ho', 'park chan-wook',
  'almodovar', 'truffaut', 'godard', 'luc besson'
];

// Expressions types d'une demande de catalogue ou liste
const BROAD_INTENT_PATTERNS = [
  /\b(tous les films|meilleurs films|top films|idées de films|idees de films|liste de films)\b/i,
  /\b(filmographie|recommande|conseille|quelques films|suggestions de films)\b/i,
  /\b(films avec|films de|films d'|films du|films des)\b/i,
  /\b(cinéma|cinema)\b/i
];

// Déclencheurs de "recherche par souvenir / intrigue précise"
const MEMORY_PATTERNS = [
  /\b(le film où|le film ou|un film où|un film ou|film où|film ou)\b/i,
  /\b(cherche le film|cherche un film|comment s'appelle le film|c'est quoi le film)\b/i,
  /\b(film qui raconte|l'histoire d'un|l'histoire d'une|histoire avec un|histoire d'un)\b/i,
  /\b(il se réveille|elle se réveille|ils se réveillent|il découvre|elle découvre)\b/i,
  /\b(piégé|piege|enfermé|enferme|bloqué|coincé|coince)\b/i
];

// Éléments de Twist & Fin surprenante (+3 points de spécificité)
const TWIST_PATTERNS = [
  /\b(twist|twist final|retournement|dénouement|denouement|chute finale|révélation|revelation)\b/i,
  /\b(à la fin on découvre|a la fin on decouvre|à la fin il|a la fin il|à la fin elle|a la fin elle)\b/i,
  /\b(il était mort|il etait mort|était mort depuis le début|n'existait pas|n'existe pas)\b/i,
  /\b(schizophrène|schizophrene|double personnalité|double personnalite|personnalité multiple)\b/i,
  /\b(boucle temporelle|fin choc|fin surprenante)\b/i
];

// Lieux clos / Décors uniques caractéristiques (+2 points de spécificité)
const SETTING_PATTERNS = [
  /\b(cercueil|enterre vivant|enterré vivant)\b/i,
  /\b(cabine téléphonique|cabine telephonique)\b/i,
  /\b(île psychiatrique|ile psychiatrique|hôpital psychiatrique|hopital psychiatrique|asile)\b/i,
  /\b(sous-marin|sous marin|bunker|chambre forte|coffre-fort)\b/i,
  /\b(dans un train|dans un avion|dans l'espace|station spatiale)\b/i,
  /\b(ghetto de varsovie|ghetto|camp de concentration)\b/i,
  /\b(caisson cryogénique|caisson cryogenique|labyrinthe)\b/i,
  /\b(huis clos|chambre fermée|pièce fermée)\b/i
];

// Motifs narratifs très spécifiques (+2 points de spécificité)
const SPECIFIC_PLOT_PATTERNS = [
  /\b(pianiste juif|officier allemand)\b/i,
  /\b(magiciens rivaux|machine de tesla|duplication|machine à cloner)\b/i,
  /\b(flic sous couverture|infiltre la mafia|taupe dans la police)\b/i,
  /\b(sniper|tireur embusqué|tireur embusque)\b/i,
  /\b(masques de présidents|masques de presidents|braqueurs surfeurs)\b/i,
  /\b(enfant qui voit des morts|voit les morts)\b/i,
  /\b(tatouages sur le corps|polaroid|amnésie antérograde)\b/i,
  /\b(trou noir|bibliothèque 5 dimensions|tesseract|onde temporelle)\b/i,
  /\b(delorean|toupie|zippo|briquet)\b/i
];

/**
 * Analyse approfondie du niveau de spécificité de la requête
 */
export function analyzeQuerySpecificity(queryText: string): SpecificityAnalysis {
  const clean = queryText.trim().toLowerCase();
  const words = clean.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return {
      level: 'moderate',
      targetCount: 6,
      minResults: 4,
      maxResults: 8,
      strictFiltering: false,
      score: 0,
      reason: 'Requête vide'
    };
  }

  let specificScore = 0;
  let hasBroadCues = false;

  // 1. Détection des indices de recherche par souvenir d'intrigue
  const isMemoryQuery = MEMORY_PATTERNS.some(p => p.test(clean));
  if (isMemoryQuery) specificScore += 2;

  // 2. Détection des éléments de twist / fin
  const hasTwist = TWIST_PATTERNS.some(p => p.test(clean));
  if (hasTwist) specificScore += 3;

  // 3. Détection des décors isolés / spécifiques
  const hasSetting = SETTING_PATTERNS.some(p => p.test(clean));
  if (hasSetting) specificScore += 2;

  // 4. Détection des motifs d'intrigue uniques
  const hasSpecificPlot = SPECIFIC_PLOT_PATTERNS.some(p => p.test(clean));
  if (hasSpecificPlot) specificScore += 3;

  // 5. Présence d'un acteur / créateur
  const foundCreator = KNOWN_CREATORS.some(creator => clean.includes(creator));

  // Si on a un créateur + un détail d'intrigue / décor / twist -> ultra-ciblé direct (+3)
  if (foundCreator && (hasSetting || hasTwist || hasSpecificPlot || isMemoryQuery)) {
    specificScore += 3;
  }

  // 6. Analyse des composantes larges
  const hasBroadGenre = BROAD_GENRES.some(genre => clean.includes(genre));
  const hasBroadEra = BROAD_ERAS.some(era => clean.includes(era));
  const hasBroadOrigin = BROAD_ORIGINS.some(origin => clean.includes(origin));
  const hasBroadIntent = BROAD_INTENT_PATTERNS.some(p => p.test(clean));

  if (hasBroadGenre || hasBroadEra || hasBroadOrigin || hasBroadIntent || (foundCreator && specificScore === 0)) {
    hasBroadCues = true;
  }

  // ─── CLASSIFICATION ──────────────────────────────────────────────────────────

  // CAS ULTRA-CIBLÉ : cumul de détails précis (acteur + lieu + twist + intrigue)
  // L'utilisateur cherche UN film précis dont il décrit des scènes ou particularités
  if (specificScore >= 3 || (isMemoryQuery && specificScore >= 2)) {
    return {
      level: 'ultra_targeted',
      targetCount: 2,
      minResults: 1,
      maxResults: 2,
      strictFiltering: true,
      score: specificScore,
      reason: 'Cumul de détails narratifs précis (intrigue, décor, acteur ou twist final)'
    };
  }

  // CAS LARGE : genre, acteur, décennie, pays ou catégorie globale sans intrigue précise
  // Ex: "films de science-fiction", "comédies des années 90", "films avec Tom Cruise", "cinéma coréen"
  if (hasBroadCues && specificScore === 0) {
    return {
      level: 'broad',
      targetCount: 16,
      minResults: 12,
      maxResults: 16,
      strictFiltering: false,
      score: 0,
      reason: 'Recherche globale de genre, acteur, époque ou nationalité'
    };
  }

  // CAS INTERMÉDIAIRE / MODÉRÉ : ambiance, style ou recherche thématique équilibrée
  // Ex: "un thriller sombre sous la pluie", "film de braquage moderne et rythmé"
  return {
    level: 'moderate',
    targetCount: 6,
    minResults: 5,
    maxResults: 8,
    strictFiltering: false,
    score: specificScore,
    reason: 'Recherche thématique ou atmosphérique standard'
  };
}

/**
 * Détermine le routage entre TMDB direct et Recherche IA avec prise en compte de la spécificité
 */
export function analyzeSearchIntent(queryText: string): SearchIntentResult {
  const clean = queryText.trim();
  const words = clean.toLowerCase().split(/\s+/).filter(Boolean);
  const specificity = analyzeQuerySpecificity(clean);

  if (words.length === 0) {
    return {
      intent: 'direct_tmdb',
      query: clean,
      reason: 'Requête vide',
      specificity
    };
  }

  // Si la requête est soit ultra-ciblée (scénario précis), soit large (genre, époque),
  // elle DOIT passer par l'IA pour traiter sémantiquement l'intention.
  if (specificity.level === 'ultra_targeted') {
    return {
      intent: 'ai_search',
      query: clean,
      reason: `Requête ultra-ciblée : filtrage strict par l'IA (${specificity.reason})`,
      specificity
    };
  }

  if (specificity.level === 'broad') {
    return {
      intent: 'ai_search',
      query: clean,
      reason: `Requête large : sélection enrichie par l'IA (${specificity.reason})`,
      specificity
    };
  }

  // Vérifier si un mot sémantique/ambiance est présent
  const hasSemanticWord = words.some(w => {
    const stripped = w.replace(/[^\w\u00C0-\u017F]/g, '');
    return SEMANTIC_KEYWORDS.has(stripped);
  });

  // Critère "Titre Direct" (Bypass IA -> TMDB Direct) :
  // 3 mots ou moins, aucun mot d'ambiance et aucune catégorie large / ultra-ciblée
  if (words.length <= 3 && !hasSemanticWord && specificity.level === 'moderate') {
    return {
      intent: 'direct_tmdb',
      query: clean,
      reason: `Titre direct (${words.length} mots, pas d'ambiance détectée)`,
      specificity
    };
  }

  return {
    intent: 'ai_search',
    query: clean,
    reason: `Recherche sémantique IA (${words.length} mots, ambiance ou description)`,
    specificity
  };
}

export default analyzeSearchIntent;
