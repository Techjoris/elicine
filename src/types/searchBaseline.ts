export type SearchEngineMode = 'CURRENT_ENGINE' | 'SHADOW_NEW_ENGINE' | 'NEW_ENGINE';

export interface SearchResultSnapshot {
  id: number | string | null;
  mediaType: string | null;
  rank: number;
  score: number | null;
  provenance: string | null;
}

export interface SearchEngineSnapshot {
  queryId: string;
  engineMode: SearchEngineMode;
  totalLatencyMs: number;
  provider: string | null;
  fallbackTriggered: boolean;
  results: SearchResultSnapshot[];
  errors: Array<{ code?: string; message: string }>;
}

export interface SearchComparisonSnapshot {
  queryId: string;
  oldEngine: SearchEngineSnapshot;
  newEngine: SearchEngineSnapshot | null;
  comparisonStatus: 'not_run' | 'pending_evaluation' | 'evaluated';
}
