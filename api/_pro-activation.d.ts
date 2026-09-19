import type { SupabaseClient } from '@supabase/supabase-js';

export interface PlanActivationOptions {
  plan?: string;
  customerName?: string;
  amount?: number | string;
  currency?: string;
  gateway?: string;
  paymentReference?: string;
  subscriptionId?: string;
  isDonation?: boolean;
  userId?: string | null;
  phone?: string | null;
}

export interface ActivationResult {
  success: boolean;
  isPro: boolean;
  email: string;
  plan?: string;
  expiresAt?: string | null;
  daysRemaining?: number | null;
  subscriptionId?: string;
  dbUpdated?: boolean;
  emailSent?: boolean;
  error?: string;
}

export declare const supabaseAdmin: SupabaseClient | null;

export declare function activateUserPassPro(
  email: string,
  planDetails?: PlanActivationOptions
): Promise<ActivationResult>;

export declare function computePlanExpiry(plan?: string, baseDate?: string | null): string;
export declare function getDaysRemaining(expiresAt?: string | null): number | null;
export declare function isUuid(val: any): boolean;
export declare function downgradeExpiredSubscriptions(): Promise<any>;
export declare function processExpirationReminders(options?: any): Promise<any>;
export declare const processRenewalReminders: (options?: any) => Promise<any>;
