import paypalHandler from '../paypal.js';

export default async function handler(req, res) {
  req.query = req.query || {};
  req.query.action = 'create-order';
  return paypalHandler(req, res);
}
