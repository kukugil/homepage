const CONFIG = require('./config');
const { sanitizeSN } = require('./storage');

function validateSN(req, res, next) {
  try {
    const raw = req.params.sn || req.body.sn || req.query.sn;
    if (!raw || typeof raw !== 'string') throw new Error('Missing or invalid SN');
    req.validatedSN = sanitizeSN(raw);
    next();
  } catch {
    res.status(400).json({ error: 'Invalid SN format. Use alphanumeric + hyphens, max 64 chars.' });
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

function basicAuth(req, res, next) {
  const PASSWORD = process.env.ADMIN_PASSWORD;
  if (!PASSWORD) return next();

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="E-Reader", charset="UTF-8"');
    return res.status(401).send('Authentication required');
  }

  const [, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
  if (pass !== PASSWORD) {
    return res.status(401).send('Invalid credentials');
  }

  next();
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

module.exports = { validateSN, rateLimiter, basicAuth, errorHandler, asyncHandler };
