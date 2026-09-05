/**
 * Module lib/streamingLinks.ts — Moteur de Résolution & Deep-Linking Direct de Streaming
 * Résout le problème spécifique d'Android où le lien netflix.com/search?q= est vidé par l'application native.
 */

export {
  getDirectStreamingUrl,
  getPlatformDirectUrl,
  getNetflixDeepLink,
  getPrimeVideoDeepLink,
  getDisneyDeepLink,
  getCanalDeepLink,
  getAppleTvDeepLink,
  buildAndroidIntentUrl,
  isAndroidClient,
  type StreamingDeepLinkOptions
} from '../services/deepLinkHelper';

export {
  buildStreamingUrl,
  getMediaProviders,
  resolveStreamingAction,
  type MediaProvidersResult,
  type SvodProviderItem,
  type VodProviderItem,
  type StreamingActionResult
} from '../services/streamingResolver';
