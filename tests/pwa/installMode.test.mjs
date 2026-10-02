import test from 'node:test';
import assert from 'node:assert/strict';
import { isIosEnvironment } from '../../src/lib/pwaInstallMode.ts';
import { detectBrowserInfo, installSteps } from '../../src/components/modals/InstallModal.tsx';

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/126 Mobile Safari/604.1';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
const FIREFOX_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0';
const FIREFOX_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0';

test('iPadOS tactile is classified as iOS, while a desktop Mac is not', () => {
  assert.equal(isIosEnvironment('', 'MacIntel', 5), true);
  assert.equal(isIosEnvironment('', 'MacIntel', 0), false);
});

test('Chrome Android offers the browser install menu as manual fallback', () => {
  const info = detectBrowserInfo(CHROME_ANDROID);
  assert.equal(info.recommendedTab, 'android');
  assert.match(installSteps(info, info.recommendedTab)[1], /Installer l’application/);
});

test('Firefox Android uses its own install action', () => {
  const info = detectBrowserInfo(FIREFOX_ANDROID);
  assert.equal(info.recommendedTab, 'firefox');
  assert.match(installSteps(info, info.recommendedTab)[1], /Installer/);
});

test('iPhone guidance follows the actual browser share menu', () => {
  const chrome = detectBrowserInfo(CHROME_IOS);
  const safari = detectBrowserInfo(SAFARI_IOS);
  assert.match(installSteps(chrome, chrome.recommendedTab)[0], /Chrome/);
  assert.match(installSteps(safari, safari.recommendedTab)[0], /Safari/);
});

test('Firefox Windows and Mac have different install guidance', () => {
  const windows = detectBrowserInfo(FIREFOX_WINDOWS);
  const mac = detectBrowserInfo(FIREFOX_MAC);
  assert.match(installSteps(windows, windows.recommendedTab)[0], /Firefox pour Windows/);
  assert.match(installSteps(mac, mac.recommendedTab)[0], /Chrome ou Edge/);
});

test('an in-app browser asks the user to open the page externally', () => {
  const info = detectBrowserInfo(CHROME_ANDROID + ' Instagram 350.0');
  assert.equal(info.isInAppBrowser, true);
  assert.match(installSteps(info, info.recommendedTab)[0], /Ouvrir dans le navigateur/);
});
