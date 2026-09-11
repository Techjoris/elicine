// Stockage en mémoire vive du rate limiter (fenêtre glissante par IP)
const ipRequestCounts = new Map();

// Nettoyage périodique pour éviter toute fuite mémoire sur les instances pérennes
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipRequestCounts.entries()) {
      if (now > data.resetTime) {
        ipRequestCounts.delete(ip);
      }
    }
  }, 5 * 60 * 1000);
  if (timer.unref) timer.unref();
}

/**
 * Extrait l'adresse IP cliente réelle depuis les en-têtes (Vercel, Cloudflare, proxies ou socket)
 */
export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.headers?.['x-real-ip'] || 
         req.socket?.remoteAddress || 
         req.connection?.remoteAddress || 
         '127.0.0.1';
}

/**
 * Limiteur de requêtes universel (Vercel Serverless & Node.js)
 * 
 * Spécifications :
 * - windowMs : 60 000 ms (1 minute)
 * - max : 8 requêtes par fenêtre pour chaque IP
 * - Standard Headers : RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After
 * - Code HTTP : 429 Too Many Requests
 * - Message : "Trop de requêtes effectuées depuis cette adresse IP. Veuillez réessayer dans une minute."
 */
export function checkRateLimit(req, res, options = {}) {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 8;
  const message = options.message || {
    status: 429,
    error: "Trop de requêtes effectuées depuis cette adresse IP. Veuillez réessayer dans une minute."
  };

  const ip = getClientIp(req);
  const now = Date.now();

  let record = ipRequestCounts.get(ip);
  if (!record || now > record.resetTime) {
    record = {
      count: 0,
      resetTime: now + windowMs
    };
    ipRequestCounts.set(ip, record);
  }

  record.count += 1;

  const remaining = Math.max(0, max - record.count);
  const resetSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));

  // En-têtes standards IETF RateLimit
  if (res && typeof res.setHeader === 'function') {
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));
  }

  if (record.count > max) {
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('Retry-After', String(resetSeconds));
    }
    if (res && typeof res.status === 'function') {
      res.status(429).json(message);
    }
    return {
      allowed: false,
      ip,
      remaining: 0,
      resetSeconds
    };
  }

  return {
    allowed: true,
    ip,
    remaining,
    resetSeconds
  };
}

export default checkRateLimit;
