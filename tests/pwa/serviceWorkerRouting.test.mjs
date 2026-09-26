import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const script = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

function createWorker() {
  const listeners = new Map();
  let cacheLookups = 0;
  const context = {
    URL,
    self: {
      location: { origin: 'https://elicine.app' },
      addEventListener(name, listener) { listeners.set(name, listener); }
    },
    caches: {
      match() { cacheLookups += 1; return Promise.resolve('cached'); }
    },
    fetch() { return Promise.resolve('network'); }
  };
  vm.runInNewContext(script, context);
  return {
    get cacheLookups() { return cacheLookups; },
    async fetch(url, mode = 'cors') {
      let response;
      listeners.get('fetch')({
        request: { method: 'GET', url, mode },
        respondWith(promise) { response = promise; }
      });
      return response === undefined ? undefined : await response;
    }
  };
}

test('the PWA leaves posters, external resources and API traffic to the browser', async () => {
  const worker = createWorker();
  assert.equal(await worker.fetch('https://image.tmdb.org/t/p/w500/poster.jpg'), undefined);
  assert.equal(await worker.fetch('https://elicine.app/api/tmdb?endpoint=movie/1'), undefined);
  assert.equal(await worker.fetch('https://elicine.app/assets/index-123.js'), undefined);
  assert.equal(worker.cacheLookups, 0);
});

test('the PWA still handles navigation and its precached icons', async () => {
  const worker = createWorker();
  assert.equal(await worker.fetch('https://elicine.app/', 'navigate'), 'network');
  assert.equal(await worker.fetch('https://elicine.app/icon-192.png'), 'cached');
  assert.equal(worker.cacheLookups, 1);
});
