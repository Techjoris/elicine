/**
 * Bilingual concept equivalence for the scoring layer.
 *
 * The semantic interpreter writes concepts in English (interpreter rule 8)
 * while the catalogue is fetched in French (`language=fr-FR`). A literal token
 * comparison therefore misses the described work on every French overview, and
 * a popularity-driven candidate can win a query it does not answer. This table
 * gives each concept the wordings the metadata actually uses.
 *
 * It is a bounded, generic cinematographic vocabulary: no title, no identifier,
 * no score and no provider fact. It retrieves nothing; it only widens the text
 * comparison the ranking already performs, identically for films and series.
 *
 * Each group holds equivalent wordings only. A group applies to a concept when
 * it covers every content word of that concept, so a specific concept is never
 * answered by a broader one: "aviation militaire" must not be satisfied by a
 * plain "war" overview just because the group knows "militaire".
 *
 * Two guards keep the widening honest, and both are needed:
 *  - coverage: every content word of the concept must belong to the group, so
 *    an unrelated group can never answer it;
 *  - specificity: a wording is kept only at the concept's own granularity, so
 *    "dreams" never answers "shared dreams" while "rêves" still answers
 *    "dreams". Without it the equivalence silently broadens what the query
 *    asked for and a derivative candidate can outscore the described work.
 */

const normalize = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

/** One entry per concept: English wordings first, French wordings after. */
const CONCEPT_GROUPS = Object.freeze([
  ['dream', 'dreams', 'dreaming', 'dream world', 'shared dreams', 'shared dream', 'rêve', 'rêves', 'rêver', 'songe', 'onirique', 'rêves partagés', 'rêve partagé'],
  ['subconscious', 'unconscious', 'subconscious mind', 'subconscient', 'inconscient'],
  ['spy', 'spies', 'espionage', 'secret agent', 'undercover', 'russian spy', 'espion', 'espionne', 'espionnage', 'agent secret', 'espionne russe', 'espion russe', 'infiltration'],
  ['war', 'warfare', 'soldier', 'soldiers', 'battle', 'combat', 'guerre', 'militaire', 'militaires', 'soldat', 'soldats', 'bataille', 'combattant', 'combattants'],
  ['modern warfare', 'guerre moderne', 'conflit moderne'],
  ['military aviation', 'aviation militaire', 'aviation', 'air force', 'aircraft', 'plane', 'planes', 'pilot', 'pilots', 'avion', 'avions', 'armée de l air', 'aérien', 'aérienne', 'pilote', 'pilotes'],
  ['fighter aircraft', 'fighter jet', 'fighter jets', 'jet fighter', 'fighter pilots', 'aerial combat', 'avion de combat', 'avions de combat', 'avion de chasse', 'avions de chasse', 'pilote de chasse', 'pilotes de chasse', 'combat aérien', 'chasseur'],
  ['special forces', 'special operations', 'commando', 'navy seal', 'navy seals', 'forces spéciales', 'forces speciales'],
  ['army', 'armed forces', 'armée', 'forces armées', 'troupe', 'troupes'],
  ['memory', 'memories', 'amnesia', 'mémoire', 'mémoires', 'amnésie', 'souvenir', 'souvenirs', 'oubli'],
  ['identity', 'identité', 'identity crisis', 'crise identitaire'],
  ['murder', 'murders', 'homicide', 'killing', 'meurtre', 'meurtres', 'homicide', 'assassinat', 'tuerie', 'tueur'],
  ['serial killer', 'serial killers', 'tueur en série', 'tueurs en série'],
  ['police investigation', 'investigation', 'detective', 'police', 'inspector', 'enquête', 'enquête policière', 'policier', 'policière', 'inspecteur', 'détective'],
  ['psychological thriller', 'psycho thriller', 'thriller psychologique'],
  ['psychological', 'psychology', 'psychologique', 'psychique', 'mental', 'mentale'],
  ['dark', 'darkness', 'bleak', 'grim', 'sombre', 'ténèbres', 'ténébreux', 'obscur', 'obscurité'],
  ['cancer', 'illness', 'terminal illness', 'maladie', 'cancer'],
  ['drug', 'drugs', 'drug dealing', 'drug trade', 'methamphetamine', 'drogue', 'drogues', 'trafic de drogue', 'méthamphétamine', 'stupéfiants', 'dealer'],
  ['chemistry', 'chemist', 'teacher', 'professor', 'chimie', 'chimiste', 'professeur', 'enseignant', 'professeur de chimie'],
  ['prison', 'jail', 'inmate', 'penitentiary', 'prison', 'pénitencier', 'détenu', 'détenus', 'cellule', 'incarcération'],
  ['revenge', 'vengeance', 'revanche', 'représailles'],
  ['heist', 'robbery', 'burglary', 'holdup', 'casse', 'braquage', 'cambriolage', 'vol', 'hold up'],
  ['space', 'outer space', 'cosmos', 'espace', 'spatial', 'spatiale', 'cosmos', 'orbite', 'galaxie'],
  ['alien', 'aliens', 'extraterrestrial', 'extraterrestre', 'extraterrestres'],
  ['time travel', 'time loop', 'voyage dans le temps', 'voyage temporel', 'boucle temporelle'],
  ['magic', 'sorcery', 'wizard', 'magie', 'sorcellerie', 'sorcier', 'magicien'],
  ['ghost', 'ghosts', 'haunted', 'fantôme', 'fantômes', 'hanté', 'hantée'],
  ['monster', 'monsters', 'creature', 'monstre', 'monstres', 'créature', 'créatures'],
  ['submarine', 'underwater', 'sous marin', 'sous marins', 'sous marinier', 'sous l eau'],
  ['mafia', 'mob', 'gangster', 'organized crime', 'mafia', 'mafieux', 'gangster', 'crime organisé'],
  ['dystopia', 'dystopian', 'post apocalyptic', 'dystopie', 'dystopique', 'post apocalyptique', 'apocalypse'],
  ['survival', 'survive', 'survivalist', 'survie', 'survivre', 'survivant', 'survivants', 'naufragé', 'naufragés'],
  ['island', 'île', 'îles', 'insulaire'],
  ['asylum', 'psychiatric hospital', 'mental hospital', 'asile', 'hôpital psychiatrique'],
  ['cold war', 'guerre froide'],
  ['nuclear', 'atomic', 'nucléaire', 'atomique', 'atome'],
  ['terrorism', 'terrorist', 'terrorisme', 'terroriste', 'attentat'],
  ['journalist', 'reporter', 'journaliste', 'reporter', 'presse'],
  ['family', 'famille', 'familial', 'familiale'],
  ['friendship', 'amitié', 'ami', 'amis', 'copains'],
  ['romance', 'romantic', 'love', 'amour', 'romantique', 'amoureux', 'amoureuse'],
  ['betrayal', 'trahison', 'traître', 'trahisons'],
  ['small town', 'petite ville', 'village', 'rural', 'province'],
  ['oppressive', 'claustrophobic', 'oppressant', 'oppressante', 'claustrophobe', 'étouffant'],
  ['melancholic', 'melancholy', 'grief', 'mélancolique', 'mélancolie', 'deuil', 'tristesse'],
  ['desert', 'désert', 'déserts'],
  ['ocean', 'sea', 'océan', 'mer', 'marin', 'maritime'],
  ['winter', 'snow', 'hiver', 'neige', 'neigeux']
]);

// Function words never carry a concept and differ between languages ("de",
// "the", "of"): dropping them lets a French and an English wording of the same
// concept share the same granularity.
const STOPWORDS = Object.freeze(new Set(['de', 'du', 'des', 'la', 'le', 'les', 'un', 'une', 'et',
  'en', 'au', 'aux', 'the', 'of', 'and', 'a', 'an', 'to', 'in', 'on', 'with', 'l', 'd']));

const contentTokens = value => [...new Set(normalize(value).split(' ')
  .filter(token => token.length > 1 && !STOPWORDS.has(token)))];
const GROUP_INDEX = Object.freeze(CONCEPT_GROUPS.map(group => Object.freeze({
  members: Object.freeze(group.map(normalize)),
  vocabulary: Object.freeze(new Set(group.flatMap(contentTokens)))
})));

/**
 * A concept plus every wording the same concept may take in the metadata.
 * Unknown concepts return themselves, so the caller always has a usable list.
 * A group only applies when it covers every content word of the concept, which
 * keeps a specific concept from being satisfied by a broader one, and only
 * same-granularity wordings are added, so equivalence never broadens the ask.
 */
export function conceptVariants(term) {
  const key = normalize(term);
  if (!key) return [];
  const wanted = contentTokens(key);
  const variants = new Set([key]);
  for (const group of GROUP_INDEX) {
    if (!wanted.every(token => group.vocabulary.has(token))) continue;
    for (const member of group.members) {
      if (contentTokens(member).length !== wanted.length) continue;
      variants.add(member);
    }
  }
  return [...variants];
}
