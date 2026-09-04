import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Universal True Infinite Scroll Hook.
 *
 * Features:
 * - Double initial load (Pages 1 & 2 fetched concurrently via Promise.all -> ~40 items).
 * - Aggressive anticipatory prefetching (rootMargin: '900px').
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
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // ─── Initial Double Load (Page 1 & 2 in parallel for 40 items) ───────────
  const loadInitial = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);

    try {
      const [res1, res2] = await Promise.all([
        fetchFnRef.current(1),
        fetchFnRef.current(2).catch(() => ({ results: [], total_pages: 1 }))
      ]);

      const list1 = res1?.results ?? [];
      const list2 = res2?.results ?? [];

      const combined = [...list1, ...list2];
      const existingIds = new Set<number>();
      const deduplicated: T[] = [];
      for (const item of combined) {
        if (!existingIds.has(item.id)) {
          existingIds.add(item.id);
          deduplicated.push(item);
        }
      }

      const serverTotal = Math.min(
        Math.max(res1?.total_pages ?? 1, res2?.total_pages ?? 1),
        500
      );

      setItems(deduplicated);
      setTotal(serverTotal);

      if (deduplicated.length > 0) {
        const nextPageCursor = list2.length > 0 ? 2 : 1;
        setPage(nextPageCursor);
        setHasMore(nextPageCursor < serverTotal);
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
      const results: T[] = data?.results ?? [];
      const serverTotal: number = Math.min(data?.total_pages ?? 10, 500);

      if (results.length > 0) {
        setItems(prev => {
          const ids = new Set(prev.map(i => i.id));
          const fresh = results.filter(i => !ids.has(i.id));
          return [...prev, ...fresh];
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

  // ─── Trigger initial double load when list is empty ──────────────────────
  useEffect(() => {
    if (items.length === 0 && hasMore) {
      loadInitial();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, hasMore]);

  // ─── Callback-ref sentinel with aggressive 900px prefetching ─────────────
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
          rootMargin: '900px', // Fetch 900px before user hits bottom
          threshold: 0
        }
      );

      observerRef.current.observe(node);
    },
    [hasMore, page, loadNextPage]
  );

  return { items, loading, hasMore, totalPages, sentinelRef };
}
