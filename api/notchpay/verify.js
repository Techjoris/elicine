export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { reference } = req.query;
  if (!reference) {
    return res.status(400).json({ error: 'Référence de transaction manquante' });
  }

  const notchKey = (
    process.env.NOTCHPAY_PUBLIC_KEY ||
    process.env.NOTCH_PAY_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_NOTCHPAY_PUBLIC_KEY ||
    process.env.VITE_NOTCHPAY_PUBLIC_KEY ||
    process.env.NOTCHPAY_SECRET_KEY ||
    process.env.NOTCHPAY_PRIVATE_KEY ||
    req.headers['x-public-key'] ||
    req.headers['x-notch-key'] ||
    ''
  ).trim();

  if (!notchKey) {
    return res.status(500).json({ error: 'Clé NotchPay manquante sur le serveur Vercel' });
  }

  try {
    const authHeader = (process.env.NOTCHPAY_PUBLIC_KEY?.trim()) || notchKey;
    const response = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    const rawStatus = data.transaction?.status || data.payment?.status || data.status || 'pending';
    const status = (rawStatus === 'successful' || rawStatus === 'complete' || rawStatus === 'completed') 
      ? 'complete' 
      : (rawStatus === 'failed' || rawStatus === 'rejected' || rawStatus === 'canceled' || rawStatus === 'cancelled')
      ? 'failed'
      : 'pending';

    return res.status(200).json({
      status,
      rawStatus,
      transaction: data.transaction || null
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
