import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSearchHistoryService, mergeHistory, queryKey, relativeLabel, cleanQuery, HISTORY_LIMIT
} from '../../src/services/searchHistoryService.ts';

/** Minimal in-memory stand-in for the Supabase table used by the history service. */
function fakeClient() {
  const rows = [];
  const matches = (row, filters) => filters.every(({ op, column, value }) => (
    op === 'eq' ? row[column] === value : op === 'lt' ? row[column] < value : true
  ));
  const query = () => {
    const filters = [];
    let mode = 'select';
    let payload = null;
    let order = null;
    const matching = () => {
      const found = rows.filter(row => matches(row, filters));
      return order ? [...found].sort((a, b) => (a[order.column] > b[order.column] ? 1 : -1) * (order.ascending ? 1 : -1)) : found;
    };
    const run = () => {
      if (mode === 'delete') {
        for (const row of matching()) rows.splice(rows.indexOf(row), 1);
        return { data: null, error: null };
      }
      if (mode === 'upsert') {
        const held = rows.find(row => row.user_id === payload.user_id && row.query_key === payload.query_key);
        if (held) Object.assign(held, payload);
        else rows.push({ id: `id_${rows.length + 1}`, created_at: new Date().toISOString(), ...payload });
        return { data: matching(), error: null };
      }
      return { data: matching(), error: null };
    };
    const api = {
      select: () => api,
      eq: (column, value) => { filters.push({ op: 'eq', column, value }); return api; },
      lt: (column, value) => { filters.push({ op: 'lt', column, value }); return api; },
      order: (column, options = {}) => { order = { column, ascending: options.ascending !== false }; return api; },
      limit: () => api,
      upsert: (values) => { mode = 'upsert'; payload = values; return api; },
      delete: () => { mode = 'delete'; return api; },
      maybeSingle: async () => { const { data, error } = run(); return { data: data?.[0] || null, error }; },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject)
    };
    return api;
  };
  return {
    rows,
    from(table) {
      assert.equal(table, 'user_search_history');
      return query();
    }
  };
}

const entry = (query, minutesAgo = 0, extra = {}) => ({
  id: `h_${query}`,
  query,
  timestamp: 'À l’instant',
  createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString(),
  resultsCount: 3,
  ...extra
});

test('queries are normalised so the same search is never stored twice', () => {
  assert.equal(queryKey('#  Film de Braquage '), 'film de braquage');
  assert.equal(queryKey('DUNE'), queryKey(' dune '));
  assert.equal(cleanQuery('# Dune  '), 'Dune');
  assert.equal(queryKey('x'.repeat(400)).length, 300);
});

test('the timestamp label follows the account history', () => {
  const now = new Date('2026-09-22T12:00:00Z');
  assert.equal(relativeLabel(new Date(now.getTime() - 30_000).toISOString(), now), 'À l’instant');
  assert.equal(relativeLabel(new Date(now.getTime() - 25 * 60000).toISOString(), now), 'Il y a 25 min');
  assert.equal(relativeLabel(new Date(now.getTime() - 3 * 3600000).toISOString(), now), 'Il y a 3 h');
  assert.equal(relativeLabel(new Date(now.getTime() - 30 * 3600000).toISOString(), now), 'Hier');
  assert.equal(relativeLabel(null, now), '');
});

test('merging keeps one entry per query, newest first, capped', () => {
  const merged = mergeHistory([entry('Dune', 60)], [entry('Dune', 5, { id: 'recent' }), entry('Sicario', 30)]);
  assert.deepEqual(merged.map(item => item.id), ['recent', 'h_Sicario']);
  const many = Array.from({ length: HISTORY_LIMIT + 20 }, (_, index) => entry(`film ${index}`, index));
  assert.equal(mergeHistory(many).length, HISTORY_LIMIT);
  assert.ok(mergeHistory(many)[0].query === 'film 0');
});

test('a search is saved on the account and refreshed when it is run again', async () => {
  const client = fakeClient();
  const service = createSearchHistoryService(client);
  await service.add('user-1', entry('Dune'));
  await service.add('user-1', entry('Dune', 0, { id: 'second' }));
  await service.add('user-1', entry('Sicario'));
  assert.equal(client.rows.length, 2, 'the repeated query is updated, not duplicated');
  assert.equal(client.rows.filter(row => row.user_id === 'user-1' && row.query_key === 'dune').length, 1);
  assert.equal(client.rows.find(row => row.query_key === 'dune').results_count, 3);
});

test('each member only sees their own history', async () => {
  const client = fakeClient();
  const service = createSearchHistoryService(client);
  await service.add('user-1', entry('Dune'));
  await service.add('user-2', entry('Sicario'));
  const mine = await service.list('user-1');
  assert.deepEqual(mine.map(item => item.query), ['Dune']);
  assert.notEqual(mine[0].timestamp, '');
  await service.remove('user-1', mine[0].id);
  assert.equal((await service.list('user-1')).length, 0);
  assert.equal((await service.list('user-2')).length, 1, 'the other member keeps their history');
});

test('the device history is migrated once, oldest first, then removed', async () => {
  const client = fakeClient();
  const service = createSearchHistoryService(client);
  const local = [entry('Récent', 0), entry('Ancien', 120), entry('Milieu', 60)];
  const merged = await service.migrate('user-1', local);
  assert.equal(merged.length, 3);
  const stored = client.rows.filter(row => row.user_id === 'user-1').map(row => row.query);
  assert.deepEqual([...stored].sort(), ['Ancien', 'Milieu', 'Récent'].sort());
  assert.deepEqual(merged.map(item => item.query), ['Récent', 'Milieu', 'Ancien']);
});

test('clearing removes only the account history and pruning respects the cap', async () => {
  const client = fakeClient();
  const service = createSearchHistoryService(client);
  const items = Array.from({ length: HISTORY_LIMIT + 5 }, (_, index) => entry(`film ${index}`, index));
  for (const item of items) await service.add('user-1', item);
  await service.add('user-2', entry('Autre membre'));
  await service.prune('user-1', items);
  assert.ok(client.rows.filter(row => row.user_id === 'user-1').length < items.length);
  await service.clear('user-1');
  assert.equal(client.rows.filter(row => row.user_id === 'user-1').length, 0);
  assert.equal(client.rows.filter(row => row.user_id === 'user-2').length, 1);
});

test('a missing Supabase client degrades to an empty account history instead of throwing', async () => {
  const service = createSearchHistoryService(null);
  assert.deepEqual(await service.list('user-1'), []);
  assert.equal(await service.add('user-1', entry('Dune')), null);
  await service.clear('user-1');
});
