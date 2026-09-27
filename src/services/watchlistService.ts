import { Movie } from '../types';
import { supabase } from '../lib/supabase';

const REMOTE_FIELD = 'elicine_watchlist_v1';
const ANONYMOUS_KEY = 'cineia_watchlist_anonymous';
const LEGACY_KEY = 'cineia_watchlist';
const userKey = (id: string) => `cineia_watchlist_${id}`;
const pendingKey = (id: string) => `cineia_watchlist_pending_${id}`;
const migratedKey = (id: string) => `cineia_watchlist_migrated_${id}`;

type Operation = { id: string; kind: 'add' | 'remove'; movie: Movie };
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type AuthLike = Pick<typeof supabase.auth, 'getUser' | 'updateUser'>;

export const watchlistMovieKey = (movie: Pick<Movie, 'id' | 'media_type'>) =>
  `${movie.media_type === 'tv' || movie.media_type === 'SÉRIE' ? 'tv' : 'movie'}:${movie.id}`;

export function compactWatchlistMovie(movie: Movie): Movie {
  return {
    id: movie.id,
    title: movie.title,
    original_title: movie.original_title,
    overview: (movie.overview || '').slice(0, 700),
    poster_path: movie.poster_path || null,
    backdrop_path: movie.backdrop_path || null,
    release_date: movie.release_date || '',
    vote_average: Number(movie.vote_average) || 0,
    media_type: movie.media_type,
    genres: Array.isArray(movie.genres) ? movie.genres.slice(0, 12) : [],
    primary_platform: movie.primary_platform,
    director: movie.director
  };
}

export function mergeWatchlists(...lists: Movie[][]): Movie[] {
  const byMovie = new Map<string, Movie>();
  for (const movie of lists.flat()) {
    if (!movie || !Number.isFinite(Number(movie.id)) || !movie.title) continue;
    const compact = compactWatchlistMovie(movie);
    byMovie.set(watchlistMovieKey(compact), compact);
  }
  return [...byMovie.values()];
}

export function applyWatchlistOperations(list: Movie[], operations: Operation[]): Movie[] {
  const byMovie = new Map(mergeWatchlists(list).map(movie => [watchlistMovieKey(movie), movie]));
  for (const operation of operations) {
    const key = watchlistMovieKey(operation.movie);
    if (operation.kind === 'remove') byMovie.delete(key);
    else byMovie.set(key, compactWatchlistMovie(operation.movie));
  }
  return [...byMovie.values()];
}

export function createWatchlistService(auth: AuthLike, storage: StorageLike | null =
  typeof localStorage === 'undefined' ? null : localStorage) {
  const inFlight = new Map<string, Promise<Movie[]>>();
  const read = (key: string): unknown => {
    try { return JSON.parse(storage?.getItem(key) || 'null'); } catch { return null; }
  };
  const readMovies = (key: string): Movie[] => {
    const value = read(key);
    return Array.isArray(value) ? mergeWatchlists(value) : [];
  };
  const readOperations = (id: string): Operation[] => {
    const value = read(pendingKey(id));
    return Array.isArray(value) ? value.filter(op => op?.id && (op.kind === 'add' || op.kind === 'remove') && op.movie) : [];
  };
  const write = (key: string, value: unknown) => {
    try { storage?.setItem(key, JSON.stringify(value)); } catch { /* cache is optional */ }
  };

  const readAnonymous = (): Movie[] => {
    if (!storage) return [];
    if (storage.getItem(ANONYMOUS_KEY) !== null) return readMovies(ANONYMOUS_KEY);
    // L'ancienne clé était partagée par tous les profils. Ne la reprendre que
    // sur un appareil où personne n'était connecté lors de la migration.
    if (!storage?.getItem('cineia_user')) {
      const legacy = readMovies(LEGACY_KEY);
      write(ANONYMOUS_KEY, legacy);
      return legacy;
    }
    return [];
  };

  const sync = (userId: string): Promise<Movie[]> => {
    const existing = inFlight.get(userId);
    if (existing) return existing;

    const task = (async () => {
      // Une seule écriture à la fois sur cet appareil. Après chaque écriture,
      // on relit les actions ajoutées pendant l'appel réseau.
      for (;;) {
        const { data, error } = await auth.getUser();
        if (error || data?.user?.id !== userId) {
          throw new Error('Session du compte indisponible. Reconnectez-vous pour synchroniser la liste.');
        }

        const remoteRaw = data.user.user_metadata?.[REMOTE_FIELD];
        const remoteExists = Array.isArray(remoteRaw);
        const remote = remoteExists ? mergeWatchlists(remoteRaw) : [];
        const migrated = storage?.getItem(migratedKey(userId)) === '1';
        const legacy = migrated ? [] : readMovies(userKey(userId));
        const anonymous = readAnonymous();
        const operations = readOperations(userId);
        const next = applyWatchlistOperations(
          mergeWatchlists(remote, legacy, anonymous), operations
        );

        if (!remoteExists || JSON.stringify(next) !== JSON.stringify(remote)) {
          const updated = await auth.updateUser({ data: { [REMOTE_FIELD]: next } });
          if (updated.error || updated.data?.user?.id !== userId) {
            throw new Error(updated.error?.message || 'Impossible de sauvegarder la liste sur le compte.');
          }
        }

        try {
          storage?.setItem(migratedKey(userId), '1');
          const handled = new Set(operations.map(op => op.id));
          write(pendingKey(userId), readOperations(userId).filter(op => !handled.has(op.id)));
          if (JSON.stringify(readAnonymous()) === JSON.stringify(anonymous)) {
            storage?.removeItem(ANONYMOUS_KEY);
            // Empêche l'ancienne clé partagée de réimporter la même liste.
            write(ANONYMOUS_KEY, []);
          }
        } catch { /* la prochaine synchronisation est idempotente */ }

        if (readOperations(userId).length === 0 && readAnonymous().length === 0) {
          write(userKey(userId), next);
          return next;
        }
      }
    })();

    inFlight.set(userId, task);
    void task.finally(() => inFlight.delete(userId)).catch(() => {});
    return task;
  };

  return {
    stageLegacyAccount(userId: string, email: string): void {
      if (!userId || !email || storage?.getItem(migratedKey(userId)) === '1') return;
      const accounts = read('cineia_registered_accounts');
      if (!Array.isArray(accounts)) return;
      const previousLists = accounts
        .filter(account => account?.id && account.id !== userId &&
          String(account.email || '').toLowerCase() === email.toLowerCase())
        .map(account => readMovies(userKey(account.id)));
      if (previousLists.length) {
        write(userKey(userId), mergeWatchlists(readMovies(userKey(userId)), ...previousLists));
      }
    },
    readInitial(userId?: string | null): Movie[] {
      if (userId) {
        if (storage?.getItem(ANONYMOUS_KEY) === null && storage.getItem('cineia_user')) {
          write(ANONYMOUS_KEY, []);
        }
        return readMovies(userKey(userId));
      }
      return readAnonymous();
    },
    saveAnonymous(list: Movie[]): void { write(ANONYMOUS_KEY, mergeWatchlists(list)); },
    saveLocal(userId: string, list: Movie[]): void { write(userKey(userId), mergeWatchlists(list)); },
    queue(userId: string, kind: Operation['kind'], movie: Movie): void {
      const operations = readOperations(userId);
      operations.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        kind,
        movie: compactWatchlistMovie(movie)
      });
      write(pendingKey(userId), operations);
    },
    sync
  };
}

export const watchlistService = createWatchlistService(supabase.auth);
