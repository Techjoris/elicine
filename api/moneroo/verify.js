export default async function handler(req, res) {
  const secretKey = (
    process.env.MONEROO_SECRET_KEY ||
    process.env.VITE_MONEROO_SECRET_KEY ||
    process.env.VITE_MONEROO_API_KEY ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    ''
  ).trim();

  const paymentId = req.query?.id || req.query?.reference || req.query?.paymentId;
  if (!paymentId) {
    return res.status(400).json({ error: 'Identifiant de transaction Moneroo manquant' });
  }

  if (!secretKey) {
    return res.status(500).json({ error: 'Clé MONEROO_SECRET_KEY manquante sur le serveur' });
  }

  try {
    const response = await fetch(`https://api.moneroo.io/v1/payments/${encodeURIComponent(paymentId)}/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    const rawStatus = data?.data?.status || data?.status || 'pending';
    const isSuccess = rawStatus === 'success' || rawStatus === 'successful' || rawStatus === 'completed';
    const isFailed = rawStatus === 'failed' || rawStatus === 'cancelled' || rawStatus === 'rejected';

    return res.status(response.status).json({
      status: isSuccess ? 'complete' : (isFailed ? 'failed' : 'pending'),
      rawStatus,
      ...data
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
