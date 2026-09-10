import monerooHandler from './moneroo.js';

export default async function handler(req, res) {
  // Redirection transparente de toute requête NotchPay restante vers Moneroo
  return monerooHandler(req, res);
}
