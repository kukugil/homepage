const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const CONFIG = require('../config');
const db = require('../db');
const { ensureDirs, bookPath, sha256File } = require('../storage');
const { regenerateManifest } = require('../manifest');
const { extractCover } = require('../cover');
const { validateSN, validateToken, rateLimiter, asyncHandler } = require('../middleware');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CONFIG.MAX_FILE_SIZE, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${CONFIG.ALLOWED_EXTENSIONS.join(', ')}`));
    }
  },
});

// POST /api/v1/books/upload
router.post('/books/upload',
  rateLimiter(),
  validateSN,
  validateToken,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const sn = req.validatedSN;
    const bookId = `b_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const format = ext === '.epub' ? 'epub' : ext === '.pdf' ? 'pdf' : 'txt';
    const title = path.basename(req.file.originalname, ext);
    await ensureDirs(sn);

    const fsp = require('fs/promises');
    const destPath = bookPath(sn, bookId);
    await fsp.writeFile(destPath, req.file.buffer);

    const checksum = await sha256File(destPath);

    extractCover(destPath, sn, bookId, format, title).catch(err =>
      console.error(`Cover extraction error for ${bookId}: ${err.message}`)
    );

    const sortOrder = db.getBooksBySn(sn).length;
    db.insertBook({
      book_id: bookId, sn, title,
      author: '', file_size: req.file.size, format,
      checksum, metadata_version: 1, sort_order: sortOrder,
    });

    await regenerateManifest(sn);

    res.json({
      book_id: bookId,
      title,
      author: '',
      file_size: req.file.size,
      format,
      checksum: `sha256:${checksum}`,
      cover_url: `/dl/${sn}/covers/${bookId}.jpg`,
      download_url: `/dl/${sn}/books/${bookId}`,
    });
  })
);

// POST /api/v1/books/batch-upload
router.post('/books/batch-upload',
  rateLimiter(),
  validateSN,
  validateToken,
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }
    const sn = req.validatedSN;
    await ensureDirs(sn);
    const fsp = require('fs/promises');

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const file of req.files) {
      try {
        const bookId = `b_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
        const ext = path.extname(file.originalname).toLowerCase();
        const format = ext === '.epub' ? 'epub' : ext === '.pdf' ? 'pdf' : 'txt';
        const title = path.basename(file.originalname, ext);
        const destPath = bookPath(sn, bookId);
        await fsp.writeFile(destPath, file.buffer);
        const checksum = await sha256File(destPath);

        extractCover(destPath, sn, bookId, format, title).catch(err =>
          console.error(`Cover extraction error for ${bookId}: ${err.message}`)
        );

        const sortOrder = db.getBooksBySn(sn).length;
        db.insertBook({
          book_id: bookId, sn, title, author: '', file_size: file.size,
          format, checksum, metadata_version: 1, sort_order: sortOrder,
        });

        results.push({ filename: file.originalname, status: 'ok', book_id: bookId });
        successCount++;
      } catch (err) {
        results.push({ filename: file.originalname, status: 'error', reason: err.message });
        failCount++;
      }
    }

    await regenerateManifest(sn);
    res.json({ results, success_count: successCount, fail_count: failCount });
  })
);

module.exports = router;
