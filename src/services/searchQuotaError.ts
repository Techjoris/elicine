export class SearchQuotaExceededError extends Error {
  readonly code = 'QUOTA_EXCEEDED' as const;

  constructor(message: string) {
    super(message);
    this.name = 'SearchQuotaExceededError';
  }
}

export const isSearchQuotaExceededError = (error: unknown): error is SearchQuotaExceededError =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'QUOTA_EXCEEDED';
