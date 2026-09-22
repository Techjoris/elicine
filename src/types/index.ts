export interface StreamingProvider {
  id: number;
  name: string;
  logo: string | null;
  providerKey: string;
  deepLink?: string | null;
  directUrl?: string | null;
  justWatchUrl?: string | null;
  netflixId?: string | number | null;
  primeId?: string | number | null;
  disneyId?: string | number | null;
}

export interface Movie {
  id: number;
  title: string;
  original_title?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count?: number;
  runtime?: number;
  media_type?: 'FILM' | 'SÉRIE' | 'movie' | 'tv';
  primary_platform?: string;
  genres: Array<{ id: number; name: string }>;
  cast?: Array<{ id: number; name: string; character: string; profile_path: string | null }>;
  director?: string;
  trailer_key?: string | null;
  providers?: StreamingProvider[] | any;
  isAvailableInRegion?: boolean;
  ai_match_reason?: string;
  ai_badge?: string;
  badge?: string;
  match_rate?: number;
  synopsis?: string;
  is_ai_overview?: boolean;
  netflix_id?: string | number;
  netflixId?: string | number;
  prime_id?: string | number;
  primeId?: string | number;
  disney_id?: string | number;
  disneyId?: string | number;
  canal_id?: string | number;
  canalId?: string | number;
  apple_id?: string | number;
  appleId?: string | number;
  imdb_id?: string;
  watch_provider_link?: string;
}

export type Currency = 'XAF' | 'XOF' | 'EUR' | 'USD' | 'CAD';

export type PricingBillingCycle = 'monthly' | 'yearly';

export interface CurrencyPricing {
  monthly: {
    amount: number;
    formatted: string;
  };
  yearly: {
    amount: number;
    formatted: string;
    monthlyEquivalent: string;
    savings: string;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  username?: string;
  avatar?: string;
  provider?: 'google' | 'credentials';
  role?: 'admin' | 'user';
  isPro: boolean;
  is_pro?: boolean;
  pass_status?: 'pro' | 'free' | string;
  proPlanType?: 'monthly' | 'yearly' | 'free' | string;
  proPlanExpiresAt?: string | null;
  expires_at?: string | null;
  pro_expires_at?: string | null;
  subscription_ends_at?: string | null;
  expiresAt?: string | null;
  daysRemaining?: number | null;
  days_remaining?: number | null;
  referralCode: string;
  referredBy?: string | null;
  createdAt: string;
  myList?: Movie[];
  token?: string;
}

export type SubscriptionStatus = 'pending_payment' | 'active' | 'cancelled' | 'expired' | 'failed';

export interface ProSubscription {
  id: string;
  userId: string;
  email: string;
  customerName: string;
  phone?: string;
  plan: 'monthly' | 'yearly';
  currency: Currency | string;
  amount: number;
  status: SubscriptionStatus;
  paymentReference?: string;
  paymentProvider?: 'saspay' | 'paddle' | 'moneroo' | 'cinetpay' | 'notchpay';
  gateway?: string;
  paymentMethod?: string;
  termsAccepted: boolean;
  createdAt: string;
  updatedAt?: string;
  activatedAt?: string;
  expiresAt?: string;
  expires_at?: string;
  daysRemaining?: number;
  signatureVerified?: boolean;
}

export interface AdminUserData {
  id: string;
  username?: string;
  email: string;
  name: string;
  avatar?: string;
  provider?: 'google' | 'credentials';
  role?: 'admin' | 'user';
  isPro: boolean;
  proPlanType?: 'monthly' | 'yearly' | 'free' | string;
  proPlanExpiresAt?: string | null;
  expires_at?: string | null;
  daysRemaining?: number | null;
  referralCode: string;
  createdAt: string;
  moviesInListCount: number;
  aiQueriesCount: number;
  lastActiveAt?: string;
}

export interface ApiSettings {
  // 1. TMDB (Source principale)
  tmdbApiKey: string; // cinéia_tmdb_key

  // 2. OMDb (Notes IMDb / Rotten Tomatoes)
  omdbApiKey: string; // cinéia_omdb_key

  // 3. Trakt.tv (Tendances)
  traktClientId: string; // cinéia_trakt_id

  // 4. OpenAI (ChatGPT / GPT-4o)
  openaiApiKey: string; // cinéia_openai_key

  // 5. Anthropic (Claude)
  anthropicApiKey: string; // cinéia_anthropic_key

  // 6. xAI (Grok)
  xaiApiKey: string; // cinéia_xai_key

  // 7. Groq (Llama, gratuite)
  groqApiKey: string; // cinéia_groq_key

  // 8. Qwen (Alibaba Cloud / DashScope — Moteur Principal)
  qwenApiKey?: string; // cinéia_qwen_api_key

  // 9. DeepSeek (deepseek-flash — Fallback Haute Disponibilité)
  deepseekApiKey?: string; // cinéia_deepseek_api_key

  // 10. SasPay — Passerelle Mobile Money exclusive (saspay_Backend)
  saspayApiKey?: string; // cinéia_saspay_key

  // Moneroo — Legacy (conservé pour compatibilité)
  monerooSecretKey?: string; // cinéia_moneroo_sk

  // Notch Pay — Legacy (conservé pour compatibilité)
  notchPayPublicKey: string; // cinéia_notch_pk
  notchPaySecretKey: string; // cinéia_notch_sk
  notchPayHashKey: string; // cinéia_notch_hash

  // Options
  preferredAiProvider?: 'qwen' | 'deepseek' | 'groq' | 'openai' | 'anthropic' | 'xai';
  aiProvider?: 'qwen' | 'deepseek' | 'groq' | 'openai' | 'anthropic' | 'xai' | 'demo';
  aiModel?: string;
  apiMode: 'production' | 'test';
}

export interface AIQuota {
  remaining: number;
  max: number;
  lastResetDate: string;
}

export interface AlertItem {
  id: string;
  movieId: number;
  movieTitle: string;
  releaseDate: string;
  posterPath: string | null;
  backdropPath?: string | null;
  email: string;
  userId?: string;
  mediaType?: string;
  overview?: string;
  createdAt: string;
  notified?: boolean;
  notified_j_minus_2?: boolean;
  notified_release_day?: boolean;
}

export interface SearchHistoryItem {
  id: string;
  query: string;
  timestamp: string;
  resultsCount: number;
  mood?: string;
  /** ISO date of the search, used to order and merge the account history. */
  createdAt?: string;
}

export type ActiveView = 'home' | 'trending' | 'upcoming' | 'catalog' | 'platforms' | 'alerts' | 'surprise' | 'watchlist' | 'admin' | 'terms' | 'reset-password' | 'update-password' | 'payment-callback';

export * from './canonicalIntent';
