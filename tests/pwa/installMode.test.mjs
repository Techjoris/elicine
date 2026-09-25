/**
 * Installing Éliciné must be one gesture whenever the browser allows it, and
 * never promise something a platform cannot do.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { canAwaitNativeInstall, isIosEnvironment, pwaInstallMode } from '../../src/lib/pwaInstallMode.ts';

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36';
const CHROME_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile Safari/604.1';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0';

test('a browser that announced the install gets the one-click path', () => {
  for (const userAgent of [CHROME_ANDROID, CHROME_DESKTOP]) {
    assert.equal(pwaInstallMode({ hasNativePrompt: true, userAgent }), 'native');
  }
});

test('Android without the native event falls back to the guide, never to a promise', () => {
  assert.equal(pwaInstallMode({ hasNativePrompt: false, userAgent: CHROME_ANDROID }), 'guide');
  assert.equal(pwaInstallMode({ hasNativePrompt: false, userAgent: FIREFOX_ANDROID }), 'guide');
});

test('iOS always goes through the system share sheet', () => {
  assert.equal(pwaInstallMode({ hasNativePrompt: false, userAgent: SAFARI_IOS }), 'share');
  assert.equal(pwaInstallMode({
    hasNativePrompt: false, userAgent: CHROME_DESKTOP, platform: 'MacIntel', maxTouchPoints: 5
  }), 'share', 'un iPad tactile se déclare MacIntel');
});

test('a classic desktop is not mistaken for an iPad', () => {
  assert.equal(isIosEnvironment(CHROME_DESKTOP, 'Win32', 0), false);
  assert.equal(isIosEnvironment(CHROME_DESKTOP, 'MacIntel', 0), false);
  assert.equal(isIosEnvironment('', 'MacIntel', 5), true);
});

test('the decision is stable and never returns an unknown mode', () => {
  const modes = new Set();
  for (const userAgent of [CHROME_ANDROID, CHROME_DESKTOP, SAFARI_IOS, FIREFOX_ANDROID, ''])
    for (const hasNativePrompt of [true, false])
      modes.add(pwaInstallMode({ hasNativePrompt, userAgent }));
  assert.deepEqual([...modes].sort(), ['guide', 'native', 'share']);
});

test('browsers that announce the install late are still waited for', () => {
  // Mesuré sur cette application : Chrome annonce l'installation vers 7 s et
  // Edge vers 13 s. Tant que ce délai court, le navigateur ne doit pas être
  // présenté comme incapable d'installer.
  for (const userAgent of [CHROME_ANDROID, CHROME_DESKTOP, 'Mozilla/5.0 Edg/126.0', 'Mozilla/5.0 OPR/110.0',
    'Mozilla/5.0 Brave/126', 'Mozilla/5.0 Vivaldi/6.8', 'Mozilla/5.0 SamsungBrowser/26.0']) {
    assert.equal(canAwaitNativeInstall(userAgent), true, userAgent);
  }
});

test('browsers that will never announce it are not made to wait', () => {
  for (const userAgent of [FIREFOX_ANDROID, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', SAFARI_IOS, '']) {
    assert.equal(canAwaitNativeInstall(userAgent), false, userAgent || '(vide)');
  }
});
