import { SearchHistoryItem } from '../types';
import { supabase } from '../lib/supabase';

const LOCAL_KEY = 'cineia_history';
const TABLE = 'user_search_history';

/** How many entries are kept per account, the same cap on every device. */
export const HISTORY_LIMIT = 50;

/** Deduplication key: searching the same thing twice refreshes it instead of duplicating it. */
export const queryKey = (query: string) => String(query || '').replace(/^#\s*/, '').trim().toLowerCase().slice(0, 300);

export const cleanQuery = (query: string) => String(query || '').replace(/^#\s*/, '').trim().slice(0, 300);

export function relativeLabel(iso: string | null | undefined, now = new Date()): string {
  const time = Date.parse(String(iso || ''));
  if (!Number.isFinite(time)) return '';
  const minutes = Math.floor((now.getTime() - time) / 60000);
  if (minutes <= 0) return 'À l’instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days <= 1) return 'Hier';
  if (days < 30) return `Il y a ${days} jours`;
  return new Date(time).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const timeOf = (item: SearchHistoryItem) => Date.parse(String(item.createdAt || '')) || 0;

/** Newest first, one entry per query, capped like the server does. */
export function mergeHistory(...lists: SearchHistoryItem[][]): SearchHistoryItem[] {
  const byQuery = new Map<string, SearchHistoryItem>();
  for (const item of lists.flat()) {
    const key = queryKey(item?.query || '');
    if (!key) continue;
    const held = byQuery.get(key);
    if (!held || timeOf(item) >= timeOf(held)) byQuery.set(key, item);
  }
  return [...byQuery.values()].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, HISTORY_LIMIT);
}

type SupabaseLike = { from: (table: string) => any } | null;

const rowToItem = (row: any): SearchHistoryItem => {
  const createdAt = row?.updated_at || row?.created_at || null;
  return {
    id: String(row?.id || ''),
    query: cleanQuery(row?.query || ''),
    timestamp: relativeLabel(createdAt),
    createdAt: createdAt || undefined,
    resultsCount: Number(row?.results_count) || 0,
    mood: row?.mood || undefined
  };
};

const itemToRow = (userId: string, item: SearchHistoryItem) => ({
  user_id: userId,
  query: cleanQuery(item.query),
  query_key: queryKey(item.query),
  results_count: Math.max(0, Math.round(Number(item.resultsCount) || 0)),
  mood: item.mood || null,
  updated_at: item.createdAt || new Date().toISOString()
});

export function createSearchHistoryService(client: SupabaseLike) {
  const readLocal = (): SearchHistoryItem[] => {
    if (typeof localStorage === 'undefined') return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.query === 'string') : [];
    } catch {
      return [];
    }
  };
  const writeLocal = (items: SearchHistoryItem[]) => {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); } catch { /* cache is optional */ }
  };
  const clearLocal = () => {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.removeItem(LOCAL_KEY); } catch { /* cache is optional */ }
  };

  const list = async (userId: string): Promise<SearchHistoryItem[]> => {
    if (!client || !userId) return [];
    const { data, error } = await client.from(TABLE)
      .select('id,query,results_count,mood,created_at,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error) throw new Error(error.message || 'Historique indisponible.');
    return (data || []).map(rowToItem).filter((item: SearchHistoryItem) => item.query);
  };

  return {
    readLocal, writeLocal, clearLocal, list,

    /** Saves one search on the account and returns the stored entry. */
    async add(userId: string, item: SearchHistoryItem): Promise<SearchHistoryItem | null> {
      if (!client || !userId) return null;
      const { data, error } = await client.from(TABLE)
        .upsert(itemToRow(userId, item), { onConflict: 'user_id,query_key' })
        .select('id,query,results_count,mood,created_at,updated_at')
        .maybeSingle();
      if (error) throw new Error(error.message || 'Historique indisponible.');
      return data ? rowToItem(data) : null;
    },

    /**
     * Sends the history built before the account existed, then returns the merged account list.
     * Entries are replayed oldest first so the original order survives on the server.
     */
    async migrate(userId: string, items: SearchHistoryItem[]): Promise<SearchHistoryItem[]> {
      if (!client || !userId || !items.length) return list(userId);
      const ordered = [...items].sort((a, b) => timeOf(a) - timeOf(b));
      for (const item of ordered) {
        try {
          await client.from(TABLE).upsert(itemToRow(userId, item), { onConflict: 'user_id,query_key' });
        } catch { /* a single unreadable entry must not stop the migration */ }
      }
      return list(userId);
    },

    /** Drops everything older than the cap, so no account grows without bound. */
    async prune(userId: string, items: SearchHistoryItem[]): Promise<void> {
      if (!client || !userId || items.length < HISTORY_LIMIT) return;
      const cutoff = items[HISTORY_LIMIT - 1]?.createdAt;
      if (!cutoff) return;
      await client.from(TABLE).delete().eq('user_id', userId).lt('updated_at', cutoff);
    },

    async remove(userId: string, entryId: string): Promise<void> {
      if (!client || !userId || !entryId) return;
      const { error } = await client.from(TABLE).delete().eq('user_id', userId).eq('id', entryId);
      if (error) throw new Error(error.message || 'Historique indisponible.');
    },

    async clear(userId: string): Promise<void> {
      if (!client || !userId) return;
      const { error } = await client.from(TABLE).delete().eq('user_id', userId);
      if (error) throw new Error(error.message || 'Historique indisponible.');
    }
  };
}

export const searchHistoryService = createSearchHistoryService(supabase);
