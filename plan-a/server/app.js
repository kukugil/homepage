const express = require('express');
const path = require('path');
const CONFIG = require('./config');
const uploadRoutes = require('./routes/upload');
const deviceRoutes = require('./routes/device');
const { errorHandler } = require('./middleware');
const { sanitizeSN } = require('./storage');
const fs = require('fs');

if (!fs.existsSync(CONFIG.STORAGE_ROOT)) {
  fs.mkdirSync(CONFIG.STORAGE_ROOT, { recursive: true });
}
if (!fs.existsSync(CONFIG.DL_DIR)) {
  fs.mkdirSync(CONFIG.DL_DIR, { recursive: true });
}

const app = express();

app.set('etag', false);
app.use(express.json());

// Dynamic queue endpoint — returns only selected books (before static middleware)
app.get('/dl/:sn/queue', (req, res) => {
  const sn = req.params.sn;
  try {
    sanitizeSN(sn);
  } catch {
    return res.status(400).json({ error: 'Invalid SN' });
  }
  const { buildQueue } = require('./manifest');
  res.header('Access-Control-Allow-Origin', '*');
  res.json(buildQueue(sn));
});

// Static file serving for /dl/
app.use('/dl', (req, res, next) => {
  const seg = req.path.split('/').filter(Boolean);
  if (seg.length > 0) {
    try {
      sanitizeSN(seg[0]);
    } catch {
      return res.status(400).send('Invalid SN');
    }
  }
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  res.header('Accept-Ranges', 'bytes');
  next();
}, express.static(CONFIG.DL_DIR, {
  acceptRanges: true,
  cacheControl: false,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.json')) {
      res.header('Content-Type', 'application/json; charset=utf-8');
    }
    if (filePath.includes('/books/')) {
      const filename = path.basename(filePath);
      res.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    }
  },
}));

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: 健康检查
 *     responses:
 *       200:
 *         description: 服务正常运行
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean, example: true }
 *                 serving: { type: string, example: 'public' }
 *                 frontendReady: { type: boolean, example: true }
 */
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, serving: 'public', frontendReady: true });
});

// API routes — disable caching
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.removeHeader('ETag');
  next();
});
app.use('/api/v1', uploadRoutes);
app.use('/api/v1', deviceRoutes);

// Swagger UI
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'E-Reader API Docs' }));
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// Serve web frontend
const staticDir = path.join(__dirname, '..', 'public');
app.use(express.static(staticDir));

// SPA fallback — only for page routes, not static assets
app.get('*', (req, res) => {
  const p = req.path;
  if (/\.(js|css|json|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|webmanifest)(\?.*)?$/.test(p)) {
    return res.status(404).send('Not found');
  }
  if (p.startsWith('/_next/')) {
    return res.status(404).send('Not found');
  }
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('E-Reader Express Server Running');
  }
});

app.use(errorHandler);

module.exports = app;
