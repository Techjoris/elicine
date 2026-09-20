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
    assert.deepEqual(select(canonical), select(legacy));
  });
}
