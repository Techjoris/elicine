/**
 * Compréhension des plateformes de streaming citées dans la requête.
 *
 * « je veux un film d'horreur sur netflix » doit être compris comme
 * « films d'horreur » restreints aux œuvres réellement disponibles sur Netflix.
 * Ce module ne fait que la lecture du texte : il identifie la plateforme et
 * retire la mention de la requête transmise au moteur sémantique, pour que
 * « netflix » ne soit pas interprété comme un thème cinématographique.
 *
 * La vérification des disponibilités et le complément de résultats vivent dans
 * `platformAvailability.ts`.
 */

export interface PlatformIntent {
  /** Identifiant interne ('netflix', 'prime', ...). */
  id: string;
  /** Nom affiché ('Netflix', 'Prime Video', ...). */
  label: string;
  /** Identifiant du fournisseur TMDB (watch providers). */
  providerId: number;
  /** Portion de texte réellement reconnue. */
  matched: string;
  /** Requête débarrassée de la mention de plateforme. */
  cleanQuery: string;
}

interface PlatformDefinition {
  id: string;
  label: string;
  providerId: number;
  /** Motifs stricts : on évite « max » ou « prime » isolés, trop ambigus en français. */
  patterns: RegExp[];
}

const PLATFORMS: PlatformDefinition[] = [
  {
    id: 'netflix',
    label: 'Netflix',
    providerId: 8,
    patterns: [/\bnetflix\b/i]
  },
  {
    id: 'disney',
    label: 'Disney+',
    providerId: 337,
    patterns: [/\bdisney\s*\+/i, /\bdisney\s*plus\b/i, /\bdisney\b/i]
  },
  {
    id: 'canal',
    label: 'Canal+',
    providerId: 381,
    patterns: [/\bcanal\s*\+/i, /\bcanal\s*plus\b/i, /\bmycanal\b/i, /\bsur\s+canal\b/i]
  },
  {
    id: 'prime',
    label: 'Prime Video',
    providerId: 119,
    patterns: [/\bprime\s*vid[ée]o\b/i, /\bamazon\s*prime\b/i, /\bsur\s+prime\b/i]
  },
  {
    id: 'apple',
    label: 'Apple TV+',
    providerId: 350,
    patterns: [/\bapple\s*tv\b/i, /\bapple\s*\+/i]
  },
  {
    id: 'paramount',
    label: 'Paramount+',
    providerId: 531,
    patterns: [/\bparamount\s*\+/i, /\bparamount\s*plus\b/i, /\bparamount\b/i]
  },
  {
    id: 'max',
    label: 'Max (HBO)',
    providerId: 1899,
    patterns: [/\bhbo\s*max\b/i, /\bhbo\b/i, /\bsur\s+max\b/i, /\bmax\s*\(hbo\)/i]
  }
];

/**
 * Connecteurs optionnels précédant la plateforme : « sur », « disponible sur »,
 * « en streaming sur », « chez », « via »…
 */
const LEADING_CONNECTOR =
  String.raw`(?:(?:disponibles?|dispo|diffus[ée]es?|regardables?|[àa]\s+voir)\s+)?(?:sur|chez|via|avec|dans)\s+(?:la\s+|le\s+|l['’])?`;

function findMention(query: string, definition: PlatformDefinition): RegExpMatchArray | null {
  for (const pattern of definition.patterns) {
    const source = pattern.source.replace(/^\\b|\\b$/g, '');
    const withConnector = new RegExp(String.raw`(?:\b${LEADING_CONNECTOR}(?:${source})|(?:${source}))`, 'i');
    const match = query.match(withConnector);
    if (match && match[0].trim()) return match;
  }
  return null;
}

function stripMention(query: string, mention: string): string {
  const cleaned = query.replace(mention, ' ');
  return cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,;:.!?])/g, '$1')
    .replace(/^[\s,;:.!?-]+|[\s,;:.!?-]+$/g, '')
    .trim();
}

/**
 * Détecte une plateforme citée dans la requête.
 * Renvoie `null` si aucune plateforme n'est reconnue.
 */
export function detectPlatformIntent(query: string): PlatformIntent | null {
  const text = String(query || '').trim();
  if (!text) return null;

  for (const definition of PLATFORMS) {
    const match = findMention(text, definition);
    if (!match) continue;
    return {
      id: definition.id,
      label: definition.label,
      providerId: definition.providerId,
      matched: match[0].trim(),
      cleanQuery: stripMention(text, match[0])
    };
  }

  return null;
}
