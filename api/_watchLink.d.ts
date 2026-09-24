export type WatchLinkMap = Record<string, string>;

export declare const PROVIDER_ALIASES: Array<[string, RegExp]>;

export declare function providerKeyFor(name?: string | null): string | null;
export declare function normalizeTitle(value?: string | null): string;
export declare function titleSimilarity(a?: string | null, b?: string | null): number;
export declare function scoreCandidate(node: any, title: string, year?: string | number): number;
export declare function pickBestCandidate(
  edges: any[] | null | undefined,
  title: string,
  year?: string | number,
  objectType?: 'MOVIE' | 'SHOW' | null
): any | null;
export declare function pickOfferUrl(offers: any[] | null | undefined, providerName: string): string | null;
export declare function buildJustWatchQuery(): string;
export declare function resolveTitleWatchLinks(options?: {
  title?: string;
  year?: string | number;
  country?: string;
  mediaType?: 'movie' | 'tv';
  language?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<WatchLinkMap>;
