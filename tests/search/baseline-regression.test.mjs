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

// The test-only runner executes legacy and canonical paths with identical
// deterministic provider fixtures. Production executes only one path.
const legacy = replay('legacy');
const canonical = replay('canonical');
for (const entry of corpus.queries) {
  test('baseline ' + entry.id + ': legacy/canonical parity across fixtures and quota', () => {
    const select = values => values.filter(value => value.id === entry.id);
    assert.equal(select(legacy).length, 5);
    const legacyCases = select(legacy);
    const canonicalCases = select(canonical);
    for (let index = 0; index < legacyCases.length; index += 1) {
      assert.deepEqual(canonicalCases[index].response, legacyCases[index].response);
      assert.deepEqual(canonicalCases[index].quota, legacyCases[index].quota);
      // One interpretation call per search, on the primary interpreter.
      const legacyLlm = legacyCases[index].requests.filter(item => item.url.includes('api.deepseek.com')).length;
      const canonicalLlm = canonicalCases[index].requests.filter(item => item.url.includes('api.deepseek.com')).length;
      assert.equal(canonicalLlm, legacyLlm);
      const legacyTmdb = legacyCases[index].requests.filter(item => item.url.includes('api.themoviedb.org')).length;
      const canonicalTmdb = canonicalCases[index].requests.filter(item => item.url.includes('api.themoviedb.org')).length;
      assert.ok(canonicalTmdb >= legacyTmdb);
      assert.ok(canonicalTmdb - legacyTmdb <= 5);
    }
  });
}
