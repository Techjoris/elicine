/**
 * Le rappel d'installation ne doit apparaître que sur mobile, jamais quand
 * l'application est déjà installée, et pas plus d'une fois par heure — sauf au
 * moment d'une reconnexion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTALL_NUDGE_COOLDOWN_MS, INSTALL_NUDGE_DURATION_MS, isMobileEnvironment, shouldShowInstallNudge
} from '../../src/lib/installNudge.ts';

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';
const CHROME_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

test('a phone is recognised by its browser or by a narrow viewport', () => {
  assert.equal(isMobileEnvironment(CHROME_ANDROID, 0), true);
  assert.equal(isMobileEnvironment(CHROME_DESKTOP, 390), true);
  assert.equal(isMobileEnvironment(CHROME_DESKTOP, 1280), false);
});

test('a desktop visitor is never reminded', () => {
  assert.equal(shouldShowInstallNudge({
    now: 1_000_000, lastShownAt: null, isMobile: false, isInstalled: false
  }), false);
});

test('an installed application is never reminded', () => {
  assert.equal(shouldShowInstallNudge({
    now: 1_000_000, lastShownAt: null, isMobile: true, isInstalled: true
  }), false);
  assert.equal(shouldShowInstallNudge({
    now: 1_000_000, lastShownAt: null, isMobile: true, isInstalled: true, force: true
  }), false, 'même une reconnexion ne doit pas relancer une application installée');
});

test('a first mobile visit is reminded immediately', () => {
  assert.equal(shouldShowInstallNudge({
    now: 1_000_000, lastShownAt: null, isMobile: true, isInstalled: false
  }), true);
});

test('the reminder comes back after one hour, not before', () => {
  const lastShownAt = 5_000_000;
  assert.equal(shouldShowInstallNudge({
    now: lastShownAt + INSTALL_NUDGE_COOLDOWN_MS - 1, lastShownAt, isMobile: true, isInstalled: false
  }), false);
  assert.equal(shouldShowInstallNudge({
    now: lastShownAt + INSTALL_NUDGE_COOLDOWN_MS, lastShownAt, isMobile: true, isInstalled: false
  }), true);
});

test('a reconnection forces the reminder even inside the hour', () => {
  assert.equal(shouldShowInstallNudge({
    now: 5_001_000, lastShownAt: 5_000_000, isMobile: true, isInstalled: false, force: true
  }), true);
});

test('the display duration is the requested two seconds', () => {
  assert.equal(INSTALL_NUDGE_DURATION_MS, 2000);
  assert.equal(INSTALL_NUDGE_COOLDOWN_MS, 3600000);
});
