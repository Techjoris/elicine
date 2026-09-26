import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Universal True Infinite Scroll Hook.
 *
 * Features:
 * - One initial page; subsequent pages arrive as the visitor approaches them.
 * - Moderate anticipatory prefetching (rootMargin: '300px').
 * - Ultra-fast synchronous lock release (80ms re-arming delay).
 * - Hard stop on network/429 errors.
 * - TMDB 500-page limit safeguard.
 */
export function useInfiniteCatalog<T extends { id: number }>(
  fetchFn: (page: number) => Promise<{ results: T[]; total_pages: number }>,
  deps: readonly unknown[] = []
) {
  const [items, setItems]       = useState<T[]>([]);
  const [page, setPage]         = useState(1);
  const [totalPages, setTotal]  = useState(500);
  const [loading, setLoading]   = useState(false);
  const [hasMore, setHasMore]   = useState(true);

  // Synchronous execution lock
  const isFetchingRef = useRef(false);
  const observerRef   = useRef<IntersectionObserver | null>(null);
  const fetchFnRef    = useRef(fetchFn);
  fetchFnRef.current  = fetchFn;

  // ─── Reset on dependency changes ─────────────────────────────────────────
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    isFetchingRef.current = false;
    setItems([]);
    setPage(1);
    setTotal(500);
    setHasMore(true);
    setLoading(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // ─── Initial page ─────────────────────────────────────────────────────────
  const loadInitial = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);

    try {
      const res1 = await fetchFnRef.current(1);
      const list1 = Array.isArray(res1?.results) ? res1.results : [];
      const existingKeys = new Set<string>();
      const deduplicated: T[] = [];
      for (const item of list1) {
        if (!item) continue;
        const key = `${(item as any).media_type || ''}_${(item as any).id}`;
        if (!existingKeys.has(key)) {
          existingKeys.add(key);
          deduplicated.push(item);
        }
      }

      const serverTotal = Math.min(res1?.total_pages ?? 1, 500);

      setItems(deduplicated);
      setTotal(serverTotal);

      if (deduplicated.length > 0) {
        setPage(1);
        setHasMore(1 < serverTotal);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('[useInfiniteCatalog] Initial load error:', err);
      setHasMore(false);
    } finally {
      setLoading(false);
      setTimeout(() => {
        isFetchingRef.current = false;
      }, 80);
    }
  }, []);

  // ─── Subsequent Page Fetching ─────────────────────────────────────────────
  const loadNextPage = useCallback(async (nextPageNumber: number) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);

    try {
      const data = await fetchFnRef.current(nextPageNumber);
      const results: T[] = Array.isArray(data?.results) ? data.results : [];
      const serverTotal: number = Math.min(data?.total_pages ?? 10, 500);

      if (results.length > 0) {
        setItems(prev => {
          const prevList = Array.isArray(prev) ? prev : [];
          const keys = new Set(prevList.map(i => `${(i as any).media_type || ''}_${(i as any).id}`));
          const fresh = results.filter(i => i && !keys.has(`${(i as any).media_type || ''}_${(i as any).id}`));
          return [...prevList, ...fresh];
        });
        setTotal(serverTotal);
        if (nextPageNumber >= serverTotal) {
          setHasMore(false);
        } else {
          setPage(nextPageNumber);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('[useInfiniteCatalog] Pagination error:', err);
      // Stop on error/429
      setHasMore(false);
    } finally {
      setLoading(false);
      // Fast re-arming lock for zero artificial latency
      setTimeout(() => {
        isFetchingRef.current = false;
      }, 80);
    }
  }, []);

  // ─── Trigger initial load when list is empty ─────────────────────────────
  useEffect(() => {
    if (items.length === 0 && hasMore) {
      loadInitial();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, hasMore]);

  // ─── Callback-ref sentinel with moderate prefetching ─────────────────────
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!node || !hasMore) return;

      observerRef.current = new IntersectionObserver(
        entries => {
          if (entries[0].isIntersecting && hasMore && !isFetchingRef.current) {
            loadNextPage(page + 1);
          }
        },
        {
          root: null,
          rootMargin: '300px', // Fetch shortly before the visitor reaches the end
          threshold: 0
        }
      );

      observerRef.current.observe(node);
    },
    [hasMore, page, loadNextPage]
  );

  return { items, loading, hasMore, totalPages, sentinelRef };
}
