import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const policy = config.headers.flatMap(entry => entry.headers)
  .find(header => header.key.toLowerCase() === 'content-security-policy').value;
const directives = new Map(policy.split(';').map(value => value.trim().split(/\s+/)).filter(parts => parts[0]).map(([name, ...sources]) => [name, sources]));
const modal = readFileSync(new URL('../../src/components/modals/MovieDetailModal.tsx', import.meta.url), 'utf8');

test('the production frame policy permits the exact trailer host used by the movie details', () => {
  const embed = modal.match(/src=\{`(https:\/\/[^/]+)\/embed\//)?.[1];
  assert.equal(embed, 'https://www.youtube-nocookie.com');
  assert.ok(directives.get('frame-src').includes(embed), 'the trailer iframe must not be blocked by the production CSP');
  assert.ok(!directives.get('frame-src').includes('*'));
  assert.ok(!directives.get('frame-src').includes('https:'));
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"], 'the site itself remains protected from framing');
});

test('YouTube receives the embedding origin without exposing the full browsing URL', () => {
  const iframe = modal.match(/<iframe[\s\S]*?\/>/)?.[0];
  assert.ok(iframe?.includes('referrerPolicy="strict-origin-when-cross-origin"'));
  assert.ok(iframe.includes('allowFullScreen'));
  assert.ok(iframe.includes('autoplay;'));
});
