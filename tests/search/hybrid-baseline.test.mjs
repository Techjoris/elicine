import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import corpus from './baseline-corpus.v1.json' with { type: 'json' };

function replay(mode) {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('./baseline-worker.mjs', import.meta.url)), mode],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60000 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}
const legacy = replay('canonical');
const hybrid = replay('hybrid');
const results = response => response.payload.results || response.payload.movies || [];
const quotaShape = snapshot => snapshot.quota.map(response => ({ status: response.status,
  ...(response.payload.quota ? { quota: response.payload.quota } : {}),
  ...(response.payload.code ? { code: response.payload.code } : {}),
  ...(response.payload.limit !== undefined ? { payload: response.payload } : {}) }));
for (const entry of corpus.queries) test(`hybrid baseline ${entry.id}: HTTP, quota, one interpretation and bounded providers`, () => {
  const oldCases = legacy.filter(r => r.id === entry.id);
  const newCases = hybrid.filter(r => r.id === entry.id);
  assert.equal(newCases.length, 5);
  for (let i = 0; i < newCases.length; i++) {
    const old = oldCases[i], current = newCases[i];
    assert.equal(current.response.status, old.response.status);
    assert.equal(current.response.payload.success, true);
    assert.equal(current.metrics.attempted, true);
    assert.deepEqual(quotaShape(current), quotaShape(old));
    // GET quota responses are unchanged, even when result IDs intentionally differ.
    assert.deepEqual(current.quota[0], old.quota[0]);
    if (current.quota.length > 1) assert.deepEqual(current.quota.at(-1), old.quota.at(-1));
    assert.equal(current.metrics.llmCalls, old.metrics.llmCalls);
    assert.ok(current.metrics.tmdbCalls <= 30);
    const llmCount = value => value.requests.filter(r => r.url.includes('api.deepseek.com')).length;
    assert.equal(llmCount(current), llmCount(old));
    const rows = results(current.response);
    assert.ok(Array.isArray(rows));
    if (rows.length) {
      assert.equal(current.response.payload.count, rows.length);
      assert.deepEqual(current.response.payload.movies, current.response.payload.results);
    }
    assert.equal(new Set(rows.map(r => `${r.media_type}:${r.tmdb_id}`)).size, rows.length);
    for (const movie of rows) {
      assert.equal(typeof movie.title, 'string'); assert.equal(typeof movie.match_rate, 'number');
      assert.ok(['tv', 'movie'].includes(movie.media_type));
      for (const field of ['sources', 'retrievalSignals', 'metadata']) assert.equal(movie[field], undefined);
    }
  }
});
