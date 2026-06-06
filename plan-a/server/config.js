const path = require('path');

const CONFIG = {
  PORT: process.env.PORT || 3000,
  STORAGE_ROOT: process.env.STORAGE_OVERRIDE
    ? path.resolve(process.env.STORAGE_OVERRIDE)
    : path.resolve(__dirname, '..', 'storage'),
  DL_DIR: process.env.STORAGE_OVERRIDE
    ? path.resolve(process.env.STORAGE_OVERRIDE, 'dl')
    : path.resolve(__dirname, '..', 'storage', 'dl'),
  MAX_FILE_SIZE: 500 * 1024 * 1024,       // 500MB
  ALLOWED_MIMES: [
    'application/epub+zip',
    'application/epub',
    'application/pdf',
    'text/plain',
  ],
  ALLOWED_EXTENSIONS: ['.epub', '.pdf', '.txt', '.bin', '.fw'],
  COVER_WIDTH: 300,
  COVER_HEIGHT: 400,
  COVER_QUALITY: 70,
  COVER_MAX_SIZE: 30 * 1024,               // 30KB
  SN_PATTERN: /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/,
  RATE_LIMIT_WINDOW_MS: 60 * 1000,
  RATE_LIMIT_MAX: 30,
};

module.exports = CONFIG;
