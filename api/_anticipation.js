/**
 * « Degré d'attente » ranking for titles that are not released yet.
 *
 * The Prochainement column must surface what the audience is waiting for, never what happens
 * to come out first. TMDB popularity alone cannot do that: it is inflated by the release
 * itself (a small film opening next week outranks a blockbuster announced for next season)
 * and it barely separates two far-away titles. Four signals are therefore combined:
 *
 *   buzz       TMDB popularity, blended between its absolute value and its standing among
 *              titles at the same distance from release (removes the imminence inflation)
 *   trending   presence and position in the day/week trending feeds (explicit intent)
 *   awareness  early ratings/screenings, i.e. a title that already has an audience
 *   scale      franchise weight (votes of the previous instalments) or stature of the
 *              platform for a series, i.e. what makes a release awaited rather than merely near
 *
 * The release date is not a signal at all: it only breaks ties between equal scores.
 */

export const HYPE_WEIGHTS = { buzz: 0.45, trending: 0.2, awareness: 0.08, scale: 0.27 };

export const BUZZ_BLEND = { absolute: 0.45, relative: 0.55 };

/** A TMDB popularity of this value or more is maximum buzz. */
export const BUZZ_SATURATION = 200;
/** A vote count of this value or more is maximum pre-release awareness. */
export const AWARENESS_SATURATION = 5000;
/** Votes on the biggest previous instalment considered a maximum-weight franchise. */
export const FRANCHISE_SATURATION = 15000;
/** Number of previous instalments considered a maximum-length saga. */
export const FRANCHISE_PARTS_SATURATION = 6;
/** Votes on a series considered a maximum-size returning audience. */
export const SERIES_AUDIENCE_SATURATION = 5000;
/** Depth of the TMDB trending feeds used for the rank decay. */
export const TRENDING_DEPTH = 20;

/** Scores above these thresholds earn a visible anticipation badge. */
export const HYPE_THRESHOLD = { veryHigh: 0.55, high: 0.35 };

/** Upper bounds, in days, of the release windows used to compare titles with each other. */
export const RELEASE_WINDOW_DAYS = [14, 28, 56, 91, 133, 183];

/** Platforms whose own announcement already creates anticipation. */
export const MAJOR_NETWORKS = [
  'netflix', 'hbo', 'max', 'disney+', 'apple tv', 'prime video', 'amazon', 'canal+',
  'bbc', 'showtime', 'amc', 'fx', 'paramount+', 'hulu', 'peacock', 'arte'
];

const round = value => Math.round(value * 10000) / 10000;
const clamp01 = value => (Number.isFinite(value) ? Math.min(1, Math.max(0, Number(value))) : 0);

export function saturate(value, ceiling) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(1, Math.log10(1 + numeric) / Math.log10(1 + ceiling));
}

/** Position in a trending feed, 1 being the most looked-at title of the day/week. */
export function trendingStrength(rank) {
  const numeric = Number(rank);
  if (!Number.isFinite(numeric) || numeric < 1) return 0;
  return Math.max(0, (TRENDING_DEPTH - numeric + 1) / TRENDING_DEPTH);
}

/**
 * Weight of a saga: how big the previous instalments were (their vote count is the audience
 * they already gathered) and how many of them exist.
 */
export function franchiseStrength(collection) {
  const parts = Array.isArray(collection?.parts) ? collection.parts : [];
  if (!parts.length) return 0;
  const previousVotes = parts.reduce((best, part) => Math.max(best, Number(part?.vote_count) || 0), 0);
  // Square root rather than a log: a sequel whose previous film gathered 40 votes is not a saga,
  // while Sonic (≈6k) must stay clearly below Avengers (≈30k).
  const byAudience = Math.sqrt(clamp01(previousVotes / FRANCHISE_SATURATION));
  const byLength = Math.min(1, Math.log2(1 + parts.length) / Math.log2(1 + FRANCHISE_PARTS_SATURATION));
  return round(0.8 * byAudience + 0.2 * byLength);
}

export function networkStrength(networks) {
  if (!Array.isArray(networks) || !networks.length) return 0;
  return networks.some(network => {
    const name = String(network?.name || '').toLowerCase();
    return MAJOR_NETWORKS.some(major => name.includes(major));
  }) ? 1 : 0;
}

/**
 * A new series on a big platform is only a promise, while a returning series already has an
 * audience. Both are weighed, the accumulated audience first.
 */
export function seriesScale({ networks = [], numberOfSeasons = 0, voteCount = 0 } = {}) {
  const audience = Math.sqrt(clamp01((Number(voteCount) || 0) / SERIES_AUDIENCE_SATURATION));
  const returning = clamp01(((Number(numberOfSeasons) || 0) - 1) / 2);
  return round(0.5 * audience + 0.3 * returning + 0.2 * networkStrength(networks));
}

/** Scale of a release: franchise weight for a film, platform stature for a series. */
export function scaleSignal({ collection, networks = [], numberOfSeasons = 0, voteCount = 0 } = {}) {
  const franchise = franchiseStrength(collection);
  if (franchise > 0) return franchise;
  return seriesScale({ networks, numberOfSeasons, voteCount });
}

export function anticipationScore(signals) {
  const absoluteBuzz = saturate(signals.popularity, BUZZ_SATURATION);
  const relativeBuzz = Number.isFinite(signals.buzzPercentile) ? clamp01(signals.buzzPercentile) : null;
  const buzz = relativeBuzz === null
    ? absoluteBuzz
    : absoluteBuzz * BUZZ_BLEND.absolute + relativeBuzz * BUZZ_BLEND.relative;
  const trending = Math.max(trendingStrength(signals.weekRank), trendingStrength(signals.dayRank));
  const awareness = saturate(signals.voteCount, AWARENESS_SATURATION);
  const scale = clamp01(signals.scale);
  return round(buzz * HYPE_WEIGHTS.buzz
    + trending * HYPE_WEIGHTS.trending
    + awareness * HYPE_WEIGHTS.awareness
    + scale * HYPE_WEIGHTS.scale);
}

export function releaseWindow(daysUntilRelease) {
  for (let index = 0; index < RELEASE_WINDOW_DAYS.length; index++) {
    if (daysUntilRelease <= RELEASE_WINDOW_DAYS[index]) return index;
  }
  return RELEASE_WINDOW_DAYS.length;
}

/**
 * For every candidate, its popularity standing (0-1) among the candidates sharing its release
 * window. A title nobody talks about yet but releasing in three days no longer outranks the
 * most awaited title of the season just because its promotional noise is louder.
 */
export function relativeBuzzByReleaseWindow(items) {
  const buckets = new Map();
  items.forEach((item, index) => {
    const bucket = releaseWindow(item.daysUntilRelease);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(index);
  });
  const standings = new Array(items.length).fill(0.5);
  for (const indexes of buckets.values()) {
    const ordered = [...indexes].sort((a, b) => (Number(items[b].popularity) || 0) - (Number(items[a].popularity) || 0));
    const size = ordered.length;
    ordered.forEach((itemIndex, position) => {
      standings[itemIndex] = size > 1 ? (size - position - 1) / (size - 1) : 0.5;
    });
  }
  return standings;
}

export function hypeLevel(score) {
  if (!Number.isFinite(score)) return 0;
  if (score >= HYPE_THRESHOLD.veryHigh) return 2;
  return score >= HYPE_THRESHOLD.high ? 1 : 0;
}

/** Uses an already computed score when the caller has one, so both paths can never diverge. */
const scoreOf = item => (Number.isFinite(item.anticipation) ? Number(item.anticipation) : anticipationScore(item));

/** Highest anticipation first; the release date only breaks ties. */
export function rankByAnticipation(items) {
  return [...items].sort((a, b) => scoreOf(b) - scoreOf(a)
    || String(a.release_date || '').localeCompare(String(b.release_date || ''))
    || (Number(b.popularity) || 0) - (Number(a.popularity) || 0));
}
