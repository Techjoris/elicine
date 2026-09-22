export interface AnticipationSignals {
  popularity?: number | null;
  voteCount?: number | null;
  weekRank?: number | null;
  dayRank?: number | null;
  daysUntilRelease: number;
  /** Standing (0-1) among titles at the same distance from release. */
  buzzPercentile?: number | null;
  /** Franchise weight or platform stature, 0-1. */
  scale?: number | null;
}

export interface CollectionLike {
  parts?: Array<{ vote_count?: number | null }> | null;
}

export interface ScaleInput {
  collection?: CollectionLike | null;
  networks?: Array<{ name?: string | null }> | null;
  numberOfSeasons?: number | null;
  voteCount?: number | null;
}

export declare const HYPE_WEIGHTS: { buzz: number; trending: number; awareness: number; scale: number };
export declare const BUZZ_BLEND: { absolute: number; relative: number };
export declare const BUZZ_SATURATION: number;
export declare const AWARENESS_SATURATION: number;
export declare const FRANCHISE_SATURATION: number;
export declare const FRANCHISE_PARTS_SATURATION: number;
export declare const SERIES_AUDIENCE_SATURATION: number;
export declare const TRENDING_DEPTH: number;
export declare const HYPE_THRESHOLD: { veryHigh: number; high: number };
export declare const RELEASE_WINDOW_DAYS: number[];
export declare const MAJOR_NETWORKS: string[];

export declare function saturate(value: number | null | undefined, ceiling: number): number;
export declare function trendingStrength(rank?: number | null): number;
export declare function franchiseStrength(collection?: CollectionLike | null): number;
export declare function networkStrength(networks?: Array<{ name?: string | null }> | null): number;
export declare function seriesScale(input?: { networks?: Array<{ name?: string | null }> | null; numberOfSeasons?: number | null; voteCount?: number | null }): number;
export declare function scaleSignal(input?: ScaleInput): number;
export declare function anticipationScore(signals: AnticipationSignals): number;
export declare function releaseWindow(daysUntilRelease: number): number;
export declare function relativeBuzzByReleaseWindow(items: Array<{ daysUntilRelease: number; popularity?: number | null }>): number[];
export declare function hypeLevel(score: number): 0 | 1 | 2;
export declare function rankByAnticipation<T extends AnticipationSignals & { release_date?: string; anticipation?: number }>(items: T[]): T[];
