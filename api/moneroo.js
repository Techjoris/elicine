/**
 * Passerelle Mobile Money unifiée Éliciné
 * Tout le trafic mobile money résiduel est désormais redirigé et traité exclusivement via SasPay.
 */
import saspayHandler from './saspay.js';

export default async function handler(req, res) {
  console.log('[Payment Gateway] Requête mobile money reçue sur endpoint legacy. Routage automatique et exclusif vers SasPay.');
  return saspayHandler(req, res);
}
