export const PASSWORD_MIN_LENGTH = 8;
export const RESET_EMAIL_MESSAGE = 'Si un compte est associé à cette adresse, un lien de réinitialisation vous a été envoyé. Consultez aussi vos courriers indésirables.';

export function validateNewPassword(password) {
  if (!password || password.length < PASSWORD_MIN_LENGTH) return { valid: false, error: 'Le mot de passe doit contenir au moins 8 caractères.' };
  if (password.length > 128) return { valid: false, error: 'Le mot de passe ne peut pas dépasser 128 caractères.' };
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) return { valid: false, error: 'Ajoutez au moins une majuscule et un chiffre à votre mot de passe.' };
  return { valid: true };
}

export function authErrorMessage(error) {
  switch (error?.code) {
    case 'invalid_credentials': return 'Adresse e-mail ou mot de passe incorrect. Vous pouvez réinitialiser votre mot de passe.';
    case 'email_not_confirmed': return 'Confirmez votre adresse e-mail avant de vous connecter. Vous pouvez demander un nouvel e-mail de confirmation.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'Trop de demandes. Patientez un moment avant de réessayer.';
    case 'otp_expired': return 'Ce lien a expiré ou a déjà été utilisé. Demandez un nouvel e-mail.';
    case 'weak_password': return 'Choisissez un mot de passe plus long et difficile à deviner.';
    default: return 'Le service de comptes est temporairement indisponible. Réessayez plus tard.';
  }
}

export const cleanAuthEmail = (email) => String(email || '').trim().toLowerCase();
export const isAuthEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanAuthEmail(email));

/** Supabase alone issues confirmation and recovery tokens and sends the messages. */
export function createEmailAuth(client, origin) {
  const redirect = (path) => new URL(path, origin()).href;
  return {
    async login(email, password) {
      if (!isAuthEmail(email) || !password || password.length > 128) {
        return { success: false, error: 'Adresse e-mail ou mot de passe incorrect. Vous pouvez réinitialiser votre mot de passe.', errorCode: 'invalid_credentials' };
      }
      try {
        // Existing passwords must be checked by Auth, irrespective of today's signup policy.
        const { data, error } = await client.auth.signInWithPassword({ email: cleanAuthEmail(email), password });
        if (error) return { success: false, error: authErrorMessage(error), errorCode: error.code };
        if (!data?.user?.email_confirmed_at || !data?.session?.access_token) {
          await client.auth.signOut({ scope: 'local' });
          return { success: false, error: authErrorMessage({ code: 'email_not_confirmed' }), errorCode: 'email_not_confirmed' };
        }
        return { success: true, data };
      } catch { return { success: false, error: authErrorMessage(null), errorCode: 'service_unavailable' }; }
    },
    async register(email, password, name) {
      const check = validateNewPassword(password);
      if (!isAuthEmail(email)) return { success: false, error: 'Veuillez saisir une adresse e-mail valide.' };
      if (!check.valid) return { success: false, error: check.error };
      try {
        const { data, error } = await client.auth.signUp({ email: cleanAuthEmail(email), password,
          options: { emailRedirectTo: redirect('/'), data: { full_name: name.trim().slice(0, 100) } } });
        if (error) return { success: false, error: authErrorMessage(error) };
        if (!data?.user) return { success: false, error: authErrorMessage(null) };
        // Signup never opens a local account. Verification is completed by the email link.
        if (data.session) await client.auth.signOut({ scope: 'local' });
        return { success: true, pendingVerification: true };
      } catch { return { success: false, error: authErrorMessage(null) }; }
    },
    async resendConfirmation(email) {
      if (!isAuthEmail(email)) return { success: false, error: 'Veuillez saisir une adresse e-mail valide.' };
      try {
        const { error } = await client.auth.resend({ type: 'signup', email: cleanAuthEmail(email), options: { emailRedirectTo: redirect('/') } });
        return error ? { success: false, error: authErrorMessage(error) } : { success: true };
      } catch { return { success: false, error: authErrorMessage(null) }; }
    },
    async requestPasswordReset(email) {
      if (!isAuthEmail(email)) return { success: false, error: 'Veuillez saisir une adresse e-mail valide.' };
      try {
        const { error } = await client.auth.resetPasswordForEmail(cleanAuthEmail(email), { redirectTo: redirect('/update-password') });
        return error ? { success: false, error: authErrorMessage(error) } : { success: true, message: RESET_EMAIL_MESSAGE };
      } catch { return { success: false, error: authErrorMessage(null) }; }
    },
    async updatePassword(password) {
      const check = validateNewPassword(password);
      if (!check.valid) return { success: false, error: check.error };
      try {
        const user = await client.auth.getUser();
        if (user.error || !user.data?.user?.email_confirmed_at) return { success: false, error: 'Lien absent ou expiré. Demandez un nouvel e-mail de réinitialisation.' };
        const { error } = await client.auth.updateUser({ password });
        if (error) return { success: false, error: authErrorMessage(error) };
        // Revoke refresh sessions after a password recovery, including other devices.
        const logout = await client.auth.signOut({ scope: 'global' });
        return logout?.error ? { success: false, error: 'Mot de passe modifié. La déconnexion des sessions est indisponible ; reconnectez-vous et réessayez.' } : { success: true };
      } catch { return { success: false, error: authErrorMessage(null) }; }
    }
  };
}
