import monerooVerifyHandler from '../moneroo/verify.js';

export default async function handler(req, res) {
  return monerooVerifyHandler(req, res);
}
