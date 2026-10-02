import test from 'node:test';
import assert from 'node:assert/strict';

test('the native dialog is requested during the same user gesture', async () => {
  globalThis.window = new EventTarget();
  const { promptNativeInstall } = await import('../../src/hooks/usePWAInstall.ts');
  const installEvent = new Event('beforeinstallprompt', { cancelable: true });
  let promptCalls = 0;
  installEvent.prompt = () => {
    promptCalls += 1;
    return Promise.resolve();
  };
  installEvent.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(installEvent);

  const result = promptNativeInstall();
  assert.equal(promptCalls, 1, 'prompt() must run before the first await');
  assert.equal(await result, 'accepted');
  assert.equal(await promptNativeInstall(), 'unavailable', 'the consumed event cannot be reused');
  delete globalThis.window;
});
