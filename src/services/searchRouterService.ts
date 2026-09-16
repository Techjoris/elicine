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
  // L'utilisateur cherche un film précis dont il décrit des souvenirs ou particularités.
  // On identifie l'œuvre exacte en tête, complétée par les alternatives sémantiquement proches (4 à 6 films).
  if (specificScore >= 3 || (isMemoryQuery && specificScore >= 2)) {
    return {
      level: 'ultra_targeted',
      targetCount: 5,
      minResults: 4,
      maxResults: 6,
      strictFiltering: false,
      score: specificScore,
      reason: 'Recherche par souvenir / intrigue précise (correspondance sémantique souple)'
    };
  }

  // CAS LARGE : genre, acteur, décennie, pays ou catégorie globale sans intrigue précise
  // Ex: "films de science-fiction", "comédies des années 90", "films avec Tom Cruise", "cinéma coréen"
  if (hasBroadCues && specificScore === 0) {
    return {
      level: 'broad',
      targetCount: 10,
      minResults: 6,
      maxResults: 12,
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
    minResults: 4,
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

// ══════════════════════════════════════════════════════════════════════════════
// EXTRACTION DES CRITÈRES DURS & ENTITÉS CLÉS (NIVEAU 1 & NIVEAU 3)
// ══════════════════════════════════════════════════════════════════════════════

export interface ExtractedCriteria {
  actors: string[];
  directors: string[];
  spatialSettings: string[];   // ex: ['souterrain', 'espace', 'huis_clos_confine', etc.]
  situations: string[];        // ex: ['coincés sous terre', 'trou noir', 'cercueil', etc.]
  tones: string[];             // ex: ['angoissant', 'twist', 'sombre', 'survie', etc.]
  genres: string[];
  era?: string;
  year?: number;
  format?: 'film' | 'serie' | 'all';
  themes: string[];
  narrativeCues: string[];
  isTwistRequested: boolean;
  hasNarrativeConstraint: boolean;
  hasStructuredIntent: boolean;
  primaryEntity?: string;
  hasHardCriteria: boolean;
}

export interface SpatialSettingDefinition {
  id: string;
  triggers: string[];
  situations: string[];
  expectedGenres: number[]; // TMDB genre IDs (27: Horreur, 53: Thriller, 9648: Mystère, 878: SF, etc.)
  archetypeFilms: string[];
  keywords: string[];
}

export const SPATIAL_SETTINGS_MAP: Record<string, SpatialSettingDefinition> = {
  souterrain: {
    id: 'souterrain',
    triggers: [
      'sous terre', 'coincé sous terre', 'coincés sous terre', 'coinces sous terre', 'bloqué sous terre',
      'bloqués sous terre', 'grotte', 'grottes', 'caverne', 'cavernes', 'spéléologie', 'speleologie',
      'spéléo', 'speleo', 'catacombes', 'tunnel', 'tunnels', 'sous-sol', 'sous sol', 'mine', 'mines',
      'crevasse', 'gouffre', 'enfermé sous terre', 'enfermés sous terre'
    ],
    situations: ['coincés sous terre', 'expédition spéléologique', 'exploration de catacombes', 'piégés sous terre', 'claustrophobie souterraine'],
    expectedGenres: [27, 53, 9648, 12], // Horreur, Thriller, Mystère, Aventure
    archetypeFilms: [
      'The Descent', 'Cube', 'Buried', 'Catacombes', 'As Above, So Below', 'The Cave', 'Sanctum',
      'The Descent: Part 2', 'Creep', 'La Colline a des yeux', 'Meurtres à la Saint-Valentin'
    ],
    keywords: ['grotte', 'grottes', 'caverne', 'spéléologie', 'catacombes', 'sous terre', 'souterrain', 'tunnel', 'piégé', 'coincé', 'créature', 'obscurité', 'profondeur']
  },
  espace: {
    id: 'espace',
    triggers: [
      'dans l\'espace', 'espace', 'trou noir', 'station spatiale', 'vaisseau spatial', 'vaisseau',
      'astronaute', 'cosmonaute', 'orbite', 'mars', 'lune', 'relativité', 'planète inconnue', 'tesseract'
    ],
    situations: ['voyage spatial', 'trou noir et dilatation temporelle', 'dérive spatiale', 'station orbitale'],
    expectedGenres: [878, 12, 18], // SF, Aventure, Drame
    archetypeFilms: [
      'Interstellar', '2001 : L\'Odyssée de l\'espace', 'Gravity', 'Ad Astra', 'The Martian', 'Seul sur Mars',
      'Moon', 'Apollo 13', 'First Man', 'Sunshine', 'Solaris', 'Event Horizon'
    ],
    keywords: ['espace', 'astronaute', 'station spatiale', 'trou noir', 'vaisseau', 'galaxie', 'orbite', 'gravité', 'terre']
  },
  huis_clos_confine: {
    id: 'huis_clos_confine',
    triggers: [
      'huis clos', 'huis-clos', 'cercueil', 'enterré vivant', 'enterre vivant', 'bunker',
      'pièce fermée', 'piece fermee', 'chambre forte', 'coffre-fort', 'cabine téléphonique',
      'cabine telephonique', 'chambre d\'hôtel', 'cellule', 'dans une boîte', 'dans une boite'
    ],
    situations: ['enfermé dans un cercueil', 'bloqué dans une pièce', 'huis clos angoissant', 'bunker sous-terrain'],
    expectedGenres: [53, 9648, 27, 80],
    archetypeFilms: [
      'Buried', '10 Cloverfield Lane', 'Panic Room', 'Saw', 'Phone Game', 'Phone Booth',
      'Oxygen', 'Exam', 'The Platform', 'La Plateforme', 'Devil', 'Misery', 'Fenêtre sur cour', '12 Hommes en colère'
    ],
    keywords: ['enfermé', 'piégé', 'pièce', 'cercueil', 'bunker', 'huis clos', 'cellule', 'prisonnier', 'survie']
  },
  abysses_aquatique: {
    id: 'abysses_aquatique',
    triggers: [
      'abysses', 'sous l\'eau', 'sous marin', 'sous-marin', 'fond des mers', 'fond de l\'océan',
      'profondeurs marines', 'station sous-marine', 'plongée extrême'
    ],
    situations: ['équipage de sous-marin en péril', 'station sous-marine piégée', 'profondeurs océaniques'],
    expectedGenres: [53, 878, 27, 28],
    archetypeFilms: [
      'Abyss', 'The Abyss', 'Sphere', 'Underwater', 'Das Boot', 'Le Bateau', 'K-19', 'Le Chant du loup',
      'DeepStar Six', 'Leviathan'
    ],
    keywords: ['sous-marin', 'abysses', 'océan', 'profondeur', 'eau', 'torpille', 'immersion', 'pression']
  },
  asile_psychiatrique: {
    id: 'asile_psychiatrique',
    triggers: [
      'île psychiatrique', 'ile psychiatrique', 'hôpital psychiatrique', 'hopital psychiatrique',
      'asile', 'asile d\'aliénés', 'institution psychiatrique', 'manoir hanté', 'manoir isole'
    ],
    situations: ['enquête en hôpital psychiatrique', 'internement forcé', 'île prison psychiatrique'],
    expectedGenres: [9648, 53, 18, 27],
    archetypeFilms: [
      'Shutter Island', 'Vol au-dessus d\'un nid de coucou', 'Gothika', 'Stonehearst Asylum', 'Session 9', 'The Ward'
    ],
    keywords: ['asile', 'psychiatrique', 'île', 'médecin', 'patient', 'hallucination', 'enquête', 'interné']
  },
  boucle_temporelle: {
    id: 'boucle_temporelle',
    triggers: [
      'boucle temporelle', 'revit la même journée', 'revit la meme journee', 'recommence sans cesse',
      'bloqué dans le temps', 'répète la journée', 'voyage dans le temps'
    ],
    situations: ['journée qui se répète à l\'infini', 'boucle temporelle de survie'],
    expectedGenres: [878, 35, 53, 12],
    archetypeFilms: [
      'Un jour sans fin', 'Groundhog Day', 'Edge of Tomorrow', 'Source Code', 'Palm Springs', 'Happy Birthdead',
      'Looper', 'ARQ', 'Triangle', 'Coherence'
    ],
    keywords: ['boucle', 'temps', 'répète', 'journée', 'matin', 'mort', 'recommence', 'mémoire']
  }
};

export interface ToneDefinition {
  id: string;
  triggers: string[];
  genres: number[];
  intensity: 'distressing' | 'tense' | 'mindbending' | 'action' | 'light' | 'dark';
}

export const TONE_PATTERNS: Record<string, ToneDefinition> = {
  distressing: {
    id: 'distressing',
    triggers: [
      'angoissant', 'angoisse', 'oppressant', 'oppressante', 'terrifiant', 'flippant',
      'peur', 'claustrophobe', 'claustrophobique', 'cauchemar', 'horreur', 'angoissante'
    ],
    genres: [27, 53], // Horreur, Thriller
    intensity: 'distressing'
  },
  twist_mindbending: {
    id: 'twist_mindbending',
    triggers: [
      'twist', 'twist final', 'retournement', 'chute finale', 'dénouement',
      'révélation', 'fin choc', 'fin surprenante', 'psychologique'
    ],
    genres: [9648, 53, 878], // Mystère, Thriller, SF
    intensity: 'mindbending'
  },
  survival_tense: {
    id: 'survival_tense',
    triggers: [
      'survie', 'survival', 'piégé', 'bloqué', 'coincé', 'traqué',
      'tendu', 'suspense', 'haletant'
    ],
    genres: [53, 28, 12],
    intensity: 'tense'
  },
  dark_melancholic: {
    id: 'dark_melancholic',
    triggers: [
      'sombre', 'noir', 'pluvieux', 'néo-noir', 'mélancolique',
      'désespéré', 'glauque', 'poisseux'
    ],
    genres: [80, 18, 53],
    intensity: 'dark'
  }
};

const KNOWN_DIRECTORS_MAP: Record<string, string[]> = {
  'Christopher Nolan': ['christopher nolan', 'nolan'],
  'Quentin Tarantino': ['quentin tarantino', 'tarantino'],
  'Steven Spielberg': ['steven spielberg', 'spielberg'],
  'Martin Scorsese': ['martin scorsese', 'scorsese'],
  'Denis Villeneuve': ['denis villeneuve', 'villeneuve'],
  'David Fincher': ['david fincher', 'fincher'],
  'Stanley Kubrick': ['stanley kubrick', 'kubrick'],
  'Alfred Hitchcock': ['alfred hitchcock', 'hitchcock'],
  'James Cameron': ['james cameron'],
  'Ridley Scott': ['ridley scott'],
  'Wes Anderson': ['wes anderson'],
  'Hayao Miyazaki': ['hayao miyazaki', 'miyazaki'],
  'Bong Joon-ho': ['bong joon-ho', 'bong joon ho'],
  'Park Chan-wook': ['park chan-wook', 'park chan wook'],
  'Pedro Almodóvar': ['almodovar', 'almodóvar', 'pedro almodovar'],
  'François Truffaut': ['truffaut'],
  'Jean-Luc Godard': ['godard'],
  'Luc Besson': ['luc besson']
};

const KNOWN_ACTORS_MAP: Record<string, string[]> = {
  'Leonardo DiCaprio': ['leonardo dicaprio', 'dicaprio'],
  'Brad Pitt': ['brad pitt'],
  'Tom Cruise': ['tom cruise'],
  'Keanu Reeves': ['keanu reeves'],
  'Christian Bale': ['christian bale'],
  'Hugh Jackman': ['hugh jackman'],
  'Ryan Reynolds': ['ryan reynolds'],
  'Bruce Willis': ['bruce willis'],
  'Denzel Washington': ['denzel washington'],
  'Al Pacino': ['al pacino'],
  'Robert De Niro': ['robert de niro', 'de niro'],
  'Morgan Freeman': ['morgan freeman'],
  'Johnny Depp': ['johnny depp'],
  'Tom Hanks': ['tom hanks'],
  'Matt Damon': ['matt damon'],
  'Joaquin Phoenix': ['joaquin phoenix'],
  'Cillian Murphy': ['cillian murphy'],
  'Emma Stone': ['emma stone'],
  'Meryl Streep': ['meryl streep'],
  'Scarlett Johansson': ['scarlett johansson'],
  'Natalie Portman': ['natalie portman'],
  'Harrison Ford': ['harrison ford'],
  'Clint Eastwood': ['clint eastwood'],
  'Matthew McConaughey': ['matthew mcconaughey', 'mcconaughey'],
  'Timothée Chalamet': ['timothée chalamet', 'timothee chalamet', 'chalamet']
};

/**
 * Isole les critères durs (acteur, réalisateur, format, année) et dégage l'entité principale
 * pour alimenter la recherche stricte (Niveau 1) et le recadrage intelligent (Niveau 3).
 */
export function extractHardCriteriaAndEntities(queryText: string): ExtractedCriteria {
  const clean = (queryText || '').trim();
  const lower = clean.toLowerCase();

  const actors: string[] = [];
  const directors: string[] = [];
  const genres: string[] = [];
  const themes: string[] = [];
  let era: string | undefined;
  let year: number | undefined;
  let format: 'film' | 'serie' | 'all' = 'all';

  // 1. Format (Film vs Série)
  if (/\b(série|séries|serie|series|mini-série|mini-serie|série tv|serie tv)\b/i.test(lower)) {
    format = 'serie';
  } else if (/\b(film|films|long-métrage|long metrage|court-métrage|court metrage)\b/i.test(lower)) {
    format = 'film';
  }

  // 2. Année précise ou décennie
  const yearMatch = lower.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1], 10);
    if (y >= 1900 && y <= 2035) {
      year = y;
    }
  }

  const eraMatch = BROAD_ERAS.find(e => lower.includes(e));
  if (eraMatch) {
    era = eraMatch;
  }

  // 3. Détection des Réalisateurs (Mappage connu + motifs 'réalisé par', 'de [Nom]')
  for (const [canonicalName, aliases] of Object.entries(KNOWN_DIRECTORS_MAP)) {
    if (aliases.some(a => lower.includes(a))) {
      // Si la phrase contient 'de X' ou 'par X' ou simplement le nom
      if (!directors.includes(canonicalName)) {
        directors.push(canonicalName);
      }
    }
  }

  // Détection contextuelle 'réalisé par ...' ou 'un film de ...'
  const dirPattern = /\b(?:réalisé par|realise par|un film de|du réalisateur|de la réalisatrice)\s+([A-ZÀ-ÿa-z'-]+(?:\s+[A-ZÀ-ÿa-z'-]+)?)/i;
  const dirMatch = clean.match(dirPattern);
  if (dirMatch && dirMatch[1]) {
    const candidate = dirMatch[1].trim();
    const candidateLower = candidate.toLowerCase();
    const firstWord = candidateLower.split(/\s+/)[0];
    const isStopPrefix = ['un', 'une', 'des', 'le', 'la', 'les', 'ce', 'cette', 'du', 'de', 'd', 'au', 'aux'].includes(firstWord);
    if (!isStopPrefix && candidate.length > 2 && !directors.some(d => d.toLowerCase() === candidateLower)) {
      directors.push(candidate);
    }
  }

  // 4. Détection des Acteurs (Mappage connu + motifs 'avec [Nom]', 'joué par [Nom]')
  for (const [canonicalName, aliases] of Object.entries(KNOWN_ACTORS_MAP)) {
    if (aliases.some(a => lower.includes(a))) {
      // Vérifier que ce n'est pas déjà rangé comme réalisateur exclusif
      if (!directors.includes(canonicalName) || lower.includes('avec ' + aliases[0])) {
        if (!actors.includes(canonicalName)) {
          actors.push(canonicalName);
        }
      }
    }
  }

  // Détection contextuelle 'avec ...' ou 'joué par ...'
  const actorPattern = /\b(?:joué par|joue par|mettant en vedette|avec l'acteur|avec l'actrice|avec)\s+([A-ZÀ-ÿa-z'-]+(?:\s+[A-ZÀ-ÿa-z'-]+)?)/i;
  const actorMatch = clean.match(actorPattern);
  if (actorMatch && actorMatch[1]) {
    const candidate = actorMatch[1].trim();
    const candidateLower = candidate.toLowerCase();
    const firstWord = candidateLower.split(/\s+/)[0];
    const isStopPrefix = ['un', 'une', 'des', 'le', 'la', 'les', 'ce', 'cette', 'du', 'de', 'd', 'au', 'aux', 'comme'].includes(firstWord);
    const isTropeWord = ['fin', 'twist', 'intrigue', 'histoire', 'ambiance', 'musique', 'scenario', 'scénario', 'suspense', 'acteur', 'actrice'].some(w => candidateLower.includes(w));
    if (!isStopPrefix && !isTropeWord && candidate.length > 2 && !actors.some(a => a.toLowerCase() === candidateLower)) {
      actors.push(candidate);
    }
  }

  // 5. Genres
  for (const g of BROAD_GENRES) {
    if (lower.includes(g)) {
      const capitalized = g.charAt(0).toUpperCase() + g.slice(1);
      if (!genres.includes(capitalized)) {
        genres.push(capitalized);
      }
    }
  }

  // 6. Thèmes & Tropes d'ambiance
  const themeKeywords = [
    'huis clos', 'twist', 'espace', 'trou noir', 'boucle temporelle',
    'braquage', 'paranoïa', 'amnésie', 'sniper', 'intelligence artificielle',
    'sous-marin', 'cercueil', 'zombie', 'vampire', 'cyberpunk', 'dystopie',
    'enquête', 'infiltration', 'voyage dans le temps'
  ];
  for (const t of themeKeywords) {
    if (lower.includes(t) && !themes.includes(t)) {
      themes.push(t);
    }
  }

  // 7. Détection approfondie des cadres spatiaux et décors (Niveau 1)
  const spatialSettings: string[] = [];
  const situations: string[] = [];
  for (const [key, setting] of Object.entries(SPATIAL_SETTINGS_MAP)) {
    if (setting.triggers.some(tr => lower.includes(tr))) {
      spatialSettings.push(key);
      for (const sit of setting.situations) {
        if (!situations.includes(sit)) situations.push(sit);
      }
      if (!themes.includes(key)) themes.push(key);
    }
  }

  // 8. Détection des tons et ambiances émotionnelles (Niveau 1)
  const tones: string[] = [];
  for (const [toneKey, toneDef] of Object.entries(TONE_PATTERNS)) {
    if (toneDef.triggers.some(tr => lower.includes(tr))) {
      tones.push(toneKey);
    }
  }

  // 9. Détection approfondie des contraintes narratives & twists
  const narrativeCues: string[] = [];
  let isTwistRequested = false;

  if (TWIST_PATTERNS.some(p => p.test(clean))) {
    isTwistRequested = true;
    if (!narrativeCues.includes('twist')) narrativeCues.push('twist');
    if (!themes.includes('twist')) themes.push('twist');
    if (!tones.includes('twist_mindbending')) tones.push('twist_mindbending');
  }

  for (const p of SPECIFIC_PLOT_PATTERNS) {
    const m = clean.match(p);
    if (m && m[0] && !narrativeCues.includes(m[0].toLowerCase())) {
      narrativeCues.push(m[0].toLowerCase());
    }
  }

  for (const p of SETTING_PATTERNS) {
    const m = clean.match(p);
    if (m && m[0] && !narrativeCues.includes(m[0].toLowerCase())) {
      narrativeCues.push(m[0].toLowerCase());
    }
  }

  for (const t of themes) {
    if (!narrativeCues.includes(t.toLowerCase())) {
      narrativeCues.push(t.toLowerCase());
    }
  }

  const hasNarrativeConstraint = isTwistRequested || narrativeCues.length > 0 || spatialSettings.length > 0;

  // 10. Calcul de l'intention globale structurée (Niveau 1)
  // Vrai dès qu'une entité humaine, un cadre spatial, une situation ou un ton/twist est identifié
  const hasStructuredIntent =
    actors.length > 0 ||
    directors.length > 0 ||
    spatialSettings.length > 0 ||
    situations.length > 0 ||
    tones.length > 0 ||
    isTwistRequested ||
    year !== undefined ||
    era !== undefined ||
    format !== 'all';

  // Le critère dur pour le Niveau 1 inclut désormais l'ensemble de l'intention structurée (acteur ET cadre spatial/situation)
  const hasHardCriteria = hasStructuredIntent;

  // 11. Entité Principale (pour le Recadrage et l'orientation)
  // Priorité : Acteur majeur > Réalisateur majeur > Cadre spatial > Genre majeur > Thème dominant > Mots clés
  let primaryEntity: string | undefined;
  if (actors.length > 0) {
    primaryEntity = actors[0];
  } else if (directors.length > 0) {
    primaryEntity = directors[0];
  } else if (spatialSettings.length > 0) {
    primaryEntity = spatialSettings[0] === 'souterrain' ? 'Souterrain / Huis clos' : spatialSettings[0].replace(/_/g, ' ');
  } else if (genres.length > 0) {
    primaryEntity = genres[0];
  } else if (themes.length > 0) {
    primaryEntity = themes[0];
  } else if (era) {
    primaryEntity = era;
  } else {
    // 2-3 premiers mots signifiants
    const meaningful = clean
      .replace(/^(un|une|le|la|les|cherche|trouve|film|série)\s+/gi, '')
      .split(/\s+/)
      .slice(0, 3)
      .join(' ');
    if (meaningful.length > 2) {
      primaryEntity = meaningful;
    }
  }

  return {
    actors,
    directors,
    spatialSettings,
    situations,
    tones,
    genres,
    era,
    year,
    format,
    themes,
    narrativeCues,
    isTwistRequested,
    hasNarrativeConstraint,
    hasStructuredIntent,
    primaryEntity,
    hasHardCriteria
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// BASE SÉMANTIQUE DE TWISTS & RE-RANKING NARRATIF
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// DÉMARCHE SCIENTIFIQUE : CLUSTERS THÉMATIQUES & SCORING CONTINU MULTI-CRITÈRES
// ══════════════════════════════════════════════════════════════════════════════

export interface ThematicCluster {
  id: string;
  triggers: string[];
  primaryKeywords: string[];
  secondaryKeywords: string[];
  expectedGenres: number[];
  conflictingGenres: number[];
  archetypeTitles: string[];
  disqualifiedTitles: string[];
}

export const KNOWN_TWIST_MOVIES = new Set([
  'shutter island', 'inception', 'les infiltrés', 'the departed',
  'fight club', 'sixième sens', 'sixieme sens', 'the sixth sense',
  'les autres', 'the others', 'usual suspects', 'the usual suspects',
  'memento', 'le prestige', 'the prestige', 'seven', 'se7en',
  'gone girl', 'oldboy', 'peur primale', 'primal fear',
  'interstellar', 'saw', 'the mist', 'incendies', 'get out',
  'parasite', 'mulholland drive', 'donnie darko', 'american psycho',
  'prisoners', 'identity', 'vanilla sky', "l'armée des 12 singes",
  '12 monkeys', 'split', 'ex machina', 'premier contact', 'arrival',
  'predestination', "l'effet papillon", 'the butterfly effect',
  'coherence', 'triangle', 'the game', 'black swan', 'mystic river'
]);

export const KNOWN_NON_TWIST_MOVIES = new Set([
  'titanic', 'le loup de wall street', 'the wolf of wall street',
  'django unchained', 'the revenant', 'gangs of new york',
  'gatsby le magnifique', 'the great gatsby', 'arrête-moi si tu peux',
  'arrete-moi si tu peux', 'catch me if you can', 'blood diamond',
  'aviator', 'the aviator', 'j. edgar', 'la plage', 'the beach',
  'la la land', 'forrest gump', 'le parrain', 'the godfather',
  'gladiator', 'braveheart', 'notting hill', 'coup de foudre à notting hill'
]);

export const THEMATIC_LEXICON_CLUSTERS: ThematicCluster[] = [
  {
    id: 'braquage',
    triggers: ['braquage', 'braquer', 'braqueur', 'casse', 'hold-up', 'holdup', 'cambriolage', 'heist', 'vol de banque'],
    primaryKeywords: ['braquage', 'braquages', 'braquer', 'braqueurs', 'braqueur', 'casse', 'hold-up', 'holdup', 'cambriolage', 'cambrioleur', 'dévaliser', 'coffre-fort', 'butin'],
    secondaryKeywords: ['vol', 'voleur', 'voleurs', 'dérober', 'extraction', 'infiltration', 'escroc', 'escrocs', 'escroquerie', 'faussaire', 'arnaque', 'gang', 'gangsters', 'pègre', 'lingots', 'diamants', 'banque'],
    expectedGenres: [80, 53, 28, 9648],
    conflictingGenres: [10749, 10751, 10402],
    archetypeTitles: ['inception', 'heat', "ocean's eleven", 'oceans eleven', 'the town', 'inside man', 'baby driver', 'reservoir dogs', 'snatch', 'the italian job', 'point break', 'arrête-moi si tu peux', 'arrete-moi si tu peux', 'catch me if you can', 'les infiltrés', 'the departed', 'den of thieves', 'triple 9'],
    disqualifiedTitles: ['titanic', 'romeo + juliet', 'roméo + juliette', 'gatsby le magnifique', 'the great gatsby', 'revolutionary road', 'les noces rebelles', 'la la land', 'notting hill']
  },
  {
    id: 'twist',
    triggers: ['twist', 'retournement', 'dénouement', 'fin surprenante', 'chute'],
    primaryKeywords: ['twist', 'retournement', 'dénouement', 'chute', 'révélation', 'illusion', 'hallucination', 'psychiatrique', 'asile', 'schizophr'],
    secondaryKeywords: ['secret', 'vérité', 'double jeu', 'mensonge', 'machination', 'paranoïa', 'complot', 'infiltr'],
    expectedGenres: [53, 9648, 878, 27, 80],
    conflictingGenres: [10749, 35, 10751],
    archetypeTitles: ['shutter island', 'inception', 'fight club', 'sixième sens', 'les autres', 'usual suspects', 'memento', 'le prestige', 'seven', 'gone girl', 'oldboy', 'prisoners'],
    disqualifiedTitles: ['titanic', 'le loup de wall street', 'django unchained', 'the revenant', 'gatsby le magnifique']
  },
  {
    id: 'survie',
    triggers: ['survie', 'survival', 'survivre', 'seul au monde', 'naufragé', 'naufrage'],
    primaryKeywords: ['survie', 'survivre', 'survivant', 'survivants', 'naufrage', 'naufragé', 'sauvetage', 'seul au monde', 'isolement'],
    secondaryKeywords: ['oxygène', 'famine', 'froid', 'blizzard', 'faim', 'danger', 'piège', 'crash'],
    expectedGenres: [12, 18, 53, 28, 878],
    conflictingGenres: [35, 10402, 10751],
    archetypeTitles: ['seul au monde', 'cast away', 'the revenant', 'le revenant', '127 heures', '127 hours', 'gravity', 'the martian', 'seul sur mars', 'into the wild', 'alive', 'les survivants', 'le territoire des loups', 'the grey'],
    disqualifiedTitles: ['titanic', 'la la land']
  },
  {
    id: 'amnesie',
    triggers: ['amnésie', 'amnesie', 'amnésique', 'amnesique', 'perte de mémoire', 'perte de memoire'],
    primaryKeywords: ['amnésie', 'amnesie', 'amnésique', 'amnesique', 'mémoire', 'memoire', 'souvenir', 'souvenirs', 'oubli', 'oublier'],
    secondaryKeywords: ['identité', 'identite', 'passé', 'passe', 'qui suis-je', 'inconnu', 'traumatisme', 'réveil'],
    expectedGenres: [9648, 53, 878],
    conflictingGenres: [10749, 35],
    archetypeTitles: ['memento', 'la mémoire dans la peau', 'the bourne identity', 'shutter island', 'total recall', 'paycheck', 'dark city'],
    disqualifiedTitles: ['titanic', 'django unchained']
  },
  {
    id: 'huis_clos',
    triggers: ['huis clos', 'huis-clos', 'enfermé', 'claustrophobe', 'piégé', 'piégés'],
    primaryKeywords: ['huis clos', 'huis-clos', 'enfermé', 'enfermés', 'piégé', 'piege', 'piégés', 'claustrophobe', 'bunker'],
    secondaryKeywords: ['prisonniers', 'otage', 'otages', 'isolement', 'bloqué', 'bloqués'],
    expectedGenres: [53, 27, 9648, 18],
    conflictingGenres: [12, 10751],
    archetypeTitles: ['12 hommes en colère', '12 angry men', 'the guilty', 'buried', 'cube', 'the platform', 'la plateforme', 'panic room', 'misery', 'saw'],
    disqualifiedTitles: ['titanic', 'interstellar', 'gladiator']
  },
  {
    id: 'vengeance',
    triggers: ['vengeance', 'se venger', 'justicier', 'vendetta', 'revanche'],
    primaryKeywords: ['vengeance', 'venger', 'revanche', 'vendetta', 'justicier'],
    secondaryKeywords: ['massacre', 'tuer', 'traque', 'châtiment', 'ennemi', 'famille assassinée', 'assassinat'],
    expectedGenres: [28, 80, 53, 18],
    conflictingGenres: [10749, 10751],
    archetypeTitles: ['john wick', 'kill bill', 'gladiator', 'django unchained', 'oldboy', 'memento', 'taken', 'the revenant', 'leon', 'the equalizer'],
    disqualifiedTitles: ['titanic', 'la la land', 'notting hill']
  }
];

export function findActiveThematicCluster(criteria: ExtractedCriteria, queryText?: string): ThematicCluster | null {
  const haystacks = [
    ...(criteria.narrativeCues || []),
    ...(criteria.themes || []),
    ...(criteria.tones || []),
    queryText || ''
  ].map(s => s.toLowerCase());

  if (criteria.isTwistRequested) {
    const twistCluster = THEMATIC_LEXICON_CLUSTERS.find(c => c.id === 'twist');
    if (twistCluster) return twistCluster;
  }

  for (const cluster of THEMATIC_LEXICON_CLUSTERS) {
    for (const h of haystacks) {
      if (cluster.triggers.some(tr => h.includes(tr))) {
        return cluster;
      }
    }
  }

  return null;
}

/**
 * Évalue scientifiquement si une œuvre cinématographique respecte la contrainte narrative.
 * Démarche multi-critères : Personne (35%) + Thématique continue (45%) + Genres (20%) + Ajustement Bayésien.
 * Élimine formellement les faux positifs (comme Titanic pour "dicaprio braquage").
 */
export function evaluateMovieNarrativeRelevance(
  movie: { title?: string; original_title?: string; overview?: string; genre_ids?: number[]; genres?: any[]; vote_count?: number; vote_average?: number },
  criteria: ExtractedCriteria,
  rawItem?: { tier?: number; match_rate?: number; reason?: string }
): { matches: boolean; score: number; reason: string } {
  if (!criteria.hasNarrativeConstraint && criteria.actors.length === 0 && criteria.directors.length === 0) {
    return { matches: true, score: 95, reason: 'Aucune contrainte narrative restrictive' };
  }

  const titleLower = (movie.title || '').toLowerCase().trim();
  const origLower = (movie.original_title || '').toLowerCase().trim();
  const overviewLower = (movie.overview || '').toLowerCase();
  const genreIds = (Array.isArray(movie.genre_ids) ? movie.genre_ids : (Array.isArray(movie.genres) ? movie.genres.map((g: any) => typeof g === 'number' ? g : g?.id) : [])) as number[];
  const voteCount = Number(movie.vote_count || 0);
  const voteAvg = Number(movie.vote_average || 0);

  const activeCluster = findActiveThematicCluster(criteria);

  // 1. DISQUALIFICATION STRICTE FORMELLE
  if (activeCluster) {
    // A. Titre formellement incompatible
    if (activeCluster.disqualifiedTitles.some(d => titleLower === d || origLower === d || titleLower.includes(d))) {
      return {
        matches: false,
        score: 28,
        reason: `Exclu : "${movie.title}" ne comporte aucun élément lié à « ${activeCluster.id} » (hors-sujet formel)`
      };
    }

    // B. Genres purement incompatibles sans aucun mot-clé du thème
    const isArchetype = activeCluster.archetypeTitles.some(a => titleLower === a || origLower === a || titleLower.includes(a));
    let clusterHits = 0;
    for (const kw of activeCluster.primaryKeywords) {
      if (overviewLower.includes(kw) || titleLower.includes(kw)) clusterHits += 3;
    }
    for (const kw of activeCluster.secondaryKeywords) {
      if (overviewLower.includes(kw)) clusterHits += 1.5;
    }

    const hasExpectedGenre = activeCluster.expectedGenres.some(id => genreIds.includes(id));
    const isPureConflicting = genreIds.length > 0 && genreIds.every(id => activeCluster.conflictingGenres.includes(id));

    if (!isArchetype && clusterHits === 0 && (isPureConflicting || (!hasExpectedGenre && genreIds.includes(10749)))) {
      return {
        matches: false,
        score: 32,
        reason: `Exclu : genre incompatible (${movie.title} est une romance/drame sans rapport avec « ${activeCluster.id} »)`
      };
    }
  }

  // 2. DÉMARCHE SCIENTIFIQUE CONTINUE MULTI-CRITÈRES

  // A. Sous-score Personne / Casting (poids 0.35)
  let personScore = 100;
  const primaryPerson = criteria.actors[0] || criteria.directors[0];
  if (primaryPerson) {
    const pLower = primaryPerson.toLowerCase();
    const inOverview = overviewLower.includes(pLower);
    const inTitle = titleLower.includes(pLower);
    // Si la recherche ciblait cette personne et qu'elle est vérifiée
    personScore = (inOverview || inTitle || (rawItem && rawItem.match_rate && rawItem.match_rate > 70)) ? 100 : 90;
  }

  // B. Sous-score Thématique / Narratif (poids 0.45)
  let thematicScore = 70;
  let thematicReason = 'Cohérence scénaristique globale';

  if (activeCluster) {
    const isArchetype = activeCluster.archetypeTitles.some(a => titleLower === a || origLower === a || titleLower.includes(a));
    if (isArchetype) {
      thematicScore = 98;
      thematicReason = `Chef-d'œuvre de référence du thème « ${activeCluster.id} »`;
    } else {
      let hits = 0;
      const matchedTokens: string[] = [];
      for (const kw of activeCluster.primaryKeywords) {
        if (overviewLower.includes(kw) || titleLower.includes(kw)) {
          hits += 3;
          if (matchedTokens.length < 3) matchedTokens.push(kw);
        }
      }
      for (const kw of activeCluster.secondaryKeywords) {
        if (overviewLower.includes(kw)) {
          hits += 1.5;
          if (matchedTokens.length < 3) matchedTokens.push(kw);
        }
      }

      if (hits > 0) {
        thematicScore = Math.min(97, Math.max(72, 70 + Math.round(hits * 7)));
        thematicReason = `Correspondance scénaristique forte (${matchedTokens.join(', ')})`;
      } else {
        // Aucun mot clé du cluster présent
        const hasExpected = activeCluster.expectedGenres.some(id => genreIds.includes(id));
        thematicScore = hasExpected ? 58 : 35;
        thematicReason = `Thème « ${activeCluster.id} » peu présent dans le synopsis`;
      }
    }
  } else if (criteria.narrativeCues.length > 0) {
    let cuesHit = 0;
    for (const cue of criteria.narrativeCues) {
      if (overviewLower.includes(cue.toLowerCase()) || titleLower.includes(cue.toLowerCase())) cuesHit++;
    }
    thematicScore = cuesHit > 0 ? 92 : 62;
  }

  // C. Sous-score Genre (poids 0.20)
  let genreScore = 75;
  if (activeCluster) {
    if (activeCluster.expectedGenres.some(id => genreIds.includes(id))) {
      genreScore = 95;
    } else if (genreIds.includes(18)) { // Drame
      genreScore = 70;
    } else {
      genreScore = 40;
    }
  }

  // D. Composante Bayésienne de Qualité (Delta [-4, +4] assurant des scores uniques et réalistes)
  const bayesRating = voteCount > 0
    ? (voteCount * voteAvg + 1000 * 6.5) / (voteCount + 1000)
    : 6.5;
  const qualityDelta = (bayesRating - 7.0) * 2.5;

  // E. Score composite global
  const hasPerson = Boolean(primaryPerson);
  const composite = hasPerson
    ? (personScore * 0.35) + (thematicScore * 0.45) + (genreScore * 0.20) + qualityDelta
    : (thematicScore * 0.70) + (genreScore * 0.30) + qualityDelta;

  const finalScore = Math.min(99, Math.max(25, Math.round(composite)));
  const matches = finalScore >= 75 && thematicScore >= 60;

  return {
    matches,
    score: finalScore,
    reason: `${primaryPerson ? `${primaryPerson} — ` : ''}${thematicReason}`
  };
}

/**
 * Évalue si une œuvre cinématographique correspond à l'intention globale structurée (Niveau 1) :
 * - Conjonction stricte Acteur + Twist/Décor
 * - OU Cadre spatial / Décor (souterrain, espace, huis clos) + Ton (angoissant, suspense)
 */
export function evaluateStructuredMovieMatch(
  movie: { title?: string; original_title?: string; overview?: string; genre_ids?: number[]; genres?: any[] },
  criteria: ExtractedCriteria,
  rawItem?: { tier?: number; match_rate?: number; reason?: string }
): { matches: boolean; score: number; reason: string } {
  // 0. Si aucun critère d'intention structuré n'a été extrait (ex: requête vague ou hors-sujet)
  if (!criteria.hasStructuredIntent && !criteria.hasHardCriteria) {
    return {
      matches: false,
      score: 50,
      reason: 'Aucun critère structuré exploitable pour le Niveau 1'
    };
  }

  // 1. Si une contrainte de twist est demandée, appliquer le filtre twist strict
  if (criteria.isTwistRequested) {
    return evaluateMovieNarrativeRelevance(movie, criteria, rawItem);
  }

  const titleLower = (movie.title || '').toLowerCase().trim();
  const origLower = (movie.original_title || '').toLowerCase().trim();
  const overviewLower = (movie.overview || '').toLowerCase();
  const genreIds = (Array.isArray(movie.genre_ids) ? movie.genre_ids : (Array.isArray(movie.genres) ? movie.genres.map((g: any) => typeof g === 'number' ? g : g?.id) : [])) as number[];

  // 2. Évaluation des cadres spatiaux et décors (ex: sous terre, espace, huis clos)
  if (criteria.spatialSettings && criteria.spatialSettings.length > 0) {
    let bestSettingScore = 0;
    let matchReason = '';

    for (const settingKey of criteria.spatialSettings) {
      const settingDef = SPATIAL_SETTINGS_MAP[settingKey];
      if (!settingDef) continue;

      // A. Titre archétypal majeur du cadre spatial
      const isArchetype = settingDef.archetypeFilms.some(
        f => titleLower === f.toLowerCase() || origLower === f.toLowerCase() || titleLower.includes(f.toLowerCase())
      );
      if (isArchetype) {
        bestSettingScore = Math.max(bestSettingScore, 98);
        matchReason = `Chef-d'œuvre de référence en décor ${settingDef.id} (${movie.title})`;
        break;
      }

      // B. Genres attendus et mots-clés du synopsis
      const matchesGenre = settingDef.expectedGenres.some(gid => genreIds.includes(gid));
      const matchingKws = settingDef.keywords.filter(kw => overviewLower.includes(kw));

      // C. Validation conjointe Décor + Ton (ex: souterrain + angoissant)
      const isDistressingTone = criteria.tones.some(t => ['distressing', 'angoissant', 'claustrophobe'].includes(t));
      const hasHorrorThriller = genreIds.some(gid => [27, 53].includes(gid));

      if (matchingKws.length >= 1 && (matchesGenre || matchingKws.length >= 2)) {
        let calculatedScore = 90 + Math.min(7, matchingKws.length * 2);
        if (isDistressingTone && hasHorrorThriller) calculatedScore += 2;
        if (calculatedScore > bestSettingScore) {
          bestSettingScore = calculatedScore;
          matchReason = `Atmosphère ${settingDef.id} validée avec composante ${criteria.tones.join(', ') || 'immersive'} (${matchingKws.slice(0, 2).join(', ')})`;
        }
      }
    }

    if (bestSettingScore >= 90) {
      return {
        matches: true,
        score: Math.min(99, bestSettingScore),
        reason: matchReason
      };
    }

    // Si le cadre spatial était formellement requis mais est absent du film
    return {
      matches: false,
      score: 60,
      reason: `Cadre spatial spécifique (${criteria.spatialSettings.join(', ')}) non présent dans ce film`
    };
  }

  // 3. Repli sur l'évaluation narrative classique
  return evaluateMovieNarrativeRelevance(movie, criteria, rawItem);
}

export default analyzeSearchIntent;


