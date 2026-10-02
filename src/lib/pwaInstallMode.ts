/** iPadOS peut annoncer « MacIntel » tout en étant un appareil tactile. */
export function isIosEnvironment(userAgent = '', platform = '', maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent)
    || (platform === 'MacIntel' && Number(maxTouchPoints) > 1);
}
