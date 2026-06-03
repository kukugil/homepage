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

// Fallback: resolve book file for old naming or DB-stored filename
const db = require('./db');
const { resolveBookFilePath, fileExists } = require('./storage');

// New format: /dl/:sn/books/:bookId/书名.格式
app.get('/dl/:sn/books/:bookId/:filename', async (req, res) => {
  try {
    const book = db.getBook(req.params.bookId);
    if (!book || book.sn !== req.params.sn) return res.status(404).send('Not found');
    const fp = await resolveBookFilePath(req.params.sn, book);
    if (!await fileExists(fp)) return res.status(404).send('Not found');
    res.header('Accept-Ranges', 'bytes');
    res.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(req.params.filename)}`);
    res.sendFile(fp, { acceptRanges: true });
  } catch {
    res.status(500).send('Server error');
  }
});

// Old format fallback: /dl/:sn/books/:file (bookId.format or title.format)
app.use('/dl/:sn/books/:file', async (req, res, next) => {
  // Only handle if static didn't find the file
  if (res.headersSent) return;

  try {
    // Extract bookId from filename: "b_abc123.epub" → "b_abc123"
    const bookId = req.params.file.replace(/\.[^.]+$/, '');
    const book = db.getBook(bookId);
    if (!book || book.sn !== req.params.sn) return next();

    const fp = await resolveBookFilePath(req.params.sn, book);
    if (await fileExists(fp)) {
      const filename = path.basename(fp);
      res.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.sendFile(fp, { acceptRanges: true });
    } else {
      next();
    }
  } catch {
    next();
  }
});

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

// Swagger UI (optional — skipped if swagger.js is not deployed)
try {
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./swagger');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'E-Reader API Docs' }));
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
} catch { /* swagger not available */ }

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
