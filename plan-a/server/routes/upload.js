const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const CONFIG = require('../config');
const db = require('../db');
const { ensureDirs, bookPath, sha256File } = require('../storage');
const { regenerateManifest } = require('../manifest');
const { extractCover } = require('../cover');
const { validateSN, rateLimiter, asyncHandler } = require('../middleware');

const router = express.Router();

// Fix double-encoded UTF-8 filenames from multer/busboy.
// Busboy may interpret UTF-8 bytes of the Content-Disposition filename as Latin-1,
// causing mojibake when those characters are later re-encoded as UTF-8.
function fixFilenameEncoding(str) {
  if (!str || /^[\x00-\x7F]*$/.test(str)) return str || '';
  if (/[一-鿿㐀-䶿぀-ゟ゠-ヿ]/.test(str)) return str;
  const fixed = Buffer.from(str, 'latin1').toString('utf8');
  return /[一-鿿]/.test(fixed) ? fixed : str;
}

const uploadDir = path.join(CONFIG.STORAGE_ROOT, 'tmp');

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      require('fs').mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      cb(null, unique + path.extname(file.originalname));
    },
  }),
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

/**
 * @openapi
 * /api/v1/books/upload:
 *   post:
 *     tags: [Books]
 *     summary: 上传单本图书
 *     description: 上传一本图书文件（epub/pdf/txt），自动提取封面并注册到设备。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [sn, file]
 *             properties:
 *               sn:
 *                 type: string
 *                 description: 设备序列号
 *                 example: 'SN001'
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 图书文件（epub/pdf/txt，最大 500MB）
 *     responses:
 *       200:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResult'
 *       400:
 *         description: 参数错误（缺少文件或 SN 无效）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未授权（TOKEN_AUTH 模式）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       413:
 *         description: 文件过大
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: 请求过于频繁
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/books/upload',
  rateLimiter(),
  upload.single('file'),
  validateSN,
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const sn = req.validatedSN;
    const bookId = `b_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const ext = path.extname(req.file.originalname).toLowerCase();
    const format = ext === '.epub' ? 'epub' : ext === '.pdf' ? 'pdf' : 'txt';
    const title = fixFilenameEncoding(path.basename(req.file.originalname, ext));
    const filename = `${bookId}.${format}`;
    await ensureDirs(sn);

    const fsp = require('fs/promises');
    const destPath = bookPath(sn, bookId, format);
    await fsp.copyFile(req.file.path, destPath);
    await fsp.unlink(req.file.path).catch(() => {});

    const checksum = await sha256File(destPath);

    extractCover(destPath, sn, bookId, format, title).catch(err =>
      console.error(`Cover extraction error for ${bookId}: ${err.message}`)
    );

    const sortOrder = db.getBooksBySn(sn).length;
    db.insertBook({
      book_id: bookId, sn, title, filename,
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
      download_url: `/dl/${sn}/books/${bookId}.${format}`,
    });
  })
);

/**
 * @openapi
 * /api/v1/books/batch-upload:
 *   post:
 *     tags: [Books]
 *     summary: 批量上传图书
 *     description: 一次上传最多 10 本图书文件，逐本处理并分别返回结果。
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [sn, files]
 *             properties:
 *               sn:
 *                 type: string
 *                 description: 设备序列号
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: 图书文件列表（最多 10 个）
 *     responses:
 *       200:
 *         description: 批量处理完成
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename: { type: string }
 *                       status: { type: string, enum: [ok, error] }
 *                       book_id: { type: string }
 *                       reason: { type: string }
 *                 success_count: { type: integer }
 *                 fail_count: { type: integer }
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: 请求过于频繁
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/books/batch-upload',
  rateLimiter(),
  upload.array('files', 10),
  validateSN,
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
        const title = fixFilenameEncoding(path.basename(file.originalname, ext));
        const filename = `${bookId}.${format}`;
        const destPath = bookPath(sn, bookId, format);
        await fsp.copyFile(file.path, destPath);
        await fsp.unlink(file.path).catch(() => {});
        const checksum = await sha256File(destPath);

        extractCover(destPath, sn, bookId, format, title).catch(err =>
          console.error(`Cover extraction error for ${bookId}: ${err.message}`)
        );

        const sortOrder = db.getBooksBySn(sn).length;
        db.insertBook({
          book_id: bookId, sn, title, filename, author: '', file_size: file.size,
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
