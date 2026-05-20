const CONFIG = require('./config');
const { sanitizeSN } = require('./storage');

function validateSN(req, res, next) {
  try {
    req.validatedSN = sanitizeSN(req.params.sn || req.body.sn || req.query.sn);
    next();
  } catch {
    res.status(400).json({ error: 'Invalid SN format. Use alphanumeric + hyphens, max 64 chars.' });
  }
}

function validateToken(req, res, next) {
  if (!CONFIG.TOKEN_AUTH_ENABLED) return next();
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }
  const token = auth.slice(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [sn] = decoded.split(':');
    if (sn !== req.validatedSN) {
      return res.status(403).json({ error: 'Token does not match SN' });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token format' });
  }
}

function rateLimiter() {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;
    const record = hits.get(key) || [];
    const recent = record.filter(t => t > windowStart);
    if (recent.length >= CONFIG.RATE_LIMIT_MAX) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

function errorHandler(err, req, res, _next) {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, err.message);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'File too large. Maximum 500MB.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum 500MB.' });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field.' });
  }
  res.status(err.status || 500).json({
    error: err.expose ? err.message : 'Internal server error',
  });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { validateSN, validateToken, rateLimiter, errorHandler, asyncHandler };
