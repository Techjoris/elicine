import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import corpus from './baseline-corpus.v1.json' with { type: 'json' };

function replay(mode) {
  const run = spawnSync(process.execPath, [
    fileURLToPath(new URL('./baseline-worker.mjs', import.meta.url)), mode
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60000 });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

// Full handler replay versus pinned Phase 1, not a live LLM quality benchmark.
// All request bodies (including prompts), TMDB URLs, public payloads, scores,
// result ordering, fallbacks and quota responses must stay identical.
const old = replay('old');
const current = replay('current');
const failedShadow = replay('failure');
for (const entry of corpus.queries) {
  test('baseline ' + entry.id + ': direct, empty, heuristic, quota, shadow failure', () => {
    const select = values => values.filter(value => value.id === entry.id);
    assert.equal(select(old).length, 3);
    assert.deepEqual(select(current), select(old));
    assert.deepEqual(select(failedShadow), select(old));
  });
}
