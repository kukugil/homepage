const express = require('express');
const path = require('path');
const CONFIG = require('./config');
const uploadRoutes = require('./routes/upload');
const deviceRoutes = require('./routes/device');
const { errorHandler } = require('./middleware');
const { sanitizeSN } = require('./storage');

const app = express();

// Body parsing
app.use(express.json());

// Static file serving for /dl/ — device-facing read-only access
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
  },
}));

// API routes
app.use('/api/v1', uploadRoutes);
app.use('/api/v1', deviceRoutes);

// Serve web frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler
app.use(errorHandler);

app.listen(CONFIG.PORT, () => {
  console.log(`E-Reader server running on http://0.0.0.0:${CONFIG.PORT}`);
  console.log(`Storage: ${CONFIG.DL_DIR}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  require('./db').closeDb();
  process.exit(0);
});
process.on('SIGINT', () => {
  require('./db').closeDb();
  process.exit(0);
});
