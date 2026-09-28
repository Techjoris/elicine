import test from 'node:test';
import assert from 'node:assert/strict';
import { languageForCountry, detectCountryLanguage } from '../../src/i18n/countryLanguage.ts';
import { detectPreferredLanguage } from '../../src/context/LanguageContext.tsx';
import geoHandler from '../../api/saspay.js';

test('the visitor country selects a supported language and otherwise English', () => {
  assert.equal(languageForCountry('ES'), 'es');
  assert.equal(languageForCountry('mx'), 'es');
  assert.equal(languageForCountry('FR'), 'fr');
  assert.equal(languageForCountry('DE'), 'de');
  assert.equal(languageForCountry('IT'), 'it');
  assert.equal(languageForCountry('PT'), 'en');
  assert.equal(languageForCountry('BR'), 'en');
  assert.equal(languageForCountry(null), 'en');
});

test('the site reads the visitor country from its uncached geo endpoint', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/geo');
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => ({ countryCode: 'ES' }) };
  };
  try {
    assert.equal(await detectCountryLanguage(), 'es');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the geo endpoint returns the visitor country without sharing its response', async () => {
  const headers = {};
  const response = {
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; }
  };
  await geoHandler({ method: 'GET', query: { action: 'geo' }, headers: { 'x-vercel-ip-country': 'ES' } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.countryCode, 'ES');
  assert.equal(headers['Cache-Control'], 'private, no-store');
});

test('an unavailable country lookup falls back to English', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    assert.equal(await detectCountryLanguage(), 'en');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a manually saved language takes precedence over automatic detection', () => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'userLanguage=it' } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'es' } });
  try {
    assert.equal(detectPreferredLanguage(), 'it');
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else delete globalThis.document;
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete globalThis.localStorage;
  }
});
