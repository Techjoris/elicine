export const PASSWORD_MIN_LENGTH: number;
export const RESET_EMAIL_MESSAGE: string;
export function validateNewPassword(password: string): { valid: boolean; error?: string };
export function authErrorMessage(error: any): string;
export function cleanAuthEmail(email: string): string;
export function isAuthEmail(email: string): boolean;
export interface EmailAuthResult { success: boolean; error?: string; errorCode?: string; data?: any; pendingVerification?: boolean; message?: string }
export function createEmailAuth(client: any, origin: () => string): {
  login(email: string, password: string): Promise<EmailAuthResult>;
  register(email: string, password: string, name: string): Promise<EmailAuthResult>;
  resendConfirmation(email: string): Promise<EmailAuthResult>;
  requestPasswordReset(email: string): Promise<EmailAuthResult>;
  updatePassword(password: string): Promise<EmailAuthResult>;
};
