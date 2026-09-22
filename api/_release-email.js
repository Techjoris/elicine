import { getMovieAlertJMinus2EmailHtml, getMovieAlertReleaseDayEmailHtml } from './_email.js';

export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY?.trim()); }
export function parisDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function dueMilestone(date, now = new Date()) {
  const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(parisDate(now) + 'T00:00:00Z')) / 86400000);
  return days === 2 ? 'j_minus_2' : days === 0 ? 'release_day' : null;
}
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function releaseEmailPayload(alert, milestone, email) {
  const props = { movieTitle: escapeHtml(alert.movie_title), moviePoster: /^\/[\w./-]+$/.test(alert.poster_path || '') ? alert.poster_path : null,
    releaseDate: alert.release_date, movieId: Number(alert.movie_id), mediaType: alert.media_type === 'tv' ? 'tv' : 'movie', overview: escapeHtml(alert.overview) };
  const timing = milestone === 'j_minus_2' ? 'sort dans 2 jours' : 'sort aujourd’hui';
  return { from: process.env.RESEND_FROM_EMAIL || process.env.RESEND_EMAIL || 'Éliciné <support@elicine.app>', to: [email],
    subject: `🎬 ${String(alert.movie_title).replace(/[\r\n]/g, ' ').slice(0, 150)} ${timing}`,
    html: (milestone === 'j_minus_2' ? getMovieAlertJMinus2EmailHtml : getMovieAlertReleaseDayEmailHtml)(props),
    text: `Éliciné : « ${alert.movie_title} » ${timing} (${alert.release_date}). Date de sortie initiale, susceptible de varier selon le pays. Gérez vos alertes dans Éliciné : https://elicine.app` };
}

async function resendRequest(path, options = {}) {
  if (!emailConfigured()) throw new Error('RESEND_NOT_CONFIGURED');
  const response = await fetch(`https://api.resend.com/emails${path}`, {
    ...options, headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(12000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`RESEND_${response.status}_${data.name || 'ERROR'}`);
  if (!data.id) throw new Error('RESEND_INVALID_RESPONSE');
  return data;
}
export async function sendReleaseEmail(payload, deliveryId) {
  return resendRequest('', { method: 'POST', headers: { 'Idempotency-Key': `release-alert/${deliveryId}` }, body: JSON.stringify(payload) });
}
export async function readReleaseEmail(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('INVALID_EMAIL_ID');
  return resendRequest(`/${id}`);
}
