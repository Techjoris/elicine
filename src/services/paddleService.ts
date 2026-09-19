/**
 * Service d'intégration Paddle Billing (Paddle.js v2) pour Éliciné Pass Pro
 * Gère le chargement du SDK, l'initialisation en environnement Live,
 * l'ouverture du checkout en Overlay sombre et l'écoute des événements checkout.completed.
 */

// Déclaration globale du SDK Paddle.js v2
declare global {
  interface Window {
    Paddle?: {
      Environment: {
        set: (env: 'live' | 'sandbox') => void;
      };
      Initialize: (options: {
        token: string;
        eventCallback?: (event: PaddleEvent) => void;
        pwCustomer?: { id?: string; email?: string };
      }) => void;
      Checkout: {
        open: (options: PaddleCheckoutOpenOptions) => void;
        close?: () => void;
      };
      Status?: {
        libraryVersion: string;
      };
    };
  }
}

export interface PaddleEvent {
  name: string;
  data?: any;
}

export interface PaddleCheckoutItem {
  priceId: string;
  quantity?: number;
}

export interface PaddleCustomerData {
  email?: string;
}

export interface PaddleCheckoutSettings {
  displayMode?: 'overlay' | 'inline';
  theme?: 'dark' | 'light';
  locale?: string;
  successUrl?: string;
  allowLogout?: boolean;
}

export interface PaddleCheckoutOpenOptions {
  items: PaddleCheckoutItem[];
  customer?: PaddleCustomerData;
  settings?: PaddleCheckoutSettings;
  customData?: Record<string, any>;
}

export interface OpenPaddleCheckoutParams {
  priceId?: string;
  userEmail?: string;
  userName?: string;
  onSuccess?: (data?: any) => void;
  onClose?: () => void;
  onError?: (error: any) => void;
}

// Constantes officielles Éliciné
export const DEFAULT_PADDLE_PRICE_ID = 'pri_01m2x2nctwa8k7cqazmebqnxm3';
export const DEFAULT_PADDLE_CLIENT_TOKEN = 'live_8a9bd6937131abe8016f6f2a00f';
export const PADDLE_SCRIPT_URL = 'https://cdn.paddle.com/paddle/v2/paddle.js';

let isPaddleInitialized = false;
let activeEventCallbacks: Set<(event: PaddleEvent) => void> = new Set();

/**
 * Récupère le Client-side Token Paddle configuré dans l'environnement
 */
export function getPaddleClientToken(): string {
  const token =
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PADDLE_CLIENT_TOKEN) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN) ||
    DEFAULT_PADDLE_CLIENT_TOKEN;
  return (token && token !== 'undefined' && token !== 'null' ? String(token).trim() : DEFAULT_PADDLE_CLIENT_TOKEN);
}

/**
 * Récupère l'environnement Paddle ('live' ou 'sandbox')
 */
export function getPaddleEnvironment(): 'live' | 'sandbox' {
  const env =
    (typeof process !== 'undefined' && (process.env?.VITE_PADDLE_ENV || process.env?.NEXT_PUBLIC_PADDLE_ENV || process.env?.PADDLE_ENV)) ||
    (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_PADDLE_ENV || (import.meta as any).env?.NEXT_PUBLIC_PADDLE_ENV)) ||
    'live';
  return env.toLowerCase() === 'sandbox' ? 'sandbox' : 'live';
}

/**
 * Récupère le Price ID par défaut ou configuré
 */
export function getPaddlePriceId(): string {
  const priceId =
    (typeof process !== 'undefined' && (process.env?.VITE_PADDLE_PRICE_ID || process.env?.NEXT_PUBLIC_PADDLE_PRICE_ID)) ||
    (typeof import.meta !== 'undefined' && ((import.meta as any).env?.VITE_PADDLE_PRICE_ID || (import.meta as any).env?.NEXT_PUBLIC_PADDLE_PRICE_ID)) ||
    '';
  return (priceId && priceId !== 'undefined' && priceId !== 'null' ? priceId.trim() : '') || DEFAULT_PADDLE_PRICE_ID;
}

/**
 * Charge dynamiquement le script Paddle.js v2 si pas encore présent dans le DOM
 */
export async function ensurePaddleScriptLoaded(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (window.Paddle) {
    return true;
  }

  // Vérifier si la balise script existe déjà
  const existingScript = document.querySelector(`script[src="${PADDLE_SCRIPT_URL}"]`);
  if (existingScript) {
    return new Promise((resolve) => {
      if (window.Paddle) return resolve(true);
      existingScript.addEventListener('load', () => resolve(Boolean(window.Paddle)));
      existingScript.addEventListener('error', () => resolve(false));
      setTimeout(() => resolve(Boolean(window.Paddle)), 3500);
    });
  }

  // Injection dynamique
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = PADDLE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Paddle));
    script.onerror = () => {
      console.warn('[PaddleService] Échec du chargement du script Paddle.js v2');
      resolve(false);
    };
    document.head.appendChild(script);
    setTimeout(() => resolve(Boolean(window.Paddle)), 3500);
  });
}

/**
 * Initialise Paddle.js v2 avec le Client-side Token
 */
export async function initPaddle(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (isPaddleInitialized && window.Paddle) {
    return true;
  }

  const loaded = await ensurePaddleScriptLoaded();
  if (!loaded || !window.Paddle) {
    console.warn('[PaddleService] SDK Paddle non disponible dans window.Paddle.');
    return false;
  }

  // Protection contre l'appel Paddle.Environment.set("live") :
  // Dans le SDK Paddle.js v2, "production" est l'environnement live par défaut.
  // Si "live" est passé à Paddle.Environment.set(), le SDK v2 tente de résoudre l'hôte "https://live/paddlejs/v2"
  // ce qui provoque immédiatement le crash DNS "L'adresse IP du serveur live est introuvable".
  if (window.Paddle.Environment && typeof window.Paddle.Environment.set === 'function') {
    const originalSet = window.Paddle.Environment.set.bind(window.Paddle.Environment);
    window.Paddle.Environment.set = (env: any) => {
      if (env === 'live') {
        console.warn('[PaddleService] Paddle.Environment.set("live") ignoré : en v2 le mode production est actif par défaut pour éviter le crash DNS "serveur live introuvable".');
        return;
      }
      originalSet(env);
    };
  }

  const token = getPaddleClientToken();
  const environment = getPaddleEnvironment();

  try {
    // Si et seulement si sandbox est spécifié, on configure sandbox
    if (environment === 'sandbox') {
      window.Paddle.Environment.set('sandbox');
    }

    // 2. Initialisation avec le token client officiel
    window.Paddle.Initialize({
      token,
      eventCallback: (event: PaddleEvent) => {
        console.log('[Paddle Event]', event?.name, event);

        // Notifier tous les écouteurs enregistrés
        activeEventCallbacks.forEach((cb) => {
          try {
            cb(event);
          } catch (e) {
            console.error('[Paddle Event Callback Error]', e);
          }
        });
      }
    });

    isPaddleInitialized = true;
    console.log(`[PaddleService] Initialisé avec succès (mode: ${environment}).`);
    return true;
  } catch (err) {
    console.error('[PaddleService] Erreur lors de l\'initialisation de Paddle.js v2 :', err);
    return false;
  }
}

/**
 * Enregistre un écouteur d'événements global Paddle
 */
export function onPaddleEvent(callback: (event: PaddleEvent) => void): () => void {
  activeEventCallbacks.add(callback);
  return () => {
    activeEventCallbacks.delete(callback);
  };
}

/**
 * Déclenche l'ouverture du Checkout Overlay Paddle pour le Pass Pro
 */
export async function openPaddleCheckout({
  priceId = DEFAULT_PADDLE_PRICE_ID,
  userEmail,
  userName,
  onSuccess,
  onClose,
  onError
}: OpenPaddleCheckoutParams = {}): Promise<boolean> {
  try {
    const initialized = await initPaddle();
    if (!initialized || !window.Paddle) {
      const token = getPaddleClientToken();
      if (!token) {
        const msg = "Le token client Paddle (VITE_PADDLE_CLIENT_TOKEN) n'est pas encore configuré.";
        console.warn(`[PaddleService] ⚠️ ${msg}`);
        if (onError) onError(new Error(msg));
        return false;
      }
      throw new Error("Impossible de charger le module de paiement sécurisé Paddle.");
    }

    const token = getPaddleClientToken();
    if (!token) {
      const msg = "Configuration Paddle requise : veuillez renseigner VITE_PADDLE_CLIENT_TOKEN dans votre environnement Vercel / .env.";
      console.warn(`[PaddleService] ⚠️ ${msg}`);
      if (onError) onError(new Error(msg));
      return false;
    }

    // Calcul de l'URL de retour de succès
    const successUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/success`
      : 'https://elicine.app/success';

    // Nettoyeur d'écouteur pour ce checkout
    let cleanupListener: (() => void) | null = null;

    cleanupListener = onPaddleEvent((event) => {
      const eventName = event?.name;

      if (eventName === 'checkout.completed') {
        console.log('[PaddleService] 🎉 checkout.completed reçu avec succès ! Données :', event.data);
        if (onSuccess) {
          try {
            onSuccess(event.data);
          } catch (e) {
            console.error('[PaddleService] Erreur dans le callback onSuccess :', e);
          }
        }
        if (cleanupListener) {
          cleanupListener();
          cleanupListener = null;
        }
      } else if (eventName === 'checkout.closed' || eventName === 'checkout.canceled' || eventName === 'checkout.cancelled') {
        console.log('[PaddleService] Overlay Paddle fermé par l\'utilisateur.');
        if (onClose) {
          try {
            onClose();
          } catch (e) {
            console.error('[PaddleService] Erreur dans le callback onClose :', e);
          }
        }
        if (cleanupListener) {
          cleanupListener();
          cleanupListener = null;
        }
      } else if (eventName === 'checkout.error') {
        console.error('[PaddleService] ❌ Erreur checkout Paddle :', event.data);
        if (onError) {
          try {
            onError(event.data);
          } catch (e) {
            console.error('[PaddleService] Erreur dans le callback onError :', e);
          }
        }
      }
    });

    // Configuration stricte et minimale attendue par Paddle Billing v2 :
    // - items : uniquement priceId ("pri_01m2x2nctwa8k7cqazmebqnxm3") et quantity: 1
    // - customer : { email } si un email valide est fourni, sinon undefined
    // - settings : displayMode "overlay", theme "dark"
    // - AUCUN paramètre "currency" personnalisé, email undefined ou format altéré
    const validEmail = (typeof userEmail === 'string' && userEmail.trim().includes('@'))
      ? userEmail.trim().toLowerCase()
      : undefined;

    const checkoutOptions: PaddleCheckoutOpenOptions = {
      items: [
        {
          priceId: (priceId && priceId.startsWith('pri_')) ? priceId.trim() : DEFAULT_PADDLE_PRICE_ID,
          quantity: 1
        }
      ],
      customer: validEmail ? { email: validEmail } : undefined,
      settings: {
        displayMode: 'overlay',
        theme: 'dark'
      }
    };

    console.log('[PaddleService] 🚀 Ouverture du checkout overlay Paddle avec options :', checkoutOptions);
    window.Paddle.Checkout.open(checkoutOptions);
    return true;
  } catch (error: any) {
    console.error('[PaddleService] ❌ Exception lors de l\'ouverture de Paddle Checkout :', error);
    if (onError) onError(error);
    return false;
  }
}

export const paddleService = {
  initPaddle,
  openPaddleCheckout,
  onPaddleEvent,
  getPaddleClientToken,
  getPaddlePriceId,
  getPaddleEnvironment
};

export default paddleService;
