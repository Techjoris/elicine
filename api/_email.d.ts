export declare function sendEmailWithResend(options: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<{ success: boolean; data?: any; error?: any; simulated?: boolean; message?: string }>;

export declare function formatEmailCurrency(amount: any, currency?: string): string;

export declare function getProWelcomeEmailHtml(options?: {
  customerName?: string;
  plan?: string;
  amount?: any;
  currency?: string;
  expiresAt?: string | null;
}): string;

export declare function sendProWelcomeEmail(
  email: string,
  options?: {
    customerName?: string;
    plan?: string;
    amount?: any;
    currency?: string;
    expiresAt?: string | null;
  }
): Promise<{ success: boolean; data?: any; error?: any; simulated?: boolean; message?: string }>;

export declare function getDonationThankYouEmailHtml(options?: {
  customerName?: string;
  amount?: any;
  currency?: string;
}): string;

export declare function sendDonationThankYouEmail(
  email: string,
  options?: {
    customerName?: string;
    amount?: any;
    currency?: string;
  }
): Promise<{ success: boolean; data?: any; error?: any; simulated?: boolean; message?: string }>;
